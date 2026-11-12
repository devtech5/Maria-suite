import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { commerciaux } from "@/modules/commerciaux/schema";
import { employees } from "@/modules/personnes/schema";
import { enregistrerContactDans } from "@/modules/tiers/contacts";
import { creerTiersDans } from "@/modules/tiers/creation";
import { estNatureTiers, estPersonneMorale, type NatureTiers } from "@/modules/tiers/natures";
import { tiers } from "@/modules/tiers/schema";

import {
  HEURE,
  convertible,
  erreurPeriode,
  estCanal,
  estDate,
  estStatutProspect,
  formatNumero,
  passagePermis,
  type Canal,
  type StatutAction,
  type StatutPlan,
  type StatutProspect,
} from "./regles";
import { actionsProspection, plansProspection, prospects, type PlanProspection } from "./schema";

export { aujourdhuiPour } from "@/modules/reglement/requetes";

const propre = (v: string | null | undefined, max = 500): string | null => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};
/** Entier positif ; absent = 0 ; autre chose = -1, refusé par l'appelant. */
const entier = (v: number | undefined): number => (v === undefined ? 0 : Number.isInteger(v) && v >= 0 ? v : -1);

// ------------------------------------------------------------------ lecture

/** Nom du commercial : celui de sa fiche salarié, sinon du compte, sinon saisi. */
const nomCommercial = sql<string>`coalesce(${employees.nom}, ${users.fullName}, ${commerciaux.nom})`;

export async function commerciauxActifs(organizationId: string) {
  return db
    .select({ id: commerciaux.id, nom: nomCommercial })
    .from(commerciaux)
    .leftJoin(employees, eq(employees.id, commerciaux.employeeId))
    .leftJoin(users, eq(users.id, commerciaux.userId))
    .where(and(eq(commerciaux.organizationId, organizationId), eq(commerciaux.actif, true), isNull(commerciaux.deletedAt)))
    .orderBy(nomCommercial);
}

export type LignePlan = PlanProspection & { commercial: string };

export async function plansDe(organizationId: string, filtre: { commercialId?: string | null } = {}): Promise<LignePlan[]> {
  const conditions = [eq(plansProspection.organizationId, organizationId), isNull(plansProspection.deletedAt)];
  if (filtre.commercialId !== undefined) {
    if (filtre.commercialId === null) return [];
    conditions.push(eq(plansProspection.commercialId, filtre.commercialId));
  }
  const lignes = await db
    .select({ plan: plansProspection, commercial: nomCommercial })
    .from(plansProspection)
    .innerJoin(commerciaux, eq(commerciaux.id, plansProspection.commercialId))
    .leftJoin(employees, eq(employees.id, commerciaux.employeeId))
    .leftJoin(users, eq(users.id, commerciaux.userId))
    .where(and(...conditions))
    .orderBy(desc(plansProspection.debut), desc(plansProspection.createdAt));
  return lignes.map((l) => ({ ...l.plan, commercial: l.commercial }));
}

export async function planDe(organizationId: string, id: string): Promise<LignePlan | null> {
  const lignes = await db
    .select({ plan: plansProspection, commercial: nomCommercial })
    .from(plansProspection)
    .innerJoin(commerciaux, eq(commerciaux.id, plansProspection.commercialId))
    .leftJoin(employees, eq(employees.id, commerciaux.employeeId))
    .leftJoin(users, eq(users.id, commerciaux.userId))
    .where(and(eq(plansProspection.organizationId, organizationId), eq(plansProspection.id, id), isNull(plansProspection.deletedAt)));
  return lignes[0] ? { ...lignes[0].plan, commercial: lignes[0].commercial } : null;
}

export interface ActionVue {
  id: string;
  prospectId: string;
  datePrevue: string;
  heure: string | null;
  canal: Canal;
  objet: string;
  statut: StatutAction;
  compteRendu: string | null;
}

export interface ProspectVue {
  id: string;
  planId: string;
  nom: string;
  nature: NatureTiers;
  contact: string | null;
  fonction: string | null;
  telephone: string | null;
  email: string | null;
  ville: string | null;
  secteur: string | null;
  besoin: string | null;
  potentiel: number;
  statut: StatutProspect;
  motifPerte: string | null;
  tiersId: string | null;
  client: string | null;
  actions: ActionVue[];
}

