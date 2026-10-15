import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { employees } from "@/modules/personnes/schema";

import { coutMoyenUnitaire, etatFourniture, refusSortie, stocks, type EtatFourniture } from "./calcul";
import { fournitures, mouvementsFournitures, type SensMouvementFourniture } from "./schema";

/**
 * Fournitures de bureau : le catalogue du placard et ses mouvements.
 *
 * Toute écriture se fait dans une transaction qui trace son geste. Une sortie
 * verrouille d'abord la fiche de la fourniture : deux remises simultanées du
 * dernier carton ne doivent pas passer toutes les deux.
 */

export interface NouvelleFourniture {
  designation: string;
  unite?: string | null;
  seuil?: number;
}

export async function creerFourniturePour(organizationId: string, userId: string, donnees: NouvelleFourniture): Promise<{ id: string }> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(fournitures).values({
      id,
      organizationId,
      designation: donnees.designation.trim(),
      unite: donnees.unite?.trim() || "unité",
      seuil: donnees.seuil ?? 0,
    });
    await tracer(tx, organizationId, userId, "fourniture.creer", id, { designation: donnees.designation });
  });
  return { id };
}

export interface NouveauMouvement {
  fournitureId: string;
  sens: SensMouvementFourniture;
  quantite: number;
  date: string;
  /** Coût total d'une entrée, en francs. Ignoré sur une sortie. */
  cout?: number | null;
  employeId?: string | null;
  service?: string | null;
  note?: string | null;
}

export async function enregistrerMouvementPour(organizationId: string, userId: string, m: NouveauMouvement): Promise<{ id: string }> {
  if (!Number.isInteger(m.quantite) || m.quantite <= 0) throw new Error("La quantité doit être un nombre entier positif.");
  const id = newId();

  await db.transaction(async (tx) => {
    // Verrou sur la fiche : les sorties d'une même fourniture passent l'une après l'autre.
    const [fiche] = await tx
      .select({ id: fournitures.id, unite: fournitures.unite, designation: fournitures.designation })
      .from(fournitures)
      .where(and(eq(fournitures.organizationId, organizationId), eq(fournitures.id, m.fournitureId), isNull(fournitures.deletedAt)))
      .for("update");
    if (!fiche) throw new Error("Fourniture introuvable.");

    if (m.employeId) {
      const [salarie] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.organizationId, organizationId), eq(employees.id, m.employeId)));
      if (!salarie) throw new Error("Salarié introuvable.");
    }

    if (m.sens === "sortie") {
      const [{ stock }] = await tx
        .select({
          stock: sql<number>`coalesce(sum(case when ${mouvementsFournitures.sens} = 'entree' then ${mouvementsFournitures.quantite} else -${mouvementsFournitures.quantite} end), 0)::int`,
        })
        .from(mouvementsFournitures)
        .where(and(eq(mouvementsFournitures.organizationId, organizationId), eq(mouvementsFournitures.fournitureId, m.fournitureId), isNull(mouvementsFournitures.deletedAt)));
      const refus = refusSortie(Number(stock), m.quantite, fiche.unite);
      if (refus) throw new Error(refus);
    }

    await tx.insert(mouvementsFournitures).values({
      id,
      organizationId,
      fournitureId: m.fournitureId,
      sens: m.sens,
      quantite: m.quantite,
      date: m.date,
      cout: m.sens === "entree" ? (m.cout ?? null) : null,
      employeId: m.sens === "sortie" ? (m.employeId ?? null) : null,
      service: m.sens === "sortie" ? m.service?.trim() || null : null,
      note: m.note?.trim() || null,
      userId,
    });
    await tracer(tx, organizationId, userId, m.sens === "entree" ? "fourniture.entree" : "fourniture.sortie", id, {
      fourniture: fiche.designation,
      quantite: m.quantite,
    });
  });

  return { id };
}

async function tracer(tx: Transaction, organizationId: string, userId: string, action: string, entityId: string, after: unknown) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "fourniture", entityId, after });
}

// ------------------------------------------------------------------ lecture

export interface FournitureSuivie {
  id: string;
  designation: string;
  unite: string;
  seuil: number;
  stock: number;
  etat: EtatFourniture;
  coutMoyen: number | null;
}

/** Le catalogue avec son stock, ce qui manque en tête. */
export async function listerFournitures(organizationId: string): Promise<FournitureSuivie[]> {
  const [liste, mouvements] = await Promise.all([
    db
      .select()
      .from(fournitures)
      .where(and(eq(fournitures.organizationId, organizationId), eq(fournitures.actif, true), isNull(fournitures.deletedAt)))
      .orderBy(asc(fournitures.designation)),
    db
      .select({ fournitureId: mouvementsFournitures.fournitureId, sens: mouvementsFournitures.sens, quantite: mouvementsFournitures.quantite, cout: mouvementsFournitures.cout })
      .from(mouvementsFournitures)
      .where(and(eq(mouvementsFournitures.organizationId, organizationId), isNull(mouvementsFournitures.deletedAt))),
  ]);
  const parStock = stocks(mouvements);
  const ordre: Record<EtatFourniture, number> = { rupture: 0, a_racheter: 1, suffisant: 2 };
  return liste
    .map((f) => {
      const stock = parStock.get(f.id) ?? 0;
      return {
        id: f.id,
        designation: f.designation,
        unite: f.unite,
        seuil: f.seuil,
        stock,
        etat: etatFourniture(stock, f.seuil),
        coutMoyen: coutMoyenUnitaire(mouvements.filter((m) => m.fournitureId === f.id)),
      };
    })
    .sort((a, b) => ordre[a.etat] - ordre[b.etat] || a.designation.localeCompare(b.designation));
}

export interface LigneMouvement {
  id: string;
  date: string;
  sens: SensMouvementFourniture;
  quantite: number;
  cout: number | null;
  fourniture: string;
  unite: string;
  beneficiaire: string | null;
  service: string | null;
  note: string | null;
}

/** Les derniers mouvements, du plus récent au plus ancien. */
export async function derniersMouvements(organizationId: string, limite = 200): Promise<LigneMouvement[]> {
  const lignes = await db
    .select({
      id: mouvementsFournitures.id,
      date: mouvementsFournitures.date,
      sens: mouvementsFournitures.sens,
      quantite: mouvementsFournitures.quantite,
      cout: mouvementsFournitures.cout,
      fourniture: fournitures.designation,
      unite: fournitures.unite,
      beneficiaire: employees.nom,
      service: mouvementsFournitures.service,
      note: mouvementsFournitures.note,
    })
    .from(mouvementsFournitures)
    .innerJoin(fournitures, eq(fournitures.id, mouvementsFournitures.fournitureId))
    .leftJoin(employees, eq(employees.id, mouvementsFournitures.employeId))
    .where(and(eq(mouvementsFournitures.organizationId, organizationId), isNull(mouvementsFournitures.deletedAt)))
    .orderBy(desc(mouvementsFournitures.date), desc(mouvementsFournitures.createdAt))
    .limit(limite);
  return lignes;
}
