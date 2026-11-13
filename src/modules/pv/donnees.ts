import "server-only";

import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, memberships, organizations, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { reunionParticipants, reunions } from "@/modules/meeting/schema";
import { employees, services } from "@/modules/personnes/schema";
import { jourLocal } from "@/modules/presences/calcul";
import { relancePermise } from "@/modules/reglement/regles";
import { creerTacheDans } from "@/modules/taches/creation";
import { taches } from "@/modules/taches/schema";

import {
  ACTIONS_MAX,
  destinataires,
  estTypePv,
  gestesPv,
  normaliserDiffusion,
  normaliserParticipants,
  normaliserPoints,
  OBJET_MAX,
  refusSoumission,
  type Diffusion,
  type GestePv,
  type Participant,
  type Point,
  type StatutPv,
  type TypePv,
} from "./regles";
import { procesVerbaux, pvActions, pvLectures, type ProcesVerbal } from "./schema";

/** Qui agit : son compte, et s'il porte `pv.valider` (la direction). */
export interface ActeurPv {
  userId: string;
  valideur: boolean;
}

type Executant = Transaction | typeof db;

async function tracer(tx: Executant, organizationId: string, userId: string, action: string, pvId: string, apres: Record<string, unknown> | null, avant?: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "proces_verbal", entityId: pvId, before: avant ?? null, after: apres });
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

async function pvVerrouille(tx: Transaction, organizationId: string, pvId: string): Promise<ProcesVerbal> {
  const [pv] = await tx
    .select()
    .from(procesVerbaux)
    .where(and(eq(procesVerbaux.id, pvId), eq(procesVerbaux.organizationId, organizationId), isNull(procesVerbaux.deletedAt)))
    .for("update");
  if (!pv) throw new Error("Procès-verbal introuvable.");
  return pv;
}

function exigerGeste(pv: ProcesVerbal, geste: GestePv, acteur: ActeurPv) {
  const permis = gestesPv(pv.statut as StatutPv, { redacteur: pv.redigeParUserId === acteur.userId, valideur: acteur.valideur });
  if (!permis.includes(geste)) {
    const raisons: Partial<Record<GestePv, string>> = {
      modifier: "Ce procès-verbal ne se modifie plus dans son état actuel.",
      publier: "Seule la direction publie un procès-verbal.",
      soumettre: "Seul le rédacteur soumet son brouillon.",
      renvoyer: "Ce procès-verbal n'attend pas de validation.",
      reviser: "Seul un procès-verbal publié se corrige par une nouvelle version.",
      supprimer: "Seul un brouillon se supprime.",
    };
    throw new Error(raisons[geste] ?? "Geste refusé.");
  }
}

// ------------------------------------------------------------------ création

export interface NouveauPv {
  type: TypePv;
  objet: string;
  dateSeance: string;
  lieu?: string | null;
  reunionId?: string | null;
}

/**
 * Ouvre un brouillon. Tiré d'une réunion Meeting, il en reprend l'objet, les
 * invités avec leur présence (venu dans la salle ou non) et le compte rendu
 * déjà écrit.
 */
