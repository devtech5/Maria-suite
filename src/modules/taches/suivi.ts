import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, memberships, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { cheminDe, deposer, supprimer, urlSignee } from "@/lib/stockage";
import { employees, workers } from "@/modules/personnes/schema";

import type { Acteur } from "./calcul";
import { estIntervenant } from "./intervenants";
import type { RefIntervenant } from "./intervenants-regles";
import { basculerCoche, mentionsDe } from "./mise-en-forme";
import { taches, tachesFichiers, tachesIntervenants, tachesMessages, tachesSousTaches } from "./schema";
import {
  normaliserMessage,
  normaliserTitreSousTache,
  phraseActivite,
  SOUS_TACHES_MAX,
  verifierFichier,
} from "./suivi-regles";

type Executant = Transaction | typeof db;

async function tracer(tx: Executant, organizationId: string, userId: string, action: string, tacheId: string, apres: Record<string, unknown> | null, avant?: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "tache", entityId: tacheId, before: avant ?? null, after: apres });
}

/** La tâche bouge : « Mise à jour » le montre, et la réplication la reprend. */
async function toucher(tx: Executant, tacheId: string) {
  await tx.update(taches).set({ updatedAt: new Date(), version: sql`${taches.version} + 1` }).where(eq(taches.id, tacheId));
}

/**
 * La tâche, si l'acteur en fait partie : qui attribue, son créateur, son
 * responsable, ses intervenants. Les autres n'y lisent ni n'y écrivent rien.
 */
export async function tacheDePartie(tx: Executant, organizationId: string, tacheId: string, acteur: Acteur, ouverte = false) {
  const [tache] = await tx
    .select({ id: taches.id, numero: taches.numero, titre: taches.titre, statut: taches.statut, creeParUserId: taches.creeParUserId, assigneeUserId: taches.assigneeUserId })
    .from(taches)
    .where(and(eq(taches.id, tacheId), eq(taches.organizationId, organizationId), isNull(taches.deletedAt)));
  if (!tache) throw new Error("Tâche introuvable.");
  const partie = acteur.attribue || tache.creeParUserId === acteur.userId || tache.assigneeUserId === acteur.userId;
  if (!partie && !(await estIntervenant(tx as Transaction, tacheId, acteur.userId))) throw new Error("Cette tâche n'est pas la vôtre.");
  if (ouverte && (tache.statut === "terminee" || tache.statut === "annulee")) throw new Error(`${tache.numero} est close : rouvrez-la d'abord.`);
  return tache;
}

// ------------------------------------------------------------------ sous-tâches

export interface SousTacheVue {
  id: string;
  titre: string;
  faite: boolean;
  /** `e:<collaborateur>` ou `w:<intervenant>`. */
  responsable: string | null;
  responsableNom: string | null;
  echeance: string | null;
}

const jourIso = (v: string | Date | null) => (v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : v.slice(0, 10));

export async function sousTachesDe(organizationId: string, tacheIds: string[]): Promise<Map<string, SousTacheVue[]>> {
  const parTache = new Map<string, SousTacheVue[]>();
  if (tacheIds.length === 0) return parTache;
  const lignes = await db
    .select({
      id: tachesSousTaches.id,
      tacheId: tachesSousTaches.tacheId,
      titre: tachesSousTaches.titre,
      faite: tachesSousTaches.faite,
      employeId: tachesSousTaches.responsableEmployeId,
      workerId: tachesSousTaches.responsableWorkerId,
      nomEmploye: employees.nom,
      nomWorker: workers.nom,
      echeance: tachesSousTaches.echeance,
    })
    .from(tachesSousTaches)
    .leftJoin(employees, eq(employees.id, tachesSousTaches.responsableEmployeId))
    .leftJoin(workers, eq(workers.id, tachesSousTaches.responsableWorkerId))
    .where(and(eq(tachesSousTaches.organizationId, organizationId), inArray(tachesSousTaches.tacheId, tacheIds), isNull(tachesSousTaches.deletedAt)))
    .orderBy(asc(tachesSousTaches.rang), asc(tachesSousTaches.createdAt));
  for (const l of lignes) {
    const vue: SousTacheVue = {
      id: l.id,
      titre: l.titre,
      faite: l.faite,
      responsable: l.employeId ? `e:${l.employeId}` : l.workerId ? `w:${l.workerId}` : null,
      responsableNom: l.nomEmploye ?? l.nomWorker ?? null,
      echeance: jourIso(l.echeance),
    };
    parTache.set(l.tacheId, [...(parTache.get(l.tacheId) ?? []), vue]);
  }
  return parTache;
}