/** Les prospects de plusieurs plans, chacun avec ses actions, en deux requêtes. */
export async function prospectsDes(organizationId: string, planIds: readonly string[]): Promise<ProspectVue[]> {
  if (planIds.length === 0) return [];
  const lignes = await db
    .select({ p: prospects, client: tiers.code })
    .from(prospects)
    .leftJoin(tiers, eq(tiers.id, prospects.tiersId))
    .where(and(eq(prospects.organizationId, organizationId), inArray(prospects.planId, [...planIds]), isNull(prospects.deletedAt)))
    .orderBy(asc(prospects.createdAt));
  const ids = lignes.map((l) => l.p.id);
  const actions =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(actionsProspection)
          .where(and(eq(actionsProspection.organizationId, organizationId), inArray(actionsProspection.prospectId, ids), isNull(actionsProspection.deletedAt)))
          .orderBy(asc(actionsProspection.datePrevue), asc(actionsProspection.heure));
  const parProspect = new Map<string, ActionVue[]>();
  for (const a of actions) {
    const liste = parProspect.get(a.prospectId) ?? [];
    liste.push({ id: a.id, prospectId: a.prospectId, datePrevue: a.datePrevue, heure: a.heure, canal: a.canal as Canal, objet: a.objet, statut: a.statut as StatutAction, compteRendu: a.compteRendu });
    parProspect.set(a.prospectId, liste);
  }
  return lignes.map(({ p, client }) => ({
    id: p.id,
    planId: p.planId,
    nom: p.nom,
    nature: p.nature,
    contact: p.contact,
    fonction: p.fonction,
    telephone: p.telephone,
    email: p.email,
    ville: p.ville,
    secteur: p.secteur,
    besoin: p.besoin,
    potentiel: p.potentiel,
    statut: p.statut as StatutProspect,
    motifPerte: p.motifPerte,
    tiersId: p.tiersId,
    client,
    actions: parProspect.get(p.id) ?? [],
  }));
}

/** Le plan auquel appartient un prospect, ou une action : pour vérifier l'accès avant d'agir. */
export async function planDuProspect(organizationId: string, prospectId: string): Promise<PlanProspection | null> {
  const [l] = await db
    .select({ plan: plansProspection })
    .from(prospects)
    .innerJoin(plansProspection, eq(plansProspection.id, prospects.planId))
    .where(and(eq(prospects.organizationId, organizationId), eq(prospects.id, prospectId), isNull(prospects.deletedAt)));
  return l?.plan ?? null;
}

export async function planDeLAction(organizationId: string, actionId: string): Promise<PlanProspection | null> {
  const [l] = await db
    .select({ plan: plansProspection })
    .from(actionsProspection)
    .innerJoin(prospects, eq(prospects.id, actionsProspection.prospectId))
    .innerJoin(plansProspection, eq(plansProspection.id, prospects.planId))
    .where(and(eq(actionsProspection.organizationId, organizationId), eq(actionsProspection.id, actionId), isNull(actionsProspection.deletedAt)));
  return l?.plan ?? null;
}

// ---------------------------------------------------------------- écriture

export interface NouveauPlan {
  commercialId: string;
  titre: string;
  debut: string;
  fin: string;
  zone?: string | null;
  cibles?: string | null;
  objectifContacts?: number;
  objectifClients?: number;
  objectifCa?: number;
  notes?: string | null;
}

export async function creerPlanPour(organizationId: string, userId: string, n: NouveauPlan): Promise<{ id: string; numero: string }> {
  const titre = propre(n.titre, 160);
  if (!titre || titre.length < 3) throw new Error("Donnez un titre au plan.");
  const periode = erreurPeriode(n.debut, n.fin);
  if (periode) throw new Error(periode);
  const objectifs = { objectifContacts: entier(n.objectifContacts), objectifClients: entier(n.objectifClients), objectifCa: entier(n.objectifCa) };
  if (Object.values(objectifs).some((v) => v < 0)) throw new Error("Les objectifs sont des nombres entiers positifs.");
  const [commercial] = await db
    .select({ id: commerciaux.id })
    .from(commerciaux)
    .where(and(eq(commerciaux.organizationId, organizationId), eq(commerciaux.id, n.commercialId), eq(commerciaux.actif, true), isNull(commerciaux.deletedAt)));
  if (!commercial) throw new Error("Commercial introuvable.");

  const id = newId();
  const numero = await db.transaction(async (tx) => {
    const num = await prochainNumero(tx, organizationId, formatNumero(Number(n.debut.slice(0, 4))));
    await tx.insert(plansProspection).values({
      id,
      organizationId,
      numero: num,
      commercialId: commercial.id,
      titre,
      debut: n.debut,
      fin: n.fin,
      zone: propre(n.zone, 200),
      cibles: propre(n.cibles, 1000),
      ...objectifs,
      notes: propre(n.notes, 2000),
      creePar: userId,
    });
    return num;
  });
  await tracerPour(organizationId, userId, { action: "prospection.plan.creer", entite: "plan_prospection", entiteId: id, apres: { numero, titre } });
  return { id, numero };
}