export async function creerPvDans(tx: Transaction, organizationId: string, saisie: NouveauPv, acteur: ActeurPv): Promise<{ id: string }> {
  if (!estTypePv(saisie.type)) throw new Error("Type de procès-verbal inconnu.");
  if (!DATE_ISO.test(saisie.dateSeance)) throw new Error("Indiquez la date de la séance.");
  let objet = saisie.objet.replace(/\s+/g, " ").trim().slice(0, OBJET_MAX);
  let participants: Participant[] = [];
  let points: Point[] = [];

  if (saisie.reunionId) {
    const [reunion] = await tx
      .select({ id: reunions.id, titre: reunions.titre, organisateur: reunions.organisateurUserId, compteRendu: reunions.compteRendu })
      .from(reunions)
      .where(and(eq(reunions.id, saisie.reunionId), eq(reunions.organizationId, organizationId), isNull(reunions.deletedAt)));
    if (!reunion) throw new Error("Réunion introuvable.");
    const invites = await tx
      .select({ userId: reunionParticipants.userId, nom: users.fullName, rejointLe: reunionParticipants.rejointLe, poste: employees.poste })
      .from(reunionParticipants)
      .innerJoin(users, eq(users.id, reunionParticipants.userId))
      .leftJoin(employees, and(eq(employees.userId, reunionParticipants.userId), eq(employees.organizationId, organizationId), isNull(employees.deletedAt)))
      .where(and(eq(reunionParticipants.reunionId, reunion.id), isNull(reunionParticipants.deletedAt)))
      .orderBy(asc(users.fullName));
    const concerne = acteur.valideur || reunion.organisateur === acteur.userId || invites.some((i) => i.userId === acteur.userId);
    if (!concerne) throw new Error("Vous n'étiez pas de cette réunion.");
    objet ||= reunion.titre;
    // Un même compte peut porter deux fiches du Personnel : une ligne par compte.
    const vus = new Set<string>();
    participants = invites.flatMap((i) => {
      if (vus.has(i.userId)) return [];
      vus.add(i.userId);
      return [{ nom: i.nom, qualite: i.poste ?? "", presence: i.rejointLe ? ("present" as const) : ("absent" as const), userId: i.userId }];
    });
    if (reunion.compteRendu?.trim()) points = [{ titre: "Compte rendu de la réunion", texte: reunion.compteRendu.trim(), decisions: [] }];
  }
  if (objet.length < 3) throw new Error("Donnez l'objet du procès-verbal.");

  const id = newId();
  await tx.insert(procesVerbaux).values({
    id,
    organizationId,
    type: saisie.type,
    objet,
    dateSeance: saisie.dateSeance,
    lieu: saisie.lieu?.trim().slice(0, 120) || null,
    reunionId: saisie.reunionId ?? null,
    participants,
    points,
    redigeParUserId: acteur.userId,
  });
  await tracer(tx, organizationId, acteur.userId, "pv.creer", id, { objet, type: saisie.type, reunion: saisie.reunionId ?? null });
  return { id };
}

// ------------------------------------------------------------------ rédaction

export interface SaisieAction {
  id?: string | null;
  libelle: string;
  responsableEmployeId?: string | null;
  echeance?: string | null;
}

export interface SaisieBrouillon {
  type: TypePv;
  objet: string;
  dateSeance: string;
  lieu: string | null;
  participants: unknown;
  points: unknown;
  conclusion: string | null;
  diffusion: unknown;
  accuseRequis: boolean;
  confidentiel: boolean;
  actions: SaisieAction[];
}

