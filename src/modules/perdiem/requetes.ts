import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { prochainNumero } from "@/lib/sequences";
import { missions } from "@/modules/missions/schema";
import { employees } from "@/modules/personnes/schema";

import {
  erreurJours,
  erreurMontant,
  estDate,
  estMoyen,
  formatNumero,
  montantAttribution,
  passagePermis,
  type MoyenPerdiem,
  type StatutPerdiem,
} from "./regles";
import { attributionsPerdiem, baremesPerdiem } from "./schema";

export { aujourdhuiPour } from "@/modules/reglement/requetes";

const propre = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

// ------------------------------------------------------------------ barème

export interface LigneBareme {
  id: string;
  libelle: string;
  montantJournalier: number;
  notes: string | null;
  actif: boolean;
  /** Attributions faites sur cette ligne : s'il y en a, elle se retire du barème au lieu de s'effacer. */
  utilisations: number;
}

export async function listerBareme(organizationId: string): Promise<LigneBareme[]> {
  const lignes = await db.execute<{ id: string; libelle: string; montant: string; notes: string | null; actif: boolean; utilisations: string }>(sql`
    select b.id, b.libelle, b.montant_journalier as montant, b.notes, b.actif,
           (select count(*) from attributions_perdiem a where a.bareme_id = b.id) as utilisations
    from baremes_perdiem b
    where b.organization_id = ${organizationId} and b.deleted_at is null
    order by b.actif desc, b.montant_journalier, lower(b.libelle)`);
  return lignes.map((l) => ({ id: l.id, libelle: l.libelle, montantJournalier: Number(l.montant), notes: l.notes, actif: l.actif, utilisations: Number(l.utilisations) }));
}

export interface SaisieBareme {
  libelle: string;
  montantJournalier: number;
  notes?: string | null;
  actif?: boolean;
}

function controlerBareme(s: SaisieBareme): { libelle: string; notes: string | null } {
  const libelle = propre(s.libelle, 120);
  if (!libelle || libelle.length < 2) throw new Error("Donnez un libellé à la ligne du barème : « Abidjan », « Intérieur du pays »…");
  const erreur = erreurMontant(s.montantJournalier);
  if (erreur) throw new Error(erreur);
  return { libelle, notes: propre(s.notes, 500) };
}

const estDoublonLibelle = (e: unknown) => e instanceof Error && /baremes_perdiem_libelle_unique/.test(`${e.message} ${(e as { cause?: { message?: string } }).cause?.message ?? ""}`);

export async function ajouterBaremePour(organizationId: string, userId: string, s: SaisieBareme): Promise<{ id: string }> {
  const { libelle, notes } = controlerBareme(s);
  const id = newId();
  try {
    await db.insert(baremesPerdiem).values({ id, organizationId, libelle, montantJournalier: s.montantJournalier, notes, actif: s.actif ?? true });
  } catch (e) {
    if (estDoublonLibelle(e)) throw new Error(`« ${libelle} » est déjà au barème : modifiez sa ligne.`);
    throw e;
  }
  await tracerPour(organizationId, userId, { action: "perdiem.bareme.ajouter", entite: "bareme_perdiem", entiteId: id, apres: { libelle, montant: s.montantJournalier } });
  return { id };
}

export async function modifierBaremePour(organizationId: string, userId: string, id: string, s: SaisieBareme): Promise<void> {
  const { libelle, notes } = controlerBareme(s);
  const [avant] = await db
    .select({ libelle: baremesPerdiem.libelle, montant: baremesPerdiem.montantJournalier })
    .from(baremesPerdiem)
    .where(and(eq(baremesPerdiem.organizationId, organizationId), eq(baremesPerdiem.id, id), isNull(baremesPerdiem.deletedAt)));
  if (!avant) throw new Error("Ligne du barème introuvable.");
  try {
    await db
      .update(baremesPerdiem)
      .set({ libelle, montantJournalier: s.montantJournalier, notes, actif: s.actif ?? true, updatedAt: new Date(), version: sql`${baremesPerdiem.version} + 1` })
      .where(eq(baremesPerdiem.id, id));
  } catch (e) {
    if (estDoublonLibelle(e)) throw new Error(`« ${libelle} » est déjà au barème.`);
    throw e;
  }
  await tracerPour(organizationId, userId, {
    action: "perdiem.bareme.modifier",
    entite: "bareme_perdiem",
    entiteId: id,
    avant: { libelle: avant.libelle, montant: avant.montant },
    apres: { libelle, montant: s.montantJournalier },
  });
}

/**
 * Supprime une ligne du barème. Une ligne jamais utilisée s'efface (suppression
 * logique, tracée) ; une ligne qui a servi à une attribution se retire du
 * barème — elle n'est plus proposée, ses attributions gardent leur montant.
 */