export async function ajouterSousTacheDans(tx: Transaction, organizationId: string, tacheId: string, titre: string, acteur: Acteur): Promise<{ numero: string; id: string }> {
  const tache = await tacheDePartie(tx, organizationId, tacheId, acteur, true);
  const verdict = normaliserTitreSousTache(titre);
  if (!verdict.ok) throw new Error(verdict.message);
  // Verrou sur la tâche : deux ajouts simultanés prennent des rangs distincts, et le plafond tient.
  await tx.select({ id: taches.id }).from(taches).where(eq(taches.id, tacheId)).for("update");
  const [{ nombre, rangMax }] = await tx
    .select({ nombre: count(), rangMax: sql<number>`coalesce(max(${tachesSousTaches.rang}), -1)` })
    .from(tachesSousTaches)
    .where(and(eq(tachesSousTaches.tacheId, tacheId), isNull(tachesSousTaches.deletedAt)));
  if (nombre >= SOUS_TACHES_MAX) throw new Error(`${SOUS_TACHES_MAX} sous-tâches au plus.`);
  const id = newId();
  await tx.insert(tachesSousTaches).values({ id, organizationId, tacheId, titre: verdict.valeur, rang: Number(rangMax) + 1, creeParUserId: acteur.userId });
  await toucher(tx, tacheId);
  await tracer(tx, organizationId, acteur.userId, "tache.sous_tache.ajouter", tacheId, { numero: tache.numero, titre: verdict.valeur });
  return { numero: tache.numero, id };
}

async function sousTache(tx: Transaction, organizationId: string, sousTacheId: string) {
  const [st] = await tx
    .select()
    .from(tachesSousTaches)
    .where(and(eq(tachesSousTaches.id, sousTacheId), eq(tachesSousTaches.organizationId, organizationId), isNull(tachesSousTaches.deletedAt)))
    .for("update");
  if (!st) throw new Error("Sous-tâche introuvable.");
  return st;
}

export async function cocherSousTacheDans(tx: Transaction, organizationId: string, sousTacheId: string, faite: boolean, acteur: Acteur): Promise<{ numero: string }> {
  const st = await sousTache(tx, organizationId, sousTacheId);
  const tache = await tacheDePartie(tx, organizationId, st.tacheId, acteur, true);
  if (st.faite === faite) return { numero: tache.numero };
  await tx
    .update(tachesSousTaches)
    .set({
      faite,
      faiteLe: faite ? new Date() : null,
      faiteParUserId: faite ? acteur.userId : null,
      updatedAt: new Date(),
      version: sql`${tachesSousTaches.version} + 1`,
    })
    .where(eq(tachesSousTaches.id, sousTacheId));
  await toucher(tx, st.tacheId);
  await tracer(tx, organizationId, acteur.userId, "tache.sous_tache.cocher", st.tacheId, { numero: tache.numero, titre: st.titre, faite });
  return { numero: tache.numero };
}

export interface RetoucheSousTache {
  titre?: string;
  /** `null` : sans responsable. */
  responsable?: RefIntervenant | null;
  echeance?: string | null;
}