/** Enregistre le brouillon : contenu, diffusion et actions. Les actions retirées le sont logiquement. */
export async function enregistrerPvDans(tx: Transaction, organizationId: string, pvId: string, s: SaisieBrouillon, acteur: ActeurPv): Promise<void> {
  const pv = await pvVerrouille(tx, organizationId, pvId);
  // À valider, la direction peut encore corriger avant de publier.
  if (!(pv.statut === "a_valider" && acteur.valideur)) exigerGeste(pv, "modifier", acteur);
  if (!estTypePv(s.type)) throw new Error("Type de procès-verbal inconnu.");
  if (!DATE_ISO.test(s.dateSeance)) throw new Error("Indiquez la date de la séance.");
  const objet = s.objet.replace(/\s+/g, " ").trim().slice(0, OBJET_MAX);
  if (objet.length < 3) throw new Error("Donnez l'objet du procès-verbal.");

  const maintenant = new Date();
  await tx
    .update(procesVerbaux)
    .set({
      type: s.type,
      objet,
      dateSeance: s.dateSeance,
      lieu: s.lieu?.trim().slice(0, 120) || null,
      participants: normaliserParticipants(s.participants),
      points: normaliserPoints(s.points),
      conclusion: s.conclusion?.trim().slice(0, 5000) || null,
      diffusion: normaliserDiffusion(s.diffusion),
      accuseRequis: s.accuseRequis,
      confidentiel: s.confidentiel,
      updatedAt: maintenant,
      version: sql`${procesVerbaux.version} + 1`,
    })
    .where(eq(procesVerbaux.id, pvId));

  // Actions : celles qui gardent leur identifiant se mettent à jour, les nouvelles s'ajoutent, les absentes se retirent.
  const existantes = await tx
    .select({ id: pvActions.id })
    .from(pvActions)
    .where(and(eq(pvActions.pvId, pvId), isNull(pvActions.deletedAt)));
  const gardees = new Set<string>();
  const saisies = s.actions.filter((a) => a.libelle.trim().length >= 2).slice(0, ACTIONS_MAX);
  for (const [rang, a] of saisies.entries()) {
    const echeance = a.echeance && DATE_ISO.test(a.echeance) ? a.echeance : null;
    const responsable = a.responsableEmployeId || null;
    if (responsable) {
      const [e] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, responsable), eq(employees.organizationId, organizationId), isNull(employees.deletedAt)));
      if (!e) throw new Error("Le responsable d'une action ne figure pas au Personnel.");
    }
    const valeurs = { libelle: a.libelle.replace(/\s+/g, " ").trim().slice(0, 300), responsableEmployeId: responsable, echeance, rang };
    if (a.id && existantes.some((x) => x.id === a.id)) {
      gardees.add(a.id);
      await tx.update(pvActions).set({ ...valeurs, updatedAt: maintenant, version: sql`${pvActions.version} + 1` }).where(eq(pvActions.id, a.id));
    } else {
      await tx.insert(pvActions).values({ id: newId(), organizationId, pvId, ...valeurs });
    }
  }
  const retirees = existantes.filter((x) => !gardees.has(x.id)).map((x) => x.id);
  if (retirees.length) {
    await tx.update(pvActions).set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${pvActions.version} + 1` }).where(inArray(pvActions.id, retirees));
  }
  await tracer(tx, organizationId, acteur.userId, "pv.modifier", pvId, { objet, points: normaliserPoints(s.points).length, actions: saisies.length });
}

function verifierContenu(pv: ProcesVerbal) {
  const refus = refusSoumission({
    objet: pv.objet,
    type: pv.type as TypePv,
    participants: pv.participants,
    points: pv.points,
    diffusion: normaliserDiffusion(pv.diffusion),
    confidentiel: pv.confidentiel,
  });
  if (refus) throw new Error(refus);
}

/** Le rédacteur soumet son brouillon à la direction. */
export async function soumettrePvDans(tx: Transaction, organizationId: string, pvId: string, acteur: ActeurPv): Promise<{ objet: string; reference: string }> {
  const pv = await pvVerrouille(tx, organizationId, pvId);
  exigerGeste(pv, "soumettre", acteur);
  verifierContenu(pv);
  const maintenant = new Date();
  await tx
    .update(procesVerbaux)
    .set({ statut: "a_valider", soumisLe: maintenant, remarque: null, updatedAt: maintenant, version: sql`${procesVerbaux.version} + 1` })
    .where(eq(procesVerbaux.id, pvId));
  await tracer(tx, organizationId, acteur.userId, "pv.soumettre", pvId, { objet: pv.objet });
  return { objet: pv.objet, reference: pv.numero ?? "nouveau PV" };
}

/**
 * Renvoie au brouillon. La direction motive son renvoi ; le rédacteur qui
 * reprend son propre PV n'a rien à expliquer.
 */
export async function renvoyerPvDans(tx: Transaction, organizationId: string, pvId: string, remarque: string | null, acteur: ActeurPv): Promise<{ redacteur: string; objet: string }> {
  const pv = await pvVerrouille(tx, organizationId, pvId);
  exigerGeste(pv, "renvoyer", acteur);
  const propre = remarque?.trim().slice(0, 2000) || null;
  const parLaDirection = acteur.valideur && pv.redigeParUserId !== acteur.userId;
  if (parLaDirection && (!propre || propre.length < 3)) throw new Error("Dites au rédacteur ce qu'il faut reprendre.");
  await tx
    .update(procesVerbaux)
    .set({ statut: "brouillon", remarque: parLaDirection ? propre : null, updatedAt: new Date(), version: sql`${procesVerbaux.version} + 1` })
    .where(eq(procesVerbaux.id, pvId));
  await tracer(tx, organizationId, acteur.userId, "pv.renvoyer", pvId, { remarque: parLaDirection ? propre : null });
  return { redacteur: pv.redigeParUserId, objet: pv.objet };
}

/** Comptes actifs de l'entreprise, avec le service de leur fiche du Personnel. */
export async function comptesDiffusion(executant: Executant, organizationId: string): Promise<{ userId: string; nom: string; serviceId: string | null; service: string | null }[]> {
  const lignes = await executant
    .select({ userId: users.id, nom: users.fullName, serviceId: services.id, service: services.libelle })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(employees, and(eq(employees.userId, users.id), eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt)))
    .leftJoin(services, and(eq(services.organizationId, organizationId), eq(services.libelle, employees.service)))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), eq(users.status, "actif")))
    .orderBy(asc(users.fullName));
  // Un compte relié à deux fiches compte une fois, avec le premier service trouvé.
  const vus = new Map<string, (typeof lignes)[number]>();
  for (const l of lignes) if (!vus.has(l.userId) || (!vus.get(l.userId)!.serviceId && l.serviceId)) vus.set(l.userId, l);
  return [...vus.values()];
}

/**
 * Publie : numéro (au premier passage), texte figé, diffusion. Chaque
 * destinataire reçoit sa ligne de lecture ; les prévenir revient à l'appelant,
 * après la transaction.
 */
export async function publierPvDans(
  tx: Transaction,
  organizationId: string,
  pvId: string,
  acteur: ActeurPv,
): Promise<{ numero: string; revision: number; objet: string; destinataires: string[]; redacteur: string; accuseRequis: boolean }> {
  const pv = await pvVerrouille(tx, organizationId, pvId);
  exigerGeste(pv, "publier", acteur);
  verifierContenu(pv);

  let numero = pv.numero;
  if (!numero) {
    const [o] = await tx.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
    const annee = jourLocal(new Date(), o?.fuseau || "Africa/Abidjan").slice(0, 4);
    numero = await prochainNumero(tx, organizationId, { cle: "pv", prefix: `PV-${annee}-`, padding: 5, periode: annee });
  }
  const maintenant = new Date();
  await tx
    .update(procesVerbaux)
    .set({ statut: "publie", numero, publieLe: maintenant, publieParUserId: acteur.userId, remarque: null, updatedAt: maintenant, version: sql`${procesVerbaux.version} + 1` })
    .where(eq(procesVerbaux.id, pvId));

  const comptes = await comptesDiffusion(tx, organizationId);
  const liste = destinataires(normaliserDiffusion(pv.diffusion), comptes, pv.redigeParUserId);
  if (liste.length) {
    await tx
      .insert(pvLectures)
      .values(liste.map((userId) => ({ id: newId(), organizationId, pvId, userId })))
      .onConflictDoNothing();
  }
  await tracer(tx, organizationId, acteur.userId, "pv.publier", pvId, { numero, revision: pv.revision, destinataires: liste.length });
  return { numero, revision: pv.revision, objet: pv.objet, destinataires: liste, redacteur: pv.redigeParUserId, accuseRequis: pv.accuseRequis };
}

/**
 * Ouvre la correction d'un PV publié : une nouvelle version, sous le même
 * numéro, reprise de la dernière. S'il en existe déjà une en cours, c'est elle.
 */
export async function reviserPvDans(tx: Transaction, organizationId: string, pvId: string, acteur: ActeurPv): Promise<{ id: string }> {
  const pv = await pvVerrouille(tx, organizationId, pvId);
  exigerGeste(pv, "reviser", acteur);
  const [enCours] = await tx
    .select({ id: procesVerbaux.id })
    .from(procesVerbaux)
    .where(and(eq(procesVerbaux.organizationId, organizationId), eq(procesVerbaux.numero, pv.numero!), ne(procesVerbaux.statut, "publie"), isNull(procesVerbaux.deletedAt)));
  if (enCours) return enCours;
  const [derniere] = await tx
    .select({ revision: sql<number>`max(${procesVerbaux.revision})` })
    .from(procesVerbaux)
    .where(and(eq(procesVerbaux.organizationId, organizationId), eq(procesVerbaux.numero, pv.numero!)));

  const id = newId();
  await tx.insert(procesVerbaux).values({
    id,
    organizationId,
    numero: pv.numero,
    revision: Number(derniere?.revision ?? pv.revision) + 1,
    remplaceId: pv.id,
    type: pv.type,
    objet: pv.objet,
    dateSeance: pv.dateSeance,
    lieu: pv.lieu,
    reunionId: pv.reunionId,
    participants: pv.participants,
    points: pv.points,
    conclusion: pv.conclusion,
    diffusion: pv.diffusion,
    accuseRequis: pv.accuseRequis,
    confidentiel: pv.confidentiel,
    // Le rédacteur reste celui de la première version : c'est son PV qu'on corrige.
    redigeParUserId: pv.redigeParUserId,
  });
  const actions = await tx.select().from(pvActions).where(and(eq(pvActions.pvId, pv.id), isNull(pvActions.deletedAt)));
  if (actions.length) {
    await tx.insert(pvActions).values(
      actions.map((a) => ({ id: newId(), organizationId, pvId: id, rang: a.rang, libelle: a.libelle, responsableEmployeId: a.responsableEmployeId, echeance: a.echeance, tacheId: a.tacheId })),
    );
  }
  await tracer(tx, organizationId, acteur.userId, "pv.reviser", id, { numero: pv.numero, depuis: pv.revision });
  return { id };
}

export async function supprimerPvDans(tx: Transaction, organizationId: string, pvId: string, acteur: ActeurPv): Promise<void> {
  const pv = await pvVerrouille(tx, organizationId, pvId);
  exigerGeste(pv, "supprimer", acteur);
  const maintenant = new Date();
  await tx.update(procesVerbaux).set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${procesVerbaux.version} + 1` }).where(eq(procesVerbaux.id, pvId));
  await tracer(tx, organizationId, acteur.userId, "pv.supprimer", pvId, null, { objet: pv.objet, revision: pv.revision });
}

