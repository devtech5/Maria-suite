import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";

import { clePoste, motifRefusLibellePoste, normaliserLibellePoste, selectionPostes } from "./postes";
import { affectationsPostes, employees, postes } from "./schema";

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

/**
 * Tous les postes, retirés compris, avec le nombre de salariés en poste qui
 * les occupent — à titre principal ou non : une personne qui tient deux
 * postes compte dans les deux.
 */
export async function listerPostes(organizationId: string): Promise<LignePoste[]> {
  const occupants = db
    .select({
      posteId: affectationsPostes.posteId,
      nombre: sql<number>`count(distinct ${affectationsPostes.employeeId})::int`.as("nombre"),
    })
    .from(affectationsPostes)
    .innerJoin(employees, eq(employees.id, affectationsPostes.employeeId))
    .where(
      and(
        eq(affectationsPostes.organizationId, organizationId),
        isNull(affectationsPostes.deletedAt),
        eq(employees.actif, true),
        isNull(employees.deletedAt),
      ),
    )
    .groupBy(affectationsPostes.posteId)
    .as("occupants");

  return db
    .select({
      id: postes.id,
      libelle: postes.libelle,
      actif: postes.actif,
      occupants: sql<number>`coalesce(${occupants.nombre}, 0)::int`,
    })
    .from(postes)
    .leftJoin(occupants, eq(occupants.posteId, postes.id))
    .where(and(eq(postes.organizationId, organizationId), isNull(postes.deletedAt)))
    .orderBy(sql`${postes.actif} desc`, asc(postes.ordre), asc(postes.libelle));
}

/** Les postes d'un salarié, principal en tête. */
export async function postesDuSalarie(organizationId: string, employeeId: string): Promise<string[]> {
  const lignes = await db
    .select({ libelle: postes.libelle })
    .from(affectationsPostes)
    .innerJoin(postes, eq(postes.id, affectationsPostes.posteId))
    .where(
      and(
        eq(affectationsPostes.organizationId, organizationId),
        eq(affectationsPostes.employeeId, employeeId),
        isNull(affectationsPostes.deletedAt),
      ),
    )
    .orderBy(desc(affectationsPostes.principal), asc(postes.ordre), asc(postes.libelle));
  return lignes.map((l) => l.libelle);
}

/** Les postes de chaque salarié de l'entreprise, principal en tête : pour les listes. */
export async function postesParSalarie(organizationId: string): Promise<Map<string, string[]>> {
  const lignes = await db
    .select({ employeeId: affectationsPostes.employeeId, libelle: postes.libelle })
    .from(affectationsPostes)
    .innerJoin(postes, eq(postes.id, affectationsPostes.posteId))
    .where(and(eq(affectationsPostes.organizationId, organizationId), isNull(affectationsPostes.deletedAt)))
    .orderBy(desc(affectationsPostes.principal), asc(postes.ordre), asc(postes.libelle));
  const parSalarie = new Map<string, string[]>();
  for (const l of lignes) parSalarie.set(l.employeeId, [...(parSalarie.get(l.employeeId) ?? []), l.libelle]);
  return parSalarie;
}

/**
 * Donne à un salarié ses postes, dans la transaction qui écrit sa fiche : le
 * premier est le principal, recopié dans `employees.poste`, les suivants
 * s'y ajoutent. Les postes qu'il n'a plus sont retirés (logiquement), ceux
 * qu'il retrouve sont ranimés.
 *
 * Les libellés sont supposés validés par l'appelant (`postesRetenus`). Un
 * libellé absent du référentiel n'est créé que sur demande (`creerManquants`)
 * — reprise de l'existant, jeux de démonstration — sinon il est refusé.
 */
export async function affecterPostesDans(
  tx: Transaction,
  organizationId: string,
  employeeId: string,
  libelles: readonly string[],
  options: { creerManquants?: boolean } = {},
): Promise<string[]> {
  const voulus = selectionPostes(libelles[0] ?? "", libelles.slice(1));
  if (voulus.length === 0) throw new Error("Un salarié occupe au moins un poste.");

  const referentiel = await tx
    .select({ id: postes.id, libelle: postes.libelle, ordre: postes.ordre })
    .from(postes)
    .where(and(eq(postes.organizationId, organizationId), isNull(postes.deletedAt)));
  const ids: { id: string; libelle: string }[] = [];
  for (const voulu of voulus) {
    let trouve = referentiel.find((p) => clePoste(p.libelle) === clePoste(voulu));
    if (!trouve) {
      if (!options.creerManquants) throw new Error(`Poste inconnu : « ${voulu} ». Il s'ajoute dans l'onglet Postes.`);
      const id = newId();
      const ordre = Math.max(0, ...referentiel.map((p) => p.ordre)) + 1;
      await tx.insert(postes).values({ id, organizationId, libelle: voulu, ordre });
      trouve = { id, libelle: voulu, ordre };
      referentiel.push(trouve);
    }
    if (!ids.some((x) => x.id === trouve.id)) ids.push({ id: trouve.id, libelle: trouve.libelle });
  }

  const maintenant = new Date();
  // Le principal se libère d'abord : l'index unique n'en tolère qu'un.
  await tx
    .update(affectationsPostes)
    .set({ principal: false, updatedAt: maintenant, version: sql`${affectationsPostes.version} + 1` })
    .where(and(eq(affectationsPostes.employeeId, employeeId), eq(affectationsPostes.principal, true)));
  await tx
    .update(affectationsPostes)
    .set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${affectationsPostes.version} + 1` })
    .where(
      and(
        eq(affectationsPostes.employeeId, employeeId),
        isNull(affectationsPostes.deletedAt),
        sql`${affectationsPostes.posteId} NOT IN (${sql.join(
          ids.map((x) => sql`${x.id}`),
          sql`, `,
        )})`,
      ),
    );
  for (const [rang, { id: posteId }] of ids.entries()) {
    await tx
      .insert(affectationsPostes)
      .values({ id: newId(), organizationId, employeeId, posteId, principal: rang === 0 })
      .onConflictDoUpdate({
        target: [affectationsPostes.employeeId, affectationsPostes.posteId],
        set: {
          principal: rang === 0,
          deletedAt: null,
          updatedAt: maintenant,
          version: sql`${affectationsPostes.version} + 1`,
        },
      });
  }
  await tx
    .update(employees)
    .set({ poste: ids[0].libelle })
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)));
  return ids.map((x) => x.libelle);
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
