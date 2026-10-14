import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { auditLogs, employees, memberships } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";

import { gestePermis, statutApres, type Acteur, type Geste, type Priorite } from "./calcul";
import { taches } from "./schema";

async function journaliser(
  tx: Transaction,
  organizationId: string,
  userId: string,
  action: string,
  tacheId: string,
  apres: Record<string, unknown>,
  avant?: Record<string, unknown>,
) {
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action,
    entityType: "tache",
    entityId: tacheId,
    before: avant ?? null,
    after: apres,
  });
}

async function estMembreActif(tx: Transaction, organizationId: string, userId: string): Promise<boolean> {
  const [membre] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
        eq(memberships.status, "actif"),
      ),
    );
  return Boolean(membre);
}

/** L'exécutant doit être un membre actif de l'entreprise. */
async function verifierMembre(tx: Transaction, organizationId: string, userId: string): Promise<void> {
  const [membre] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
        eq(memberships.status, "actif"),
      ),
    );
  if (!membre) throw new Error("Cette personne n'a pas d'accès actif à l'entreprise.");
}

/**
 * À qui la tâche est confiée : un salarié du Personnel, ou un compte (les
 * tâches d'avant le Personnel). Absent : la tâche est pour soi.
 */
export type Executant = { employeId: string } | { userId: string };

export interface NouvelleTache {
  titre: string;
  description?: string | null;
  priorite: Priorite;
  echeance?: string | null;
  executant?: Executant | null;
}

interface ExecutantResolu {
  assigneeUserId: string;
  assigneeEmployeId: string | null;
  /** Vrai si la tâche part chez quelqu'un d'autre que son auteur. */
  pourAutrui: boolean;
}

/**
 * Ramène l'exécutant choisi au compte qui fera avancer la tâche.
 *
 * Un salarié avec un compte actif la reçoit dans sa liste. Sans compte — ou
 * avec un accès révoqué —, c'est l'auteur qui la suit pour lui : la tâche
 * reste rattachée au salarié, mais personne d'autre ne pourrait la terminer.
 */
async function resoudreExecutant(
  tx: Transaction,
  organizationId: string,
  executant: Executant | null | undefined,
  acteur: Acteur,
): Promise<ExecutantResolu> {
  if (!executant) return { assigneeUserId: acteur.userId, assigneeEmployeId: null, pourAutrui: false };

  if ("userId" in executant) {
    if (executant.userId !== acteur.userId) await verifierMembre(tx, organizationId, executant.userId);
    return { assigneeUserId: executant.userId, assigneeEmployeId: null, pourAutrui: executant.userId !== acteur.userId };
  }

  const [salarie] = await tx
    .select({ id: employees.id, userId: employees.userId })
    .from(employees)
    .where(
      and(
        eq(employees.id, executant.employeId),
        eq(employees.organizationId, organizationId),
        eq(employees.actif, true),
        isNull(employees.deletedAt),
      ),
    );
  if (!salarie) throw new Error("Ce salarié ne figure pas, ou plus, au Personnel.");

  const compte = salarie.userId && (await estMembreActif(tx, organizationId, salarie.userId)) ? salarie.userId : null;
  return {
    assigneeUserId: compte ?? acteur.userId,
    assigneeEmployeId: salarie.id,
    pourAutrui: compte !== acteur.userId,
  };
}

/**
 * Crée une tâche. Attribuer à quelqu'un d'autre que soi exige le droit
 * d'attribuer : l'appelant le dit par `acteur.attribue`.
 */
export async function creerTacheDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleTache,
  acteur: Acteur,
): Promise<{ id: string; numero: string; assigneeUserId: string; pourAutrui: boolean }> {
  const executant = await resoudreExecutant(tx, organizationId, donnees.executant, acteur);
  if (executant.pourAutrui && !acteur.attribue) {
    throw new Error("Votre rôle ne permet pas d'attribuer une tâche à quelqu'un d'autre.");
  }
  const assignee = executant.assigneeUserId;

  const annee = String(new Date().getUTCFullYear());
  const numero = await prochainNumero(tx, organizationId, { cle: "tache", prefix: `TCH-${annee}-`, padding: 5, periode: annee });
  const id = newId();
  await tx.insert(taches).values({
    id,
    organizationId,
    numero,
    titre: donnees.titre.trim(),
    description: donnees.description?.trim() || null,
    priorite: donnees.priorite,
    echeance: donnees.echeance ?? null,
    creeParUserId: acteur.userId,
    assigneeUserId: assignee,
    assigneeEmployeId: executant.assigneeEmployeId,
  });
  await journaliser(tx, organizationId, acteur.userId, "tache.creer", id, {
    numero,
    titre: donnees.titre,
    priorite: donnees.priorite,
    echeance: donnees.echeance ?? null,
    assigneeUserId: assignee,
    assigneeEmployeId: executant.assigneeEmployeId,
  });
  if (executant.pourAutrui) {
    await journaliser(tx, organizationId, acteur.userId, "tache.attribuer", id, {
      numero,
      assigneeUserId: assignee,
      assigneeEmployeId: executant.assigneeEmployeId,
    });
  }
  return { id, numero, assigneeUserId: assignee, pourAutrui: executant.pourAutrui };
}