/** « J'ai pris connaissance » : horodaté une fois, pour un destinataire. */
export async function accuserLectureDans(tx: Transaction, organizationId: string, pvId: string, userId: string): Promise<{ deja: boolean }> {
  const [ligne] = await tx
    .select({ id: pvLectures.id, luLe: pvLectures.luLe })
    .from(pvLectures)
    .where(and(eq(pvLectures.organizationId, organizationId), eq(pvLectures.pvId, pvId), eq(pvLectures.userId, userId)));
  if (!ligne) throw new Error("Ce procès-verbal ne vous est pas diffusé.");
  if (ligne.luLe) return { deja: true };
  await tx.update(pvLectures).set({ luLe: new Date(), updatedAt: new Date(), version: sql`${pvLectures.version} + 1` }).where(eq(pvLectures.id, ligne.id));
  await tracer(tx, organizationId, userId, "pv.lire", pvId, {});
  return { deja: false };
}

/** Relance ceux qui n'ont pas accusé lecture : une fois l'heure au plus. Rend les comptes à prévenir. */
export async function relancerPvDans(tx: Transaction, organizationId: string, pvId: string, acteur: ActeurPv, maintenant = new Date()): Promise<{ numero: string; objet: string; aRelancer: string[] }> {
  const pv = await pvVerrouille(tx, organizationId, pvId);
  if (pv.statut !== "publie" || !pv.accuseRequis) throw new Error("Seul un PV publié avec accusé de lecture se relance.");
  if (!acteur.valideur && pv.redigeParUserId !== acteur.userId) throw new Error("Seuls le rédacteur et la direction relancent.");
  if (!relancePermise(pv.derniereRelanceLe, maintenant)) throw new Error("Une relance est déjà partie il y a moins d'une heure.");
  const enAttente = await tx
    .select({ userId: pvLectures.userId })
    .from(pvLectures)
    .where(and(eq(pvLectures.pvId, pvId), isNull(pvLectures.luLe)));
  await tx.update(procesVerbaux).set({ derniereRelanceLe: maintenant, updatedAt: maintenant, version: sql`${procesVerbaux.version} + 1` }).where(eq(procesVerbaux.id, pvId));
  await tracer(tx, organizationId, acteur.userId, "pv.relancer", pvId, { relances: enAttente.length });
  return { numero: pv.numero!, objet: pv.objet, aRelancer: enAttente.map((e) => e.userId) };
}

