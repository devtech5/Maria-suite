import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";

import { clePoste, motifRefusLibellePoste, normaliserLibellePoste } from "./postes";
import { employees, postes } from "./schema";

/**
 * Référentiel des postes de travail, côté base. Règles de libellé dans
 * `postes.ts`, sans base.
 */

export interface LignePoste {
  id: string;
  libelle: string;
  actif: boolean;
  /** Salariés en poste qui l'occupent. */
  occupants: number;
}

/** Les postes proposés au choix, dans leur ordre. */
export async function postesActifs(organizationId: string): Promise<string[]> {
  const lignes = await db
    .select({ libelle: postes.libelle })
    .from(postes)
    .where(and(eq(postes.organizationId, organizationId), eq(postes.actif, true), isNull(postes.deletedAt)))
    .orderBy(asc(postes.ordre), asc(postes.libelle));
  return lignes.map((l) => l.libelle);
}

/** Tous les postes, retirés compris, avec le nombre de salariés en poste qui les occupent. */
export async function listerPostes(organizationId: string): Promise<LignePoste[]> {
  const occupants = db
    .select({ cle: sql<string>`lower(${employees.poste})`.as("cle"), nombre: sql<number>`count(*)::int`.as("nombre") })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt)))
    .groupBy(sql`lower(${employees.poste})`)
    .as("occupants");

  return db
    .select({
      id: postes.id,
      libelle: postes.libelle,
      actif: postes.actif,
      occupants: sql<number>`coalesce(${occupants.nombre}, 0)::int`,
    })
    .from(postes)
    .leftJoin(occupants, eq(occupants.cle, sql`lower(${postes.libelle})`))
    .where(and(eq(postes.organizationId, organizationId), isNull(postes.deletedAt)))
    .orderBy(sql`${postes.actif} desc`, asc(postes.ordre), asc(postes.libelle));
}

async function libellesExistants(organizationId: string, saufId?: string): Promise<string[]> {
  const lignes = await db
    .select({ id: postes.id, libelle: postes.libelle })
    .from(postes)
    .where(and(eq(postes.organizationId, organizationId), isNull(postes.deletedAt)));
  return lignes.filter((l) => l.id !== saufId).map((l) => l.libelle);
}

/** Ajoute un poste en fin de liste. */
export async function ajouterPostePour(organizationId: string, userId: string, saisie: string): Promise<string> {
  const libelle = normaliserLibellePoste(saisie);
  const refus = motifRefusLibellePoste(libelle, await libellesExistants(organizationId));
  if (refus) throw new Error(refus);

  const id = newId();
  await db.insert(postes).values({
    id,
    organizationId,
    libelle,
    ordre: sql`(select coalesce(max(${postes.ordre}), 0) + 1 from ${postes} where ${postes.organizationId} = ${organizationId})`,
  });
  await tracerPour(organizationId, userId, { action: "poste.cree", entite: "poste", entiteId: id, apres: { libelle } });
  return libelle;
}

/**
 * Renomme un poste, et les fiches des salariés qui le portent avec lui, dans
 * la même transaction : un poste renommé à moitié laisserait des salariés sur
 * un intitulé qu'on ne peut plus choisir.
 */
export async function renommerPostePour(
  organizationId: string,
  userId: string,
  posteId: string,
  saisie: string,
): Promise<{ libelle: string; fiches: number }> {
  const libelle = normaliserLibellePoste(saisie);
  const resultat = await db.transaction(async (tx) => {
    const [poste] = await tx
      .select({ libelle: postes.libelle })
      .from(postes)
      .where(and(eq(postes.organizationId, organizationId), eq(postes.id, posteId), isNull(postes.deletedAt)));
    if (!poste) throw new Error("Poste introuvable.");
    if (poste.libelle === libelle) return { ancien: poste.libelle, fiches: 0 };

    const autres = await tx
      .select({ libelle: postes.libelle })
      .from(postes)
      .where(and(eq(postes.organizationId, organizationId), isNull(postes.deletedAt), sql`${postes.id} <> ${posteId}`));
    const refus = motifRefusLibellePoste(libelle, autres.map((a) => a.libelle));
    if (refus) throw new Error(refus);

    await tx
      .update(postes)
      .set({ libelle, updatedAt: new Date(), version: sql`${postes.version} + 1` })
      .where(and(eq(postes.organizationId, organizationId), eq(postes.id, posteId)));
    const fiches = await tx
      .update(employees)
      .set({ poste: libelle, updatedAt: new Date(), version: sql`${employees.version} + 1` })
      .where(
        and(
          eq(employees.organizationId, organizationId),
          isNull(employees.deletedAt),
          sql`lower(${employees.poste}) = ${clePoste(poste.libelle)}`,
        ),
      )
      .returning({ id: employees.id });
    return { ancien: poste.libelle, fiches: fiches.length };
  });

  if (resultat.ancien !== libelle) {
    await tracerPour(organizationId, userId, {
      action: "poste.renomme",
      entite: "poste",
      entiteId: posteId,
      avant: { libelle: resultat.ancien },
      apres: { libelle, fiches: resultat.fiches },
    });
  }
  return { libelle, fiches: resultat.fiches };
}

/**
 * Retire un poste de la liste de choix, ou l'y remet. Les salariés qui
 * l'occupent le gardent sur leur fiche.
 */
export async function basculerPostePour(organizationId: string, userId: string, posteId: string, actif: boolean): Promise<void> {
  const [modifie] = await db
    .update(postes)
    .set({ actif, updatedAt: new Date(), version: sql`${postes.version} + 1` })
    .where(and(eq(postes.organizationId, organizationId), eq(postes.id, posteId), isNull(postes.deletedAt)))
    .returning({ libelle: postes.libelle });
  if (!modifie) throw new Error("Poste introuvable.");
  await tracerPour(organizationId, userId, {
    action: actif ? "poste.retabli" : "poste.retire",
    entite: "poste",
    entiteId: posteId,
    apres: { libelle: modifie.libelle },
  });
}
