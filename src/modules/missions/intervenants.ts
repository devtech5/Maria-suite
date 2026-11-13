import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";
import { prestataires } from "@/modules/prestataires/schema";
import { employees, workers } from "@/modules/personnes/schema";
import { tiers } from "@/modules/tiers/schema";

import {
  bilanBudget,
  erreurBudget,
  erreurEngagement,
  estMoyen,
  estNature,
  manqueAuPaiement,
  passagePermis,
  type MoyenIntervenant,
  type NatureIntervenant,
  type StatutIntervenant,
} from "./budget";
import { intervenantsMission, missions } from "./schema";

export { aujourdhuiPour } from "@/modules/reglement/requetes";

const propre = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

export interface MissionBudgetee {
  id: string;
  reference: string;
  titre: string;
  statut: string;
  lieu: string | null;
  budget: number | null;
  collaborateur: string | null;
  intervenant: string | null;
}

export async function missionBudgetee(organizationId: string, id: string): Promise<MissionBudgetee | null> {
  const [m] = await db
    .select({ m: missions, collaborateur: employees.nom, intervenant: workers.nom })
    .from(missions)
    .leftJoin(employees, eq(employees.id, missions.employeId))
    .leftJoin(workers, eq(workers.id, missions.intervenantId))
    .where(and(eq(missions.organizationId, organizationId), eq(missions.id, id)));
  if (!m) return null;
  return { id: m.m.id, reference: m.m.reference, titre: m.m.titre, statut: m.m.statut, lieu: m.m.lieu, budget: m.m.budget, collaborateur: m.collaborateur, intervenant: m.intervenant };
}

export interface LigneIntervenant {
  id: string;
  tache: string;
  nature: NatureIntervenant;
  nom: string;
  telephone: string | null;
  montantConvenu: number;
  statut: StatutIntervenant;
  payeLe: string | null;
  moyen: MoyenIntervenant | null;
  recuPar: string | null;
  decharge: boolean;
  dechargeNom: string | null;
  motifAnnulation: string | null;
}

export async function intervenantsDe(organizationId: string, missionId: string): Promise<LigneIntervenant[]> {
  const lignes = await db
    .select()
    .from(intervenantsMission)
    .where(and(eq(intervenantsMission.organizationId, organizationId), eq(intervenantsMission.missionId, missionId), isNull(intervenantsMission.deletedAt)))
    .orderBy(asc(intervenantsMission.createdAt));
  return lignes.map((l) => ({
    id: l.id,
    tache: l.tache,
    nature: l.nature as NatureIntervenant,
    nom: l.nom,
    telephone: l.telephone,
    montantConvenu: l.montantConvenu,
    statut: l.statut as StatutIntervenant,
    payeLe: l.payeLe,
    moyen: (l.moyen as MoyenIntervenant | null) ?? null,
    recuPar: l.recuPar,
    decharge: l.dechargeChemin !== null,
    dechargeNom: l.dechargeNom,
    motifAnnulation: l.motifAnnulation,
  }));
}

/** Les personnes et structures qu'on peut confier à une mission : intervenants du registre, prestataires. */
export async function choixIntervenants(organizationId: string) {
  const [ouvriers, prestas] = await Promise.all([
    db
      .select({ id: workers.id, nom: workers.nom, telephone: workers.telephone })
      .from(workers)
      .where(and(eq(workers.organizationId, organizationId), eq(workers.actif, true)))
      .orderBy(asc(workers.nom)),
    db
      .select({ id: prestataires.id, nom: tiers.nom, telephone: tiers.telephone })
      .from(prestataires)
      .innerJoin(tiers, eq(tiers.id, prestataires.tiersId))
      .where(and(eq(prestataires.organizationId, organizationId), isNull(prestataires.deletedAt)))
      .orderBy(asc(tiers.nom)),
  ]);
  return { intervenants: ouvriers, prestataires: prestas };
}

async function engageDe(organizationId: string, missionId: string): Promise<number> {
  const lignes = await intervenantsDe(organizationId, missionId);
  return bilanBudget(null, lignes).engage;
}