/**
 * Change une action décidée en tâche, confiée à son responsable, avec son
 * échéance. Une fois le PV publié seulement, et une seule fois.
 */
export async function actionEnTacheDans(
  tx: Transaction,
  organizationId: string,
  actionId: string,
  acteur: ActeurPv,
): Promise<{ numeroTache: string; assigneeUserId: string; libelle: string }> {
  const [action] = await tx
    .select()
    .from(pvActions)
    .where(and(eq(pvActions.id, actionId), eq(pvActions.organizationId, organizationId), isNull(pvActions.deletedAt)))
    .for("update");
  if (!action) throw new Error("Action introuvable.");
  const [pv] = await tx.select().from(procesVerbaux).where(eq(procesVerbaux.id, action.pvId));
  if (!pv || pv.statut !== "publie") throw new Error("Publiez le procès-verbal avant d'en créer les tâches.");
  if (!acteur.valideur && pv.redigeParUserId !== acteur.userId) throw new Error("Seuls le rédacteur et la direction créent les tâches d'un PV.");
  if (action.tacheId) throw new Error("La tâche de cette action existe déjà.");

  const { id: tacheId, numero, assigneeUserId } = await creerTacheDans(
    tx,
    organizationId,
    {
      titre: action.libelle.slice(0, 160),
      description: `Action décidée au ${pv.numero} — ${pv.objet}.`,
      priorite: "normale",
      echeance: action.echeance,
      executant: action.responsableEmployeId ? { employeId: action.responsableEmployeId } : null,
    },
    // Une action décidée dans un PV publié par la direction se confie à son responsable : la publication vaut attribution.
    { userId: acteur.userId, attribue: true },
  );
  await tx.update(pvActions).set({ tacheId, updatedAt: new Date(), version: sql`${pvActions.version} + 1` }).where(eq(pvActions.id, actionId));
  await tracer(tx, organizationId, acteur.userId, "pv.action.tache", pv.id, { action: action.libelle, tache: numero });
  return { numeroTache: numero, assigneeUserId, libelle: action.libelle };
}