export async function modifierSousTacheDans(tx: Transaction, organizationId: string, sousTacheId: string, r: RetoucheSousTache, acteur: Acteur): Promise<{ numero: string }> {
  const st = await sousTache(tx, organizationId, sousTacheId);
  const tache = await tacheDePartie(tx, organizationId, st.tacheId, acteur, true);
  const suite: Partial<typeof tachesSousTaches.$inferInsert> = {};
  if (r.titre !== undefined) {
    const v = normaliserTitreSousTache(r.titre);
    if (!v.ok) throw new Error(v.message);
    suite.titre = v.valeur;
  }
  if (r.responsable !== undefined) {
    if (r.responsable && "employeId" in r.responsable) {
      const [e] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, r.responsable.employeId), eq(employees.organizationId, organizationId), isNull(employees.deletedAt)));
      if (!e) throw new Error("Ce collaborateur ne figure pas au Personnel.");
    } else if (r.responsable) {
      const [w] = await tx.select({ id: workers.id }).from(workers).where(and(eq(workers.id, r.responsable.workerId), eq(workers.organizationId, organizationId), isNull(workers.deletedAt)));
      if (!w) throw new Error("Cet intervenant est inconnu.");
    }
    suite.responsableEmployeId = r.responsable && "employeId" in r.responsable ? r.responsable.employeId : null;
    suite.responsableWorkerId = r.responsable && "workerId" in r.responsable ? r.responsable.workerId : null;
  }
  if (r.echeance !== undefined) {
    if (r.echeance !== null && !/^\d{4}-\d{2}-\d{2}$/.test(r.echeance)) throw new Error("Date invalide.");
    suite.echeance = r.echeance;
  }
  if (Object.keys(suite).length === 0) return { numero: tache.numero };
  await tx.update(tachesSousTaches).set({ ...suite, updatedAt: new Date(), version: sql`${tachesSousTaches.version} + 1` }).where(eq(tachesSousTaches.id, sousTacheId));
  await toucher(tx, st.tacheId);
  await tracer(tx, organizationId, acteur.userId, "tache.sous_tache.modifier", st.tacheId, { numero: tache.numero, titre: suite.titre ?? st.titre });
  return { numero: tache.numero };
}

export async function supprimerSousTacheDans(tx: Transaction, organizationId: string, sousTacheId: string, acteur: Acteur): Promise<{ numero: string }> {
  const st = await sousTache(tx, organizationId, sousTacheId);
  const tache = await tacheDePartie(tx, organizationId, st.tacheId, acteur, true);
  const maintenant = new Date();
  await tx.update(tachesSousTaches).set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${tachesSousTaches.version} + 1` }).where(eq(tachesSousTaches.id, sousTacheId));
  await toucher(tx, st.tacheId);
  await tracer(tx, organizationId, acteur.userId, "tache.sous_tache.supprimer", st.tacheId, null, { numero: tache.numero, titre: st.titre });
  return { numero: tache.numero };
}

// ------------------------------------------------------------------ mises à jour

/** Comptes à prévenir d'une mise à jour : créateur, responsable, intervenants qui ont un compte actif — sauf l'auteur. */
async function partiesAPrevenir(tx: Transaction, organizationId: string, tache: { id: string; creeParUserId: string; assigneeUserId: string }, auteur: string): Promise<string[]> {
  const intervenants = await tx
    .select({ userId: employees.userId })
    .from(tachesIntervenants)
    .innerJoin(employees, eq(employees.id, tachesIntervenants.employeeId))
    .innerJoin(memberships, and(eq(memberships.userId, employees.userId), eq(memberships.organizationId, organizationId), eq(memberships.status, "actif")))
    .where(and(eq(tachesIntervenants.tacheId, tache.id), isNull(tachesIntervenants.deletedAt)));
  const comptes = [tache.creeParUserId, tache.assigneeUserId, ...intervenants.map((i) => i.userId)].filter((u): u is string => !!u && u !== auteur);
  return [...new Set(comptes)];
}

export async function publierMessageDans(
  tx: Transaction,
  organizationId: string,
  tacheId: string,
  corps: string,
  acteur: Acteur,
): Promise<{ numero: string; titre: string; aPrevenir: string[] }> {
  const tache = await tacheDePartie(tx, organizationId, tacheId, acteur);
  const verdict = normaliserMessage(corps);
  if (!verdict.ok) throw new Error(verdict.message);
  const id = newId();
  await tx.insert(tachesMessages).values({ id, organizationId, tacheId, auteurUserId: acteur.userId, corps: verdict.valeur });
  await toucher(tx, tacheId);
  await tracer(tx, organizationId, acteur.userId, "tache.message", tacheId, { numero: tache.numero, message: id });
  // Les comptes mentionnés sont prévenus aussi, s'ils sont membres actifs de l'entreprise.
  const mentionnes = mentionsDe(verdict.valeur).filter((u) => u !== acteur.userId);
  const actifs = mentionnes.length
    ? await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), inArray(memberships.userId, mentionnes)))
    : [];
  const aPrevenir = [...new Set([...(await partiesAPrevenir(tx, organizationId, tache, acteur.userId)), ...actifs.map((a) => a.userId)])];
  return { numero: tache.numero, titre: tache.titre, aPrevenir };
}

/** Coche une case d'une check-list posée dans une mise à jour : toute partie de la tâche le peut. */
export async function cocherDansMessageDans(tx: Transaction, organizationId: string, messageId: string, rang: number, acteur: Acteur): Promise<void> {
  const [m] = await tx
    .select({ tacheId: tachesMessages.tacheId, corps: tachesMessages.corps })
    .from(tachesMessages)
    .where(and(eq(tachesMessages.id, messageId), eq(tachesMessages.organizationId, organizationId), isNull(tachesMessages.deletedAt)))
    .for("update");
  if (!m) throw new Error("Mise à jour introuvable.");
  const tache = await tacheDePartie(tx, organizationId, m.tacheId, acteur);
  const corps = basculerCoche(m.corps, rang);
  if (corps === null) throw new Error("Case introuvable.");
  await tx.update(tachesMessages).set({ corps, updatedAt: new Date(), version: sql`${tachesMessages.version} + 1` }).where(eq(tachesMessages.id, messageId));
  await tracer(tx, organizationId, acteur.userId, "tache.message.cocher", m.tacheId, { numero: tache.numero, message: messageId, rang });
}

/** Retire une mise à jour : son auteur seulement. */
export async function retirerMessageDans(tx: Transaction, organizationId: string, messageId: string, acteur: Acteur): Promise<void> {
  const maintenant = new Date();
  const [retire] = await tx
    .update(tachesMessages)
    .set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${tachesMessages.version} + 1` })
    .where(and(eq(tachesMessages.id, messageId), eq(tachesMessages.organizationId, organizationId), eq(tachesMessages.auteurUserId, acteur.userId), isNull(tachesMessages.deletedAt)))
    .returning({ tacheId: tachesMessages.tacheId });
  if (!retire) throw new Error("Seul son auteur retire une mise à jour.");
}