export async function supprimerBaremePour(organizationId: string, userId: string, id: string): Promise<"supprimee" | "retiree"> {
  const [ligne] = await db
    .select({ id: baremesPerdiem.id, libelle: baremesPerdiem.libelle })
    .from(baremesPerdiem)
    .where(and(eq(baremesPerdiem.organizationId, organizationId), eq(baremesPerdiem.id, id), isNull(baremesPerdiem.deletedAt)));
  if (!ligne) throw new Error("Ligne du barème introuvable.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(attributionsPerdiem).where(eq(attributionsPerdiem.baremeId, id));
  const utilisee = n > 0;
  await db
    .update(baremesPerdiem)
    .set(utilisee ? { actif: false, updatedAt: new Date() } : { deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(baremesPerdiem.id, id));
  await tracerPour(organizationId, userId, { action: utilisee ? "perdiem.bareme.retirer" : "perdiem.bareme.supprimer", entite: "bareme_perdiem", entiteId: id, apres: { libelle: ligne.libelle } });
  return utilisee ? "retiree" : "supprimee";
}

// ------------------------------------------------------------- attributions

export interface LigneAttribution {
  id: string;
  numero: string;
  collaborateur: string;
  baremeLibelle: string;
  montantJournalier: number;
  jours: number;
  montantTotal: number;
  debut: string | null;
  motif: string | null;
  mission: string | null;
  statut: StatutPerdiem;
  payeLe: string | null;
  moyen: MoyenPerdiem | null;
  reference: string | null;
  motifAnnulation: string | null;
  creeLe: Date;
}

export async function listerAttributions(organizationId: string, filtre: { statut?: StatutPerdiem; employeeId?: string; limite?: number } = {}): Promise<LigneAttribution[]> {
  const conditions = [eq(attributionsPerdiem.organizationId, organizationId), isNull(attributionsPerdiem.deletedAt)];
  if (filtre.statut) conditions.push(eq(attributionsPerdiem.statut, filtre.statut));
  if (filtre.employeeId) conditions.push(eq(attributionsPerdiem.employeeId, filtre.employeeId));
  const lignes = await db
    .select({ a: attributionsPerdiem, collaborateur: employees.nom, mission: missions.reference })
    .from(attributionsPerdiem)
    .innerJoin(employees, eq(employees.id, attributionsPerdiem.employeeId))
    .leftJoin(missions, eq(missions.id, attributionsPerdiem.missionId))
    .where(and(...conditions))
    .orderBy(desc(attributionsPerdiem.createdAt))
    .limit(filtre.limite ?? 300);
  return lignes.map(({ a, collaborateur, mission }) => ({
    id: a.id,
    numero: a.numero,
    collaborateur,
    baremeLibelle: a.baremeLibelle,
    montantJournalier: a.montantJournalier,
    jours: a.jours,
    montantTotal: a.montantTotal,
    debut: a.debut,
    motif: a.motif,
    mission,
    statut: a.statut as StatutPerdiem,
    payeLe: a.payeLe,
    moyen: (a.moyen as MoyenPerdiem | null) ?? null,
    reference: a.reference,
    motifAnnulation: a.motifAnnulation,
    creeLe: a.createdAt,
  }));
}

/** Les listes de choix du formulaire d'attribution : collaborateurs en poste, lignes du barème, missions ouvertes. */
export async function choixAttribution(organizationId: string) {
  const [collaborateurs, bareme, ouvertes] = await Promise.all([
    db
      .select({ id: employees.id, nom: employees.nom, poste: employees.poste })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt)))
      .orderBy(asc(employees.nom)),
    db
      .select({ id: baremesPerdiem.id, libelle: baremesPerdiem.libelle, montant: baremesPerdiem.montantJournalier })
      .from(baremesPerdiem)
      .where(and(eq(baremesPerdiem.organizationId, organizationId), eq(baremesPerdiem.actif, true), isNull(baremesPerdiem.deletedAt)))
      .orderBy(asc(baremesPerdiem.montantJournalier)),
    db
      .select({ id: missions.id, libelle: sql<string>`${missions.reference} || ' · ' || ${missions.titre}` })
      .from(missions)
      .where(and(eq(missions.organizationId, organizationId), sql`${missions.statut} in ('planifiee', 'en_cours')`))
      .orderBy(desc(missions.createdAt)),
  ]);
  return { collaborateurs, bareme, missions: ouvertes };
}

export interface NouvelleAttribution {
  employeeId: string;
  baremeId: string;
  jours: number;
  missionId?: string | null;
  debut?: string | null;
  motif?: string | null;
}