export async function changerStatutPlanPour(organizationId: string, userId: string, planId: string, statut: StatutPlan): Promise<void> {
  const [modifie] = await db
    .update(plansProspection)
    .set({ statut, closLe: statut === "clos" ? new Date() : null, updatedAt: new Date(), version: sql`${plansProspection.version} + 1` })
    .where(and(eq(plansProspection.organizationId, organizationId), eq(plansProspection.id, planId)))
    .returning({ numero: plansProspection.numero });
  if (!modifie) throw new Error("Plan introuvable.");
  await tracerPour(organizationId, userId, { action: statut === "clos" ? "prospection.plan.clore" : "prospection.plan.rouvrir", entite: "plan_prospection", entiteId: planId, apres: { numero: modifie.numero } });
}

async function exigerPlanOuvert(tx: Pick<Transaction, "select">, organizationId: string, planId: string): Promise<void> {
  const [p] = await tx
    .select({ statut: plansProspection.statut })
    .from(plansProspection)
    .where(and(eq(plansProspection.organizationId, organizationId), eq(plansProspection.id, planId), isNull(plansProspection.deletedAt)));
  if (!p) throw new Error("Plan introuvable.");
  if (p.statut !== "ouvert") throw new Error("Ce plan est clos : rouvrez-le pour le modifier.");
}

export interface NouveauProspect {
  nom: string;
  nature: string;
  contact?: string | null;
  fonction?: string | null;
  telephone?: string | null;
  email?: string | null;
  ville?: string | null;
  secteur?: string | null;
  besoin?: string | null;
  potentiel?: number;
}