/** Fixe, relève ou réduit le budget : jamais sous ce qui est déjà confié. */
export async function fixerBudgetPour(organizationId: string, userId: string, missionId: string, budget: number): Promise<void> {
  const [m] = await db.select({ budget: missions.budget }).from(missions).where(and(eq(missions.organizationId, organizationId), eq(missions.id, missionId)));
  if (!m) throw new Error("Mission introuvable.");
  const erreur = erreurBudget(budget, await engageDe(organizationId, missionId));
  if (erreur) throw new Error(erreur);
  await db.update(missions).set({ budget, updatedAt: new Date(), version: sql`${missions.version} + 1` }).where(eq(missions.id, missionId));
  await tracerPour(organizationId, userId, { action: "mission.budget", entite: "mission", entiteId: missionId, avant: { budget: m.budget }, apres: { budget } });
}

export interface NouvelIntervenant {
  tache: string;
  nature: string;
  nom?: string | null;
  telephone?: string | null;
  workerId?: string | null;
  prestataireId?: string | null;
  montantConvenu: number;
}

/** Confie une tâche à un intervenant, dans la limite du budget de la mission. */
export async function confierIntervenantPour(organizationId: string, userId: string, missionId: string, n: NouvelIntervenant): Promise<{ id: string }> {
  if (!estNature(n.nature)) throw new Error("Précisez s'il s'agit d'un intervenant, d'une entreprise ou d'un prestataire.");
  const tache = propre(n.tache, 120);
  if (!tache || tache.length < 3) throw new Error("Dites la tâche confiée : manutention, vente, nettoyage…");
  const id = newId();
  await db.transaction(async (tx) => {
    // La mission est verrouillée le temps du contrôle : deux confiés en même temps ne dépassent pas le budget à deux.
    const [m] = await tx
      .select({ budget: missions.budget, statut: missions.statut })
      .from(missions)
      .where(and(eq(missions.organizationId, organizationId), eq(missions.id, missionId)))
      .for("update");
    if (!m) throw new Error("Mission introuvable.");
    if (m.statut === "terminee" || m.statut === "echouee" || m.statut === "annulee") throw new Error("Cette mission est close : on n'y confie plus de tâche.");
    const lignes = await tx
      .select({ statut: intervenantsMission.statut, montantConvenu: intervenantsMission.montantConvenu })
      .from(intervenantsMission)
      .where(and(eq(intervenantsMission.missionId, missionId), isNull(intervenantsMission.deletedAt)));
    const erreur = erreurEngagement(m.budget, bilanBudget(null, lignes as { statut: StatutIntervenant; montantConvenu: number }[]).engage, n.montantConvenu);
    if (erreur) throw new Error(erreur);

    let nom = propre(n.nom, 120);
    let telephone = propre(n.telephone, 40);
    let workerId: string | null = null;
    let prestataireId: string | null = null;
    if (n.workerId) {
      const [w] = await tx.select({ nom: workers.nom, telephone: workers.telephone }).from(workers).where(and(eq(workers.organizationId, organizationId), eq(workers.id, n.workerId)));
      if (!w) throw new Error("Intervenant introuvable.");
      workerId = n.workerId;
      nom = w.nom;
      telephone = telephone ?? w.telephone;
    } else if (n.prestataireId) {
      const [p] = await tx
        .select({ nom: tiers.nom, telephone: tiers.telephone })
        .from(prestataires)
        .innerJoin(tiers, eq(tiers.id, prestataires.tiersId))
        .where(and(eq(prestataires.organizationId, organizationId), eq(prestataires.id, n.prestataireId)));
      if (!p) throw new Error("Prestataire introuvable.");
      prestataireId = n.prestataireId;
      nom = p.nom;
      telephone = telephone ?? p.telephone;
    }
    if (!nom || nom.length < 2) throw new Error("Indiquez qui intervient : choisissez dans la liste, ou saisissez son nom.");

    await tx.insert(intervenantsMission).values({ id, organizationId, missionId, tache, nature: n.nature, nom, telephone, workerId, prestataireId, montantConvenu: n.montantConvenu, creeParUserId: userId });
  });
  await tracerPour(organizationId, userId, { action: "mission.intervenant.confier", entite: "mission", entiteId: missionId, apres: { intervenant: id, tache, montant: n.montantConvenu } });
  return { id };
}