async function tacheVerrouillee(tx: Transaction, organizationId: string, tacheId: string) {
  const [tache] = await tx
    .select()
    .from(taches)
    .where(and(eq(taches.id, tacheId), eq(taches.organizationId, organizationId)))
    .for("update");
  if (!tache) throw new Error("Tâche introuvable.");
  return tache;
}

/**
 * Fait avancer une tâche. La ligne est verrouillée : deux personnes qui
 * terminent la même tâche au même moment n'écrivent pas deux comptes rendus.
 */
export async function appliquerGesteDans(
  tx: Transaction,
  organizationId: string,
  tacheId: string,
  geste: Geste,
  acteur: Acteur,
  texte?: string | null,
): Promise<{ numero: string }> {
  const tache = await tacheVerrouillee(tx, organizationId, tacheId);
  if (!gestePermis(geste, tache, acteur)) throw new Error("Ce geste n'est pas le vôtre sur cette tâche.");
  const vers = statutApres(geste, tache.statut);
  if (!vers) throw new Error(`${tache.numero} : impossible depuis l'état actuel.`);
  if (geste === "annuler" && (!texte || texte.trim().length < 3)) throw new Error("Indiquez le motif de l'annulation.");

  const maintenant = new Date();
  await tx
    .update(taches)
    .set({
      statut: vers,
      ...(geste === "demarrer" ? { demarreeLe: maintenant } : {}),
      ...(geste === "terminer"
        ? {
            termineeLe: maintenant,
            termineeParUserId: acteur.userId,
            compteRendu: texte?.trim() || null,
            demarreeLe: tache.demarreeLe ?? maintenant,
          }
        : {}),
      ...(geste === "annuler" ? { annuleeLe: maintenant, motifAnnulation: texte!.trim() } : {}),
      ...(geste === "rouvrir"
        ? { termineeLe: null, termineeParUserId: null, annuleeLe: null, motifAnnulation: null, demarreeLe: null }
        : {}),
      updatedAt: maintenant,
      version: sql`${taches.version} + 1`,
    })
    .where(eq(taches.id, tacheId));

  await journaliser(
    tx,
    organizationId,
    acteur.userId,
    `tache.${geste}`,
    tacheId,
    { numero: tache.numero, statut: vers, ...(texte?.trim() ? { [geste === "annuler" ? "motif" : "compteRendu"]: texte.trim() } : {}) },
    { statut: tache.statut },
  );
  return { numero: tache.numero };
}

export interface ModificationTache {
  titre: string;
  description?: string | null;
  priorite: Priorite;
  echeance?: string | null;
  executant?: Executant | null;
}

/**
 * Modifie une tâche ouverte : son contenu, son échéance, son exécutant.
 * Le créateur et qui attribue la modifient ; changer d'exécutant exige
 * d'attribuer. Le journal garde l'avant et l'après.
 */
export async function modifierTacheDans(
  tx: Transaction,
  organizationId: string,
  tacheId: string,
  donnees: ModificationTache,
  acteur: Acteur,
): Promise<{ numero: string }> {
  const tache = await tacheVerrouillee(tx, organizationId, tacheId);
  if (!acteur.attribue && tache.creeParUserId !== acteur.userId) {
    throw new Error("Seul le créateur de la tâche, ou qui attribue les tâches, peut la modifier.");
  }
  if (tache.statut === "terminee" || tache.statut === "annulee") {
    throw new Error(`${tache.numero} est close : rouvrez-la pour la modifier.`);
  }

  const executant = await resoudreExecutant(tx, organizationId, donnees.executant, acteur);
  const reattribuee =
    executant.assigneeUserId !== tache.assigneeUserId || executant.assigneeEmployeId !== tache.assigneeEmployeId;
  if (reattribuee && executant.pourAutrui && !acteur.attribue) {
    throw new Error("Votre rôle ne permet pas d'attribuer une tâche à quelqu'un d'autre.");
  }

  const maintenant = new Date();
  await tx
    .update(taches)
    .set({
      titre: donnees.titre.trim(),
      description: donnees.description?.trim() || null,
      priorite: donnees.priorite,
      echeance: donnees.echeance ?? null,
      assigneeUserId: executant.assigneeUserId,
      assigneeEmployeId: executant.assigneeEmployeId,
      ...(reattribuee ? { attribueeLe: maintenant, statut: "a_faire" as const, demarreeLe: null } : {}),
      updatedAt: maintenant,
      version: sql`${taches.version} + 1`,
    })
    .where(eq(taches.id, tacheId));

  const avant = {
    titre: tache.titre,
    priorite: tache.priorite,
    echeance: tache.echeance,
    assigneeUserId: tache.assigneeUserId,
    assigneeEmployeId: tache.assigneeEmployeId,
  };
  const apres = {
    numero: tache.numero,
    titre: donnees.titre,
    priorite: donnees.priorite,
    echeance: donnees.echeance ?? null,
    assigneeUserId: executant.assigneeUserId,
    assigneeEmployeId: executant.assigneeEmployeId,
  };
  await journaliser(tx, organizationId, acteur.userId, reattribuee ? "tache.attribuer" : "tache.modifier", tacheId, apres, avant);
  return { numero: tache.numero };
}