export async function ajouterProspectPour(organizationId: string, userId: string, planId: string, n: NouveauProspect): Promise<{ id: string }> {
  const nom = propre(n.nom, 160);
  if (!nom || nom.length < 2) throw new Error("Indiquez le nom du prospect.");
  if (!estNatureTiers(n.nature)) throw new Error("Choisissez le type de prospect.");
  const potentiel = entier(n.potentiel);
  if (potentiel < 0) throw new Error("Le potentiel est un montant entier en francs.");
  const email = propre(n.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  await exigerPlanOuvert(db, organizationId, planId);
  const id = newId();
  await db.insert(prospects).values({
    id,
    organizationId,
    planId,
    nom,
    nature: n.nature,
    contact: propre(n.contact, 120),
    fonction: propre(n.fonction, 120),
    telephone: propre(n.telephone, 40),
    email,
    ville: propre(n.ville, 80),
    secteur: propre(n.secteur, 80),
    besoin: propre(n.besoin, 1000),
    potentiel,
    creePar: userId,
  });
  await tracerPour(organizationId, userId, { action: "prospection.prospect.ajouter", entite: "prospect", entiteId: id, apres: { nom, nature: n.nature } });
  return { id };
}

async function prospectDe(tx: Pick<Transaction, "select">, organizationId: string, prospectId: string) {
  const [p] = await tx
    .select()
    .from(prospects)
    .where(and(eq(prospects.organizationId, organizationId), eq(prospects.id, prospectId), isNull(prospects.deletedAt)));
  if (!p) throw new Error("Prospect introuvable.");
  return p;
}

export async function changerStatutProspectPour(organizationId: string, userId: string, prospectId: string, statut: string, motifPerte?: string | null): Promise<void> {
  if (!estStatutProspect(statut) || statut === "converti") throw new Error("Statut inconnu.");
  const p = await prospectDe(db, organizationId, prospectId);
  await exigerPlanOuvert(db, organizationId, p.planId);
  const de = p.statut as StatutProspect;
  if (!passagePermis(de, statut)) throw new Error("Ce prospect ne peut pas prendre ce statut.");
  const motif = propre(motifPerte, 500);
  if (statut === "perdu" && !motif) throw new Error("Dites pourquoi la piste est perdue : c'est ce qui sert au prochain plan.");
  await db
    .update(prospects)
    .set({ statut, motifPerte: statut === "perdu" ? motif : null, updatedAt: new Date(), version: sql`${prospects.version} + 1` })
    .where(and(eq(prospects.organizationId, organizationId), eq(prospects.id, prospectId)));
  await tracerPour(organizationId, userId, { action: "prospection.prospect.statut", entite: "prospect", entiteId: prospectId, avant: { statut: de }, apres: { statut, motif } });
}

export interface NouvelleAction {
  datePrevue: string;
  heure?: string | null;
  canal: string;
  objet: string;
}

function valeursAction(n: NouvelleAction): { datePrevue: string; heure: string | null; canal: Canal; objet: string } {
  if (!estDate(n.datePrevue)) throw new Error("Indiquez la date de l'action.");
  const heure = propre(n.heure, 5);
  if (heure && !HEURE.test(heure)) throw new Error("Heure invalide (HH:MM).");
  if (!estCanal(n.canal)) throw new Error("Choisissez le canal : visite, appel, WhatsApp…");
  const objet = propre(n.objet, 300);
  if (!objet) throw new Error("Dites l'objet de l'action : présentation, relance, démonstration…");
  return { datePrevue: n.datePrevue, heure, canal: n.canal, objet };
}

async function insererAction(tx: Pick<Transaction, "insert">, organizationId: string, userId: string, prospectId: string, v: ReturnType<typeof valeursAction>): Promise<string> {
  const id = newId();
  await tx.insert(actionsProspection).values({ id, organizationId, prospectId, ...v, creePar: userId });
  return id;
}

export async function planifierActionPour(organizationId: string, userId: string, prospectId: string, n: NouvelleAction): Promise<{ id: string }> {
  const v = valeursAction(n);
  const p = await prospectDe(db, organizationId, prospectId);
  await exigerPlanOuvert(db, organizationId, p.planId);
  if (!convertible(p.statut as StatutProspect)) throw new Error("Ce prospect est clos : rouvrez-le avant de planifier.");
  const id = await insererAction(db, organizationId, userId, prospectId, v);
  return { id };
}

export interface CompteRendu {
  compteRendu: string;
  /** Où en est le prospect après l'action ; inchangé si absent. */
  statutProspect?: string | null;
  motifPerte?: string | null;
  /** L'action suivante, planifiée dans la foulée. */
  suite?: NouvelleAction | null;
}

/**
 * Réalise une action : son compte rendu, le nouveau statut du prospect et,
 * s'il y en a une, l'action suivante — tout ou rien.
 */
export async function realiserActionPour(organizationId: string, userId: string, actionId: string, cr: CompteRendu): Promise<void> {
  const texte = propre(cr.compteRendu, 2000);
  if (!texte) throw new Error("Rédigez le compte rendu : ce qui a été dit, ce qui est convenu.");
  const suite = cr.suite ? valeursAction(cr.suite) : null;
  await db.transaction(async (tx) => {
    const [a] = await tx
      .select()
      .from(actionsProspection)
      .where(and(eq(actionsProspection.organizationId, organizationId), eq(actionsProspection.id, actionId), isNull(actionsProspection.deletedAt)));
    if (!a) throw new Error("Action introuvable.");
    if (a.statut !== "prevue") throw new Error("Cette action n'est plus à faire.");
    const p = await prospectDe(tx, organizationId, a.prospectId);
    await exigerPlanOuvert(tx, organizationId, p.planId);
    await tx
      .update(actionsProspection)
      .set({ statut: "realisee", compteRendu: texte, realiseeLe: new Date(), realiseePar: userId, updatedAt: new Date(), version: sql`${actionsProspection.version} + 1` })
      .where(eq(actionsProspection.id, actionId));

    const vers = cr.statutProspect || p.statut;
    if (vers !== p.statut) {
      if (!estStatutProspect(vers) || vers === "converti") throw new Error("Statut inconnu.");
      if (!passagePermis(p.statut as StatutProspect, vers)) throw new Error("Ce prospect ne peut pas prendre ce statut.");
      const motif = propre(cr.motifPerte, 500);
      if (vers === "perdu" && !motif) throw new Error("Dites pourquoi la piste est perdue.");
      await tx
        .update(prospects)
        .set({ statut: vers, motifPerte: vers === "perdu" ? motif : null, updatedAt: new Date(), version: sql`${prospects.version} + 1` })
        .where(eq(prospects.id, p.id));
    }
    if (suite && vers !== "perdu") await insererAction(tx, organizationId, userId, p.id, suite);
  });
  await tracerPour(organizationId, userId, { action: "prospection.action.realiser", entite: "action_prospection", entiteId: actionId });
}

export async function annulerActionPour(organizationId: string, userId: string, actionId: string): Promise<void> {
  const plan = await planDeLAction(organizationId, actionId);
  if (!plan) throw new Error("Action introuvable.");
  await exigerPlanOuvert(db, organizationId, plan.id);
  const [modifie] = await db
    .update(actionsProspection)
    .set({ statut: "annulee", updatedAt: new Date(), version: sql`${actionsProspection.version} + 1` })
    .where(and(eq(actionsProspection.organizationId, organizationId), eq(actionsProspection.id, actionId), eq(actionsProspection.statut, "prevue")))
    .returning({ id: actionsProspection.id });
  if (!modifie) throw new Error("Cette action n'est plus à faire.");
  await tracerPour(organizationId, userId, { action: "prospection.action.annuler", entite: "action_prospection", entiteId: actionId });
}

/**
 * Le prospect devient client : une fiche client naît avec son type, sa
 * référence et son compte 411 ; la personne rencontrée devient son contact
 * principal. Ou, s'il était déjà au fichier, on rattache sa fiche.
 */
export async function convertirProspectPour(organizationId: string, userId: string, prospectId: string, tiersExistantId?: string | null): Promise<{ tiersId: string; code: string }> {
  const resultat = await db.transaction(async (tx) => {
    const p = await prospectDe(tx, organizationId, prospectId);
    await exigerPlanOuvert(tx, organizationId, p.planId);
    if (!convertible(p.statut as StatutProspect)) throw new Error(p.statut === "converti" ? "Ce prospect est déjà client." : "Rouvrez d'abord cette piste perdue.");

    let client: { id: string; code: string };
    if (tiersExistantId) {
      const [t] = await tx
        .select({ id: tiers.id, code: tiers.code, estClient: tiers.estClient })
        .from(tiers)
        .where(and(eq(tiers.organizationId, organizationId), eq(tiers.id, tiersExistantId), isNull(tiers.deletedAt)));
      if (!t) throw new Error("Fiche client introuvable.");
      if (!t.estClient) throw new Error("Cette fiche n'est pas un client.");
      client = { id: t.id, code: t.code };
    } else {
      client = await creerTiersDans(
        tx,
        organizationId,
        {
          nom: p.nom,
          nature: p.nature,
          estClient: true,
          telephone: p.telephone,
          email: p.email,
          ville: p.ville,
          secteur: p.secteur,
          notes: p.besoin,
        },
        userId,
      );
      if (p.contact && estPersonneMorale(p.nature)) {
        await enregistrerContactDans(tx, organizationId, client.id, null, { nom: p.contact, fonction: p.fonction, telephone: p.telephone, email: p.email, principal: true }, userId);
      }
    }
    await tx
      .update(prospects)
      .set({ statut: "converti", tiersId: client.id, convertiLe: new Date(), motifPerte: null, updatedAt: new Date(), version: sql`${prospects.version} + 1` })
      .where(eq(prospects.id, p.id));
    // Une piste convertie n'a plus d'actions en attente : la suite se fait côté client.
    await tx
      .update(actionsProspection)
      .set({ statut: "annulee", updatedAt: new Date(), version: sql`${actionsProspection.version} + 1` })
      .where(and(eq(actionsProspection.prospectId, p.id), eq(actionsProspection.statut, "prevue")));
    return { tiersId: client.id, code: client.code, nom: p.nom };
  });
  await tracerPour(organizationId, userId, { action: "prospection.prospect.convertir", entite: "prospect", entiteId: prospectId, apres: { tiers: resultat.code } });
  return { tiersId: resultat.tiersId, code: resultat.code };
}

/** Clients actifs, pour rattacher un prospect déjà au fichier. */
export async function clientsPourRattacher(organizationId: string) {
  return db
    .select({ id: tiers.id, code: tiers.code, nom: tiers.nom })
    .from(tiers)
    .where(and(eq(tiers.organizationId, organizationId), eq(tiers.estClient, true), eq(tiers.actif, true), isNull(tiers.deletedAt)))
    .orderBy(asc(tiers.nom));
}