/** Nombre de mises à jour par tâche, pour la bulle du tableur. */
export async function compteMessagesDe(organizationId: string, tacheIds: string[]): Promise<Map<string, number>> {
  if (tacheIds.length === 0) return new Map();
  const lignes = await db
    .select({ tacheId: tachesMessages.tacheId, nombre: count() })
    .from(tachesMessages)
    .where(and(eq(tachesMessages.organizationId, organizationId), inArray(tachesMessages.tacheId, tacheIds), isNull(tachesMessages.deletedAt)))
    .groupBy(tachesMessages.tacheId);
  return new Map(lignes.map((l) => [l.tacheId, Number(l.nombre)]));
}

// ------------------------------------------------------------------ fichiers

export async function joindreFichier(
  organizationId: string,
  tacheId: string,
  fichier: { nom: string; typeMime: string; contenu: ArrayBuffer },
  acteur: Acteur,
): Promise<{ numero: string }> {
  const tache = await tacheDePartie(db, organizationId, tacheId, acteur);
  const verdict = verifierFichier({ taille: fichier.contenu.byteLength, typeMime: fichier.typeMime });
  if (!verdict.ok) throw new Error(verdict.message);

  const id = newId();
  const depot = await deposer({ chemin: cheminDe(organizationId, id, verdict.valeur), contenu: fichier.contenu, typeMime: fichier.typeMime });
  if (!depot.ok) throw new Error(depot.raison);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(tachesFichiers).values({
        id,
        organizationId,
        tacheId,
        nomFichier: fichier.nom.slice(0, 200) || `fichier.${verdict.valeur}`,
        typeMime: fichier.typeMime,
        taille: fichier.contenu.byteLength,
        chemin: depot.chemin,
        deposeParUserId: acteur.userId,
      });
      await toucher(tx, tacheId);
      await tracer(tx, organizationId, acteur.userId, "tache.fichier.ajouter", tacheId, { numero: tache.numero, nom: fichier.nom });
    });
  } catch (erreur) {
    // La ligne n'a pas été écrite : le fichier déposé ne doit pas rester orphelin.
    await supprimer(depot.chemin);
    throw erreur;
  }
  return { numero: tache.numero };
}