export interface Decharge {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

/**
 * Paie un intervenant sur place. La décharge est obligatoire : le fichier part
 * d'abord au dépôt, la fiche s'écrit ensuite ; si elle échoue, le fichier est
 * retiré. Sans décharge, sans date ou sans nom de qui a reçu, rien ne se paie.
 */
export async function payerIntervenantPour(
  organizationId: string,
  userId: string,
  id: string,
  p: { payeLe: string; moyen: string; recuPar: string; decharge: Decharge | null },
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.payeLe) || Number.isNaN(Date.parse(`${p.payeLe}T00:00:00Z`))) throw new Error("Date de paiement invalide.");
  if (!estMoyen(p.moyen)) throw new Error("Choisissez le moyen de paiement.");
  const manque = manqueAuPaiement(p.recuPar, p.decharge !== null);
  if (manque) throw new Error(manque);
  const decharge = p.decharge as Decharge;

  const [l] = await db
    .select({ statut: intervenantsMission.statut, nom: intervenantsMission.nom, montant: intervenantsMission.montantConvenu, missionId: intervenantsMission.missionId })
    .from(intervenantsMission)
    .where(and(eq(intervenantsMission.organizationId, organizationId), eq(intervenantsMission.id, id), isNull(intervenantsMission.deletedAt)));
  if (!l) throw new Error("Intervenant introuvable.");
  if (!passagePermis(l.statut as StatutIntervenant, "paye")) throw new Error(l.statut === "paye" ? "Cet intervenant est déjà payé." : "Cet intervenant est annulé : il ne se paie plus.");

  const extension = decharge.nom.includes(".") ? decharge.nom.split(".").pop()! : "jpg";
  const chemin = cheminDe(organizationId, newId(), extension);
  const depot = await deposer({ chemin, contenu: decharge.contenu, typeMime: decharge.typeMime });
  if (!depot.ok) throw new Error(depot.raison);
  try {
    const [modifie] = await db
      .update(intervenantsMission)
      .set({
        statut: "paye",
        payeLe: p.payeLe,
        moyen: p.moyen,
        recuPar: propre(p.recuPar, 120),
        dechargeChemin: chemin,
        dechargeNom: decharge.nom,
        dechargeType: decharge.typeMime,
        payeParUserId: userId,
        updatedAt: new Date(),
        version: sql`${intervenantsMission.version} + 1`,
      })
      .where(and(eq(intervenantsMission.id, id), eq(intervenantsMission.statut, "a_payer")))
      .returning({ id: intervenantsMission.id });
    if (!modifie) throw new Error("Cet intervenant n'est plus à payer.");
  } catch (erreur) {
    await supprimer(chemin);
    throw erreur;
  }
  await tracerPour(organizationId, userId, { action: "mission.intervenant.payer", entite: "mission", entiteId: l.missionId, apres: { intervenant: id, nom: l.nom, montant: l.montant, moyen: p.moyen, payeLe: p.payeLe } });
}

export async function annulerIntervenantPour(organizationId: string, userId: string, id: string, motif: string): Promise<void> {
  const raison = propre(motif, 500);
  if (!raison || raison.length < 3) throw new Error("Dites pourquoi la tâche est annulée.");
  const [l] = await db
    .select({ statut: intervenantsMission.statut, missionId: intervenantsMission.missionId, nom: intervenantsMission.nom })
    .from(intervenantsMission)
    .where(and(eq(intervenantsMission.organizationId, organizationId), eq(intervenantsMission.id, id), isNull(intervenantsMission.deletedAt)));
  if (!l) throw new Error("Intervenant introuvable.");
  if (!passagePermis(l.statut as StatutIntervenant, "annule")) throw new Error(l.statut === "paye" ? "Cet intervenant est payé : la tâche ne s'annule plus." : "Cette tâche est déjà annulée.");
  await db
    .update(intervenantsMission)
    .set({ statut: "annule", motifAnnulation: raison, updatedAt: new Date(), version: sql`${intervenantsMission.version} + 1` })
    .where(and(eq(intervenantsMission.id, id), eq(intervenantsMission.statut, "a_payer")));
  await tracerPour(organizationId, userId, { action: "mission.intervenant.annuler", entite: "mission", entiteId: l.missionId, apres: { intervenant: id, nom: l.nom, motif: raison } });
}

/** Clé du dépôt de la décharge, pour l'ouvrir par URL signée. */
export async function cheminDecharge(organizationId: string, id: string): Promise<string | null> {
  const [l] = await db
    .select({ chemin: intervenantsMission.dechargeChemin })
    .from(intervenantsMission)
    .where(and(eq(intervenantsMission.organizationId, organizationId), eq(intervenantsMission.id, id), isNull(intervenantsMission.deletedAt)));
  return l?.chemin ?? null;
}