// ------------------------------------------------------------------ lecture

export interface LignePv {
  id: string;
  numero: string | null;
  revision: number;
  type: TypePv;
  statut: StatutPv;
  objet: string;
  dateSeance: string;
  redacteur: string;
  redigeParUserId: string;
  publieLe: Date | null;
  accuseRequis: boolean;
  confidentiel: boolean;
  /** Pour moi : destinataire, et lu ou non. */
  destinataire: boolean;
  luLe: Date | null;
  /** Une version plus récente est publiée. */
  remplace: boolean;
}

const jourIso = (v: string | Date) => (v instanceof Date ? v.toISOString().slice(0, 10) : v.slice(0, 10));

/**
 * Les PV que ce compte peut ouvrir : ceux qui lui sont diffusés et ceux qu'il
 * a rédigés ; tous, pour la direction. Le filtre sur l'entreprise est posé ici.
 */
export async function listerPv(organizationId: string, acteur: ActeurPv): Promise<LignePv[]> {
  const moi = acteur.userId;
  const lignes = await db
    .select({
      id: procesVerbaux.id,
      numero: procesVerbaux.numero,
      revision: procesVerbaux.revision,
      type: procesVerbaux.type,
      statut: procesVerbaux.statut,
      objet: procesVerbaux.objet,
      dateSeance: procesVerbaux.dateSeance,
      redacteur: users.fullName,
      redigeParUserId: procesVerbaux.redigeParUserId,
      publieLe: procesVerbaux.publieLe,
      accuseRequis: procesVerbaux.accuseRequis,
      confidentiel: procesVerbaux.confidentiel,
      lectureId: pvLectures.id,
      luLe: pvLectures.luLe,
      remplace: sql<boolean>`exists (select 1 from proces_verbaux s where s.organization_id = ${procesVerbaux.organizationId} and s.numero = ${procesVerbaux.numero} and s.revision > ${procesVerbaux.revision} and s.statut = 'publie' and s.deleted_at is null)`,
    })
    .from(procesVerbaux)
    .leftJoin(users, eq(users.id, procesVerbaux.redigeParUserId))
    .leftJoin(pvLectures, and(eq(pvLectures.pvId, procesVerbaux.id), eq(pvLectures.userId, moi)))
    .where(
      and(
        eq(procesVerbaux.organizationId, organizationId),
        isNull(procesVerbaux.deletedAt),
        acteur.valideur
          ? // La direction voit tout ; les brouillons des autres seulement une fois soumis.
            or(ne(procesVerbaux.statut, "brouillon"), eq(procesVerbaux.redigeParUserId, moi))
          : or(eq(procesVerbaux.redigeParUserId, moi), and(eq(procesVerbaux.statut, "publie"), sql`${pvLectures.id} is not null`)),
      ),
    )
    .orderBy(desc(procesVerbaux.dateSeance), desc(procesVerbaux.createdAt))
    .limit(500);
  return lignes.map((l) => ({
    ...l,
    type: l.type as TypePv,
    statut: l.statut as StatutPv,
    dateSeance: jourIso(l.dateSeance),
    redacteur: l.redacteur ?? "Ancien membre",
    destinataire: l.lectureId !== null,
    remplace: Boolean(l.remplace),
  }));
}

