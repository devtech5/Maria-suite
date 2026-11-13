import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, memberships } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { employees, workers } from "@/modules/personnes/schema";

import type { Acteur } from "./calcul";
import { valeurRef, type RefIntervenant } from "./intervenants-regles";
import { taches, tachesIntervenants } from "./schema";

export interface IntervenantVue {
  /** `e:<collaborateur>` ou `w:<intervenant>`. */
  ref: string;
  nom: string;
  /** Poste du collaborateur, qualification de l'intervenant. */
  detail: string;
  nature: "collaborateur" | "intervenant";
  /** Compte du collaborateur, s'il en a un. */
  userId: string | null;
}

/** Intervenants des tâches données, par tâche, dans l'ordre d'ajout. */
export async function intervenantsDe(organizationId: string, tacheIds: string[]): Promise<Map<string, IntervenantVue[]>> {
  const parTache = new Map<string, IntervenantVue[]>();
  if (tacheIds.length === 0) return parTache;
  const lignes = await db
    .select({
      tacheId: tachesIntervenants.tacheId,
      employeId: tachesIntervenants.employeeId,
      workerId: tachesIntervenants.workerId,
      nomEmploye: employees.nom,
      poste: employees.poste,
      userId: employees.userId,
      nomWorker: workers.nom,
      qualification: workers.qualification,
    })
    .from(tachesIntervenants)
    .leftJoin(employees, eq(employees.id, tachesIntervenants.employeeId))
    .leftJoin(workers, eq(workers.id, tachesIntervenants.workerId))
    .where(
      and(
        eq(tachesIntervenants.organizationId, organizationId),
        inArray(tachesIntervenants.tacheId, tacheIds),
        isNull(tachesIntervenants.deletedAt),
      ),
    )
    .orderBy(tachesIntervenants.createdAt);
  for (const l of lignes) {
    const vue: IntervenantVue = l.employeId
      ? { ref: `e:${l.employeId}`, nom: l.nomEmploye ?? "Ancien collaborateur", detail: l.poste ?? "", nature: "collaborateur", userId: l.userId }
      : { ref: `w:${l.workerId}`, nom: l.nomWorker ?? "Ancien intervenant", detail: l.qualification ?? "", nature: "intervenant", userId: null };
    parTache.set(l.tacheId, [...(parTache.get(l.tacheId) ?? []), vue]);
  }
  return parTache;
}

/** Les intervenants en activité, par nom, avec leur qualification : ceux qu'on peut ajouter. */
export async function intervenantsActifs(organizationId: string): Promise<{ id: string; nom: string; qualification: string }[]> {
  return db
    .select({ id: workers.id, nom: workers.nom, qualification: workers.qualification })
    .from(workers)
    .where(and(eq(workers.organizationId, organizationId), eq(workers.actif, true), isNull(workers.deletedAt)))
    .orderBy(workers.nom);
}

async function tacheGeree(tx: Transaction, organizationId: string, tacheId: string, acteur: Acteur) {
  const [tache] = await tx
    .select({ numero: taches.numero, titre: taches.titre, statut: taches.statut, creeParUserId: taches.creeParUserId })
    .from(taches)
    .where(and(eq(taches.id, tacheId), eq(taches.organizationId, organizationId), isNull(taches.deletedAt)))
    .for("update");
  if (!tache) throw new Error("Tâche introuvable.");
  if (!acteur.attribue && tache.creeParUserId !== acteur.userId) {
    throw new Error("Seul le créateur de la tâche, ou qui attribue les tâches, choisit ses intervenants.");
  }
  if (tache.statut === "terminee" || tache.statut === "annulee") throw new Error(`${tache.numero} est close : rouvrez-la pour changer ses intervenants.`);
  return tache;
}

/** La personne désignée, si elle est bien de l'entreprise et en activité. */
async function personne(tx: Transaction, organizationId: string, ref: RefIntervenant): Promise<{ nom: string; userId: string | null }> {
  if ("employeId" in ref) {
    const [e] = await tx
      .select({ nom: employees.nom, userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.id, ref.employeId), eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt)));
    if (!e) throw new Error("Ce collaborateur ne figure pas, ou plus, au Personnel.");
    if (!e.userId) return { nom: e.nom, userId: null };
    // Seul un compte encore actif reçoit la tâche dans sa liste et dans sa cloche.
    const [m] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, e.userId), eq(memberships.status, "actif")));
    return { nom: e.nom, userId: m ? e.userId : null };
  }
  const [w] = await tx
    .select({ nom: workers.nom })
    .from(workers)
    .where(and(eq(workers.id, ref.workerId), eq(workers.organizationId, organizationId), eq(workers.actif, true), isNull(workers.deletedAt)));
  if (!w) throw new Error("Cet intervenant ne figure pas, ou plus, parmi les intervenants actifs.");
  return { nom: w.nom, userId: null };
}

