import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { jourLocal } from "@/modules/presences/calcul";

import { courriers, type Courrier } from "./schema";

/** Ce que la personne saisit. Le numéro, lui, ne se saisit jamais. */
export interface SaisieCourrier {
  lieu: string;
  /** `AAAA-MM-JJ`. */
  dateCourrier: string;
  destinataire: string | null;
  objet: string;
  corps: string;
  signataire: string;
  fonction: string | null;
}

function nettoyer(saisie: SaisieCourrier) {
  return {
    lieu: saisie.lieu.trim(),
    dateCourrier: saisie.dateCourrier,
    destinataire: saisie.destinataire?.trim() || null,
    objet: saisie.objet.trim(),
    corps: saisie.corps.trim(),
    signataire: saisie.signataire.trim(),
    fonction: saisie.fonction?.trim() || null,
  };
}

/** Jour en cours dans le fuseau de l'entreprise : c'est lui qui fixe l'exercice du numéro. */
async function jourDeLEntreprise(executant: Transaction | typeof db, organizationId: string): Promise<string> {
  const [o] = await executant
    .select({ fuseau: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return jourLocal(new Date(), o?.fuseau);
}

/**
 * Enregistre un courrier et lui attribue son numéro, dans la même transaction.
 *
 * Le compteur est annuel (COUR-2026-00001, puis COUR-2027-00001), sur l'année
 * de la SAISIE dans le fuseau de l'entreprise et non sur la date portée par
 * la lettre : un courrier antidaté ne doit pas reprendre un numéro d'une
 * année close.
 */
export async function creerCourrierDans(
  tx: Transaction,
  organizationId: string,
  saisie: SaisieCourrier,
  userId?: string,
): Promise<{ id: string; numero: string }> {
  const valeurs = nettoyer(saisie);
  const exercice = (await jourDeLEntreprise(tx, organizationId)).slice(0, 4);
  const numero = await prochainNumero(tx, organizationId, {
    cle: "courrier",
    prefix: `COUR-${exercice}-`,
    padding: 5,
    periode: exercice,
  });

  const id = newId();
  await tx.insert(courriers).values({
    id,
    organizationId,
    numero,
    ...valeurs,
    redigeParUserId: userId ?? null,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "courrier.rediger",
      entityType: "courrier",
      entityId: id,
      after: { numero, objet: valeurs.objet, date: valeurs.dateCourrier },
    });
  }

  return { id, numero };
}

/**
 * Corrige un courrier. Le numéro ne bouge pas : c'est la même lettre.
 *
 * La trace garde l'avant et l'après de ce qui a changé — une lettre officielle
 * corrigée après envoi doit pouvoir se reconstituer telle qu'elle est partie.
 */
export async function modifierCourrierDans(
  tx: Transaction,
  organizationId: string,
  courrierId: string,
  saisie: SaisieCourrier,
  userId?: string,
): Promise<{ numero: string } | null> {
  const [avant] = await tx
    .select()
    .from(courriers)
    .where(
      and(
        eq(courriers.id, courrierId),
        eq(courriers.organizationId, organizationId),
        isNull(courriers.deletedAt),
      ),
    )
    .for("update");
  if (!avant) return null;

  const valeurs = nettoyer(saisie);
  await tx
    .update(courriers)
    .set({ ...valeurs, updatedAt: new Date(), version: sql`${courriers.version} + 1` })
    .where(and(eq(courriers.id, courrierId), eq(courriers.organizationId, organizationId)));

  const champs = Object.keys(valeurs) as (keyof typeof valeurs)[];
  const modifies = champs.filter((champ) => avant[champ] !== valeurs[champ]);

  if (userId && modifies.length > 0) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "courrier.modifier",
      entityType: "courrier",
      entityId: courrierId,
      before: Object.fromEntries(modifies.map((champ) => [champ, avant[champ]])),
      after: Object.fromEntries(modifies.map((champ) => [champ, valeurs[champ]])),
    });
  }

  return { numero: avant.numero };
}

/**
 * Retire un courrier. Suppression LOGIQUE : la ligne garde son numéro, si
 * bien que la suite reste sans trou et qu'aucun autre courrier ne le reprend.
 */
export async function supprimerCourrierDans(
  tx: Transaction,
  organizationId: string,
  courrierId: string,
  userId?: string,
): Promise<boolean> {
  const [retire] = await tx
    .update(courriers)
    .set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${courriers.version} + 1` })
    .where(
      and(
        eq(courriers.id, courrierId),
        eq(courriers.organizationId, organizationId),
        isNull(courriers.deletedAt),
      ),
    )
    .returning({ numero: courriers.numero, objet: courriers.objet });
  if (!retire) return false;

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "courrier.supprimer",
      entityType: "courrier",
      entityId: courrierId,
      before: retire,
    });
  }
  return true;
}

// ------------------------------------------------------------------ lecture

export type LigneCourrier = Pick<Courrier, "id" | "numero" | "dateCourrier" | "objet" | "destinataire" | "signataire">;

export async function listerCourriers(organizationId: string): Promise<LigneCourrier[]> {
  return db
    .select({
      id: courriers.id,
      numero: courriers.numero,
      dateCourrier: courriers.dateCourrier,
      objet: courriers.objet,
      destinataire: courriers.destinataire,
      signataire: courriers.signataire,
    })
    .from(courriers)
    .where(and(eq(courriers.organizationId, organizationId), isNull(courriers.deletedAt)))
    .orderBy(desc(courriers.dateCourrier), desc(courriers.numero));
}

export async function courrierDe(organizationId: string, courrierId: string): Promise<Courrier | null> {
  const [ligne] = await db
    .select()
    .from(courriers)
    .where(
      and(
        eq(courriers.id, courrierId),
        eq(courriers.organizationId, organizationId),
        isNull(courriers.deletedAt),
      ),
    );
  return ligne ?? null;
}

/**
 * Valeurs proposées pour un nouveau courrier : la ville de l'entreprise, le
 * jour, et le signataire du dernier courrier — c'est presque toujours le même.
 */
export async function brouillonCourrier(organizationId: string): Promise<SaisieCourrier> {
  const [[o], [dernier]] = await Promise.all([
    db
      .select({ ville: organizations.city, fuseau: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, organizationId)),
    db
      .select({ signataire: courriers.signataire, fonction: courriers.fonction, lieu: courriers.lieu })
      .from(courriers)
      .where(and(eq(courriers.organizationId, organizationId), isNull(courriers.deletedAt)))
      .orderBy(desc(courriers.createdAt))
      .limit(1),
  ]);
  return {
    lieu: dernier?.lieu ?? o?.ville ?? "Abidjan",
    dateCourrier: jourLocal(new Date(), o?.fuseau),
    destinataire: null,
    objet: "",
    corps: "",
    signataire: dernier?.signataire ?? "",
    fonction: dernier?.fonction ?? null,
  };
}