export interface PvComplet {
  pv: ProcesVerbal & { dateSeance: string };
  redacteur: string;
  publiePar: string | null;
  reunion: { id: string; numero: string; titre: string } | null;
  actions: { id: string; libelle: string; responsableEmployeId: string | null; responsable: string | null; echeance: string | null; tacheId: string | null; tacheNumero: string | null; tacheStatut: string | null }[];
  lectures: { userId: string; nom: string; luLe: Date | null }[];
  versions: { id: string; revision: number; statut: StatutPv; publieLe: Date | null }[];
  maLecture: { luLe: Date | null } | null;
}

/** Un PV en entier, si ce compte peut l'ouvrir ; sinon `null`. */
export async function pvComplet(organizationId: string, pvId: string, acteur: ActeurPv): Promise<PvComplet | null> {
  const [pv] = await db
    .select()
    .from(procesVerbaux)
    .where(and(eq(procesVerbaux.id, pvId), eq(procesVerbaux.organizationId, organizationId), isNull(procesVerbaux.deletedAt)));
  if (!pv) return null;
  const [maLecture] = await db
    .select({ luLe: pvLectures.luLe })
    .from(pvLectures)
    .where(and(eq(pvLectures.pvId, pvId), eq(pvLectures.userId, acteur.userId)));
  const redacteur = pv.redigeParUserId === acteur.userId;
  const voit = redacteur || (acteur.valideur && pv.statut !== "brouillon") || (pv.statut === "publie" && maLecture !== undefined);
  if (!voit) return null;

  const [noms, reunion, actions, lectures, versions] = await Promise.all([
    db.select({ id: users.id, nom: users.fullName }).from(users).where(inArray(users.id, [pv.redigeParUserId, ...(pv.publieParUserId ? [pv.publieParUserId] : [])])),
    pv.reunionId
      ? db.select({ id: reunions.id, numero: reunions.numero, titre: reunions.titre }).from(reunions).where(eq(reunions.id, pv.reunionId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        id: pvActions.id,
        libelle: pvActions.libelle,
        responsableEmployeId: pvActions.responsableEmployeId,
        responsable: employees.nom,
        echeance: pvActions.echeance,
        tacheId: pvActions.tacheId,
        tacheNumero: taches.numero,
        tacheStatut: taches.statut,
      })
      .from(pvActions)
      .leftJoin(employees, eq(employees.id, pvActions.responsableEmployeId))
      .leftJoin(taches, eq(taches.id, pvActions.tacheId))
      .where(and(eq(pvActions.pvId, pvId), isNull(pvActions.deletedAt)))
      .orderBy(asc(pvActions.rang)),
    // Le suivi des lectures n'est montré qu'au rédacteur et à la direction.
    redacteur || acteur.valideur
      ? db
          .select({ userId: pvLectures.userId, nom: users.fullName, luLe: pvLectures.luLe })
          .from(pvLectures)
          .innerJoin(users, eq(users.id, pvLectures.userId))
          .where(eq(pvLectures.pvId, pvId))
      : Promise.resolve([]),
    pv.numero
      ? db
          .select({ id: procesVerbaux.id, revision: procesVerbaux.revision, statut: procesVerbaux.statut, publieLe: procesVerbaux.publieLe })
          .from(procesVerbaux)
          .where(and(eq(procesVerbaux.organizationId, organizationId), eq(procesVerbaux.numero, pv.numero), isNull(procesVerbaux.deletedAt)))
          .orderBy(desc(procesVerbaux.revision))
      : Promise.resolve([]),
  ]);
  const nom = (id: string | null) => noms.find((n) => n.id === id)?.nom ?? null;
  return {
    pv: { ...pv, dateSeance: jourIso(pv.dateSeance) },
    redacteur: nom(pv.redigeParUserId) ?? "Ancien membre",
    publiePar: nom(pv.publieParUserId),
    reunion,
    actions: actions.map((a) => ({ ...a, echeance: a.echeance ? jourIso(a.echeance) : null })),
    lectures: lectures.map((l) => ({ ...l, nom: l.nom })),
    versions: versions.map((v) => ({ ...v, statut: v.statut as StatutPv })).filter((v) => v.statut === "publie" || v.id === pv.id),
    maLecture: maLecture ?? null,
  };
}