/** Retire un fichier : la ligne d'abord (logique), puis le fichier du dépôt. Qui l'a déposé, ou qui attribue. */
export async function retirerFichier(organizationId: string, fichierId: string, acteur: Acteur): Promise<{ numero: string }> {
  const chemin = await db.transaction(async (tx) => {
    const [f] = await tx
      .select()
      .from(tachesFichiers)
      .where(and(eq(tachesFichiers.id, fichierId), eq(tachesFichiers.organizationId, organizationId), isNull(tachesFichiers.deletedAt)))
      .for("update");
    if (!f) throw new Error("Fichier introuvable.");
    const tache = await tacheDePartie(tx, organizationId, f.tacheId, acteur);
    if (!acteur.attribue && f.deposeParUserId !== acteur.userId) throw new Error("Seul celui qui l'a joint retire ce fichier.");
    const maintenant = new Date();
    await tx.update(tachesFichiers).set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${tachesFichiers.version} + 1` }).where(eq(tachesFichiers.id, fichierId));
    await toucher(tx, f.tacheId);
    await tracer(tx, organizationId, acteur.userId, "tache.fichier.supprimer", f.tacheId, null, { numero: tache.numero, nom: f.nomFichier });
    return { chemin: f.chemin, numero: tache.numero };
  });
  await supprimer(chemin.chemin);
  return { numero: chemin.numero };
}

/** URL signée de deux minutes, demandée au clic. */
export async function urlFichierTache(organizationId: string, fichierId: string, acteur: Acteur): Promise<string | null> {
  const [f] = await db
    .select({ chemin: tachesFichiers.chemin, tacheId: tachesFichiers.tacheId })
    .from(tachesFichiers)
    .where(and(eq(tachesFichiers.id, fichierId), eq(tachesFichiers.organizationId, organizationId), isNull(tachesFichiers.deletedAt)));
  if (!f) return null;
  await tacheDePartie(db, organizationId, f.tacheId, acteur);
  return urlSignee(f.chemin, 120);
}

// ------------------------------------------------------------------ le panneau

export interface SuiviTache {
  messages: { id: string; auteur: string; auteurUserId: string; corps: string; leIso: string }[];
  fichiers: { id: string; nom: string; typeMime: string; taille: number; deposePar: string; deposeParUserId: string; leIso: string }[];
  activites: { id: string; auteur: string; phrase: string; leIso: string }[];
}

/** Tout ce que montre le panneau d'une tâche, lu à son ouverture. */
export async function suiviDe(organizationId: string, tacheId: string, acteur: Acteur): Promise<SuiviTache> {
  await tacheDePartie(db, organizationId, tacheId, acteur);
  const [messages, fichiers, journal] = await Promise.all([
    db
      .select({ id: tachesMessages.id, auteur: users.fullName, auteurUserId: tachesMessages.auteurUserId, corps: tachesMessages.corps, le: tachesMessages.createdAt })
      .from(tachesMessages)
      .leftJoin(users, eq(users.id, tachesMessages.auteurUserId))
      .where(and(eq(tachesMessages.organizationId, organizationId), eq(tachesMessages.tacheId, tacheId), isNull(tachesMessages.deletedAt)))
      .orderBy(desc(tachesMessages.createdAt))
      .limit(200),
    db
      .select({
        id: tachesFichiers.id,
        nom: tachesFichiers.nomFichier,
        typeMime: tachesFichiers.typeMime,
        taille: tachesFichiers.taille,
        deposePar: users.fullName,
        deposeParUserId: tachesFichiers.deposeParUserId,
        le: tachesFichiers.createdAt,
      })
      .from(tachesFichiers)
      .leftJoin(users, eq(users.id, tachesFichiers.deposeParUserId))
      .where(and(eq(tachesFichiers.organizationId, organizationId), eq(tachesFichiers.tacheId, tacheId), isNull(tachesFichiers.deletedAt)))
      .orderBy(desc(tachesFichiers.createdAt)),
    db
      .select({ id: auditLogs.id, auteur: users.fullName, action: auditLogs.action, apres: auditLogs.after, avant: auditLogs.before, le: auditLogs.createdAt })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(and(eq(auditLogs.organizationId, organizationId), eq(auditLogs.entityType, "tache"), eq(auditLogs.entityId, tacheId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(200),
  ]);
  const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();
  return {
    messages: messages.map((m) => ({ id: m.id, auteur: m.auteur ?? "Ancien membre", auteurUserId: m.auteurUserId, corps: m.corps, leIso: iso(m.le) })),
    fichiers: fichiers.map((f) => ({ ...f, deposePar: f.deposePar ?? "Ancien membre", leIso: iso(f.le) })),
    activites: journal.map((j) => ({
      id: j.id,
      auteur: j.auteur ?? "Ancien membre",
      phrase: phraseActivite(j.action, j.apres as Record<string, unknown> | null, j.avant as Record<string, unknown> | null),
      leIso: iso(j.le),
    })),
  };
}