const condition = (ref: RefIntervenant) =>
  "employeId" in ref ? eq(tachesIntervenants.employeeId, ref.employeId) : eq(tachesIntervenants.workerId, ref.workerId);

/**
 * Ajoute un intervenant à une tâche. Déjà présent : rien ne change. Retiré
 * autrefois : il revient sur la même ligne. Rend le compte à prévenir, s'il
 * y en a un et que ce n'est pas l'auteur du geste.
 */
export async function ajouterIntervenantDans(
  tx: Transaction,
  organizationId: string,
  tacheId: string,
  ref: RefIntervenant,
  acteur: Acteur,
  tacheVerifiee = false,
): Promise<{ numero: string; titre: string; nom: string; aPrevenir: string | null; ajoute: boolean }> {
  const tache = tacheVerifiee
    ? (await tx.select({ numero: taches.numero, titre: taches.titre }).from(taches).where(eq(taches.id, tacheId)))[0]
    : await tacheGeree(tx, organizationId, tacheId, acteur);
  const qui = await personne(tx, organizationId, ref);

  const [existante] = await tx
    .select({ id: tachesIntervenants.id, deletedAt: tachesIntervenants.deletedAt })
    .from(tachesIntervenants)
    .where(and(eq(tachesIntervenants.tacheId, tacheId), condition(ref)));
  if (existante && !existante.deletedAt) return { numero: tache.numero, titre: tache.titre, nom: qui.nom, aPrevenir: null, ajoute: false };

  const maintenant = new Date();
  if (existante) {
    await tx
      .update(tachesIntervenants)
      .set({ deletedAt: null, ajouteParUserId: acteur.userId, updatedAt: maintenant, version: sql`${tachesIntervenants.version} + 1` })
      .where(eq(tachesIntervenants.id, existante.id));
  } else {
    await tx.insert(tachesIntervenants).values({
      id: newId(),
      organizationId,
      tacheId,
      employeeId: "employeId" in ref ? ref.employeId : null,
      workerId: "workerId" in ref ? ref.workerId : null,
      ajouteParUserId: acteur.userId,
    });
  }
  await tx.update(taches).set({ updatedAt: maintenant, version: sql`${taches.version} + 1` }).where(eq(taches.id, tacheId));
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId: acteur.userId,
    action: "tache.intervenant.ajouter",
    entityType: "tache",
    entityId: tacheId,
    after: { numero: tache.numero, intervenant: valeurRef(ref), nom: qui.nom },
  });
  return { numero: tache.numero, titre: tache.titre, nom: qui.nom, aPrevenir: qui.userId !== acteur.userId ? qui.userId : null, ajoute: true };
}

/** Retire un intervenant de la tâche. Logique : la ligne reste, avec sa trace. */
export async function retirerIntervenantDans(
  tx: Transaction,
  organizationId: string,
  tacheId: string,
  ref: RefIntervenant,
  acteur: Acteur,
): Promise<{ numero: string }> {
  const tache = await tacheGeree(tx, organizationId, tacheId, acteur);
  const maintenant = new Date();
  const retires = await tx
    .update(tachesIntervenants)
    .set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${tachesIntervenants.version} + 1` })
    .where(and(eq(tachesIntervenants.tacheId, tacheId), condition(ref), isNull(tachesIntervenants.deletedAt)))
    .returning({ id: tachesIntervenants.id });
  if (retires.length === 0) return { numero: tache.numero };
  await tx.update(taches).set({ updatedAt: maintenant, version: sql`${taches.version} + 1` }).where(eq(taches.id, tacheId));
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId: acteur.userId,
    action: "tache.intervenant.retirer",
    entityType: "tache",
    entityId: tacheId,
    before: { numero: tache.numero, intervenant: valeurRef(ref) },
  });
  return { numero: tache.numero };
}

/** Vrai si ce compte est intervenant de la tâche, par sa fiche du Personnel. */
export async function estIntervenant(tx: Transaction, tacheId: string, userId: string): Promise<boolean> {
  const [ligne] = await tx
    .select({ id: tachesIntervenants.id })
    .from(tachesIntervenants)
    .innerJoin(employees, eq(employees.id, tachesIntervenants.employeeId))
    .where(and(eq(tachesIntervenants.tacheId, tacheId), isNull(tachesIntervenants.deletedAt), eq(employees.userId, userId)));
  return Boolean(ligne);
}