/** Réunions récentes dont ce compte peut tirer un PV : organisées ou suivies, des 90 derniers jours. */
export async function reunionsPourPv(organizationId: string, acteur: ActeurPv): Promise<{ id: string; numero: string; titre: string; jour: string }[]> {
  const lignes = await db
    .selectDistinct({ id: reunions.id, numero: reunions.numero, titre: reunions.titre, debut: reunions.debutPrevu })
    .from(reunions)
    .leftJoin(reunionParticipants, and(eq(reunionParticipants.reunionId, reunions.id), eq(reunionParticipants.userId, acteur.userId)))
    .where(
      and(
        eq(reunions.organizationId, organizationId),
        isNull(reunions.deletedAt),
        ne(reunions.statut, "annulee"),
        sql`${reunions.debutPrevu} > now() - interval '90 days'`,
        acteur.valideur ? sql`true` : or(eq(reunions.organisateurUserId, acteur.userId), sql`${reunionParticipants.id} is not null`),
      ),
    )
    .orderBy(desc(reunions.debutPrevu))
    .limit(50);
  return lignes.map((l) => ({ id: l.id, numero: l.numero, titre: l.titre, jour: l.debut.toISOString().slice(0, 10) }));
}

/** Services actifs du référentiel, pour la diffusion. */
export async function servicesActifs(organizationId: string): Promise<{ id: string; libelle: string }[]> {
  return db
    .select({ id: services.id, libelle: services.libelle })
    .from(services)
    .where(and(eq(services.organizationId, organizationId), eq(services.actif, true), isNull(services.deletedAt)))
    .orderBy(asc(services.ordre), asc(services.libelle));
}

export type { Diffusion };