/** Attribue un perdiem : le libellé et le montant du jour sont recopiés du barème, figés. */
export async function attribuerPour(organizationId: string, userId: string, n: NouvelleAttribution): Promise<{ id: string; numero: string; montantTotal: number }> {
  const erreur = erreurJours(n.jours);
  if (erreur) throw new Error(erreur);
  if (n.debut && !estDate(n.debut)) throw new Error("Date de début invalide.");
  const id = newId();
  const { numero, montantTotal } = await db.transaction(async (tx) => {
    const [collaborateur] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.id, n.employeeId), eq(employees.actif, true), isNull(employees.deletedAt)));
    if (!collaborateur) throw new Error("Ce collaborateur ne figure pas au Personnel.");
    const [ligne] = await tx
      .select({ id: baremesPerdiem.id, libelle: baremesPerdiem.libelle, montant: baremesPerdiem.montantJournalier })
      .from(baremesPerdiem)
      .where(and(eq(baremesPerdiem.organizationId, organizationId), eq(baremesPerdiem.id, n.baremeId), eq(baremesPerdiem.actif, true), isNull(baremesPerdiem.deletedAt)));
    if (!ligne) throw new Error("Cette ligne n'est plus au barème : choisissez-en une autre.");
    let missionId: string | null = null;
    if (n.missionId) {
      const [m] = await tx.select({ id: missions.id }).from(missions).where(and(eq(missions.organizationId, organizationId), eq(missions.id, n.missionId)));
      if (!m) throw new Error("Mission introuvable.");
      missionId = m.id;
    }
    const annee = Number((n.debut ?? new Date().toISOString()).slice(0, 4));
    const numero = await prochainNumero(tx, organizationId, formatNumero(annee));
    const total = montantAttribution(n.jours, ligne.montant);
    await tx.insert(attributionsPerdiem).values({
      id,
      organizationId,
      numero,
      employeeId: collaborateur.id,
      missionId,
      baremeId: ligne.id,
      baremeLibelle: ligne.libelle,
      montantJournalier: ligne.montant,
      jours: n.jours,
      montantTotal: total,
      debut: n.debut || null,
      motif: propre(n.motif, 500),
      creeParUserId: userId,
    });
    return { numero, montantTotal: total };
  });
  await tracerPour(organizationId, userId, { action: "perdiem.attribuer", entite: "attribution_perdiem", entiteId: id, apres: { numero, jours: n.jours, montantTotal } });
  return { id, numero, montantTotal };
}

export async function payerPour(organizationId: string, userId: string, id: string, p: { payeLe: string; moyen: string; reference?: string | null }): Promise<void> {
  if (!estDate(p.payeLe)) throw new Error("Date de paiement invalide.");
  if (!estMoyen(p.moyen)) throw new Error("Choisissez le moyen de paiement.");
  const [a] = await db
    .select({ statut: attributionsPerdiem.statut, numero: attributionsPerdiem.numero })
    .from(attributionsPerdiem)
    .where(and(eq(attributionsPerdiem.organizationId, organizationId), eq(attributionsPerdiem.id, id), isNull(attributionsPerdiem.deletedAt)));
  if (!a) throw new Error("Attribution introuvable.");
  if (!passagePermis(a.statut as StatutPerdiem, "paye")) throw new Error(a.statut === "paye" ? "Ce perdiem est déjà payé." : "Ce perdiem est annulé : il ne se paie plus.");
  await db
    .update(attributionsPerdiem)
    .set({ statut: "paye", payeLe: p.payeLe, moyen: p.moyen, reference: propre(p.reference, 120), payeParUserId: userId, updatedAt: new Date(), version: sql`${attributionsPerdiem.version} + 1` })
    .where(and(eq(attributionsPerdiem.id, id), eq(attributionsPerdiem.statut, "a_payer")));
  await tracerPour(organizationId, userId, { action: "perdiem.payer", entite: "attribution_perdiem", entiteId: id, apres: { numero: a.numero, moyen: p.moyen, payeLe: p.payeLe } });
}

export async function annulerPour(organizationId: string, userId: string, id: string, motif: string): Promise<void> {
  const raison = propre(motif, 500);
  if (!raison || raison.length < 3) throw new Error("Dites pourquoi le perdiem est annulé.");
  const [a] = await db
    .select({ statut: attributionsPerdiem.statut, numero: attributionsPerdiem.numero })
    .from(attributionsPerdiem)
    .where(and(eq(attributionsPerdiem.organizationId, organizationId), eq(attributionsPerdiem.id, id), isNull(attributionsPerdiem.deletedAt)));
  if (!a) throw new Error("Attribution introuvable.");
  if (!passagePermis(a.statut as StatutPerdiem, "annule")) throw new Error(a.statut === "paye" ? "Ce perdiem est payé : il ne s'annule plus." : "Ce perdiem est déjà annulé.");
  await db
    .update(attributionsPerdiem)
    .set({ statut: "annule", motifAnnulation: raison, annuleLe: new Date(), updatedAt: new Date(), version: sql`${attributionsPerdiem.version} + 1` })
    .where(and(eq(attributionsPerdiem.id, id), eq(attributionsPerdiem.statut, "a_payer")));
  await tracerPour(organizationId, userId, { action: "perdiem.annuler", entite: "attribution_perdiem", entiteId: id, apres: { numero: a.numero, motif: raison } });
}
