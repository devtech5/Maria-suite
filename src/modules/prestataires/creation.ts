import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { compteTresorerieDe } from "@/modules/tresorerie/creation";
import { creerTiersDans } from "@/modules/tiers/creation";
import type { NatureTiers } from "@/modules/tiers/natures";
import { tiers } from "@/modules/tiers/schema";

import { ecriturePrestation, noteMoyenne, retenue as calculerRetenue, transitionPermise, type CompteCharge, type StatutPrestation, type UniteTarif } from "./calcul";
import { prestataires, prestations, type Prestataire, type Prestation } from "./schema";

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entityId: string, apres: unknown) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "prestataire", entityId, after: apres });
}

export interface ProfilPrestataire {
  metiers: string[];
  specialites?: string | null;
  zone?: string | null;
  tarif?: number | null;
  uniteTarif?: UniteTarif | null;
  formel?: boolean;
  mobileMoney?: string | null;
  disponible?: boolean;
  notes?: string | null;
}

export interface NouveauPrestataire extends ProfilPrestataire {
  /** Fiche tiers existante (un fournisseur déjà connu). Sinon, elle est créée. */
  tiersId?: string | null;
  nom?: string;
  /** Type de prestataire : particulier, entreprise, ONG, mutuelle, association, coopérative. */
  nature?: NatureTiers;
  /** Nul : local (pays de l'entreprise). Un code pays : international. */
  paysCode?: string | null;
  telephone?: string | null;
  email?: string | null;
  ville?: string | null;
  identifiantFiscal?: string | null;
}

function nettoyerProfil(p: ProfilPrestataire) {
  const metiers = [...new Set(p.metiers.map((m) => m.trim()).filter(Boolean))];
  if (metiers.length === 0) throw new Error("Indiquez au moins un métier.");
  if (p.tarif != null && !p.uniteTarif) throw new Error("Précisez l'unité du tarif : l'heure, la journée, la prestation…");
  return {
    metiers,
    specialites: p.specialites ?? null,
    zone: p.zone ?? null,
    tarif: p.tarif ?? null,
    uniteTarif: p.tarif != null ? (p.uniteTarif ?? null) : null,
    formel: p.formel ?? false,
    mobileMoney: p.mobileMoney ?? null,
    disponible: p.disponible ?? true,
    notes: p.notes ?? null,
  };
}

/** Inscrit un prestataire : sa fiche tiers (fournisseur) et son profil, dans une transaction. */
export async function creerPrestatairePour(organizationId: string, userId: string, saisie: NouveauPrestataire): Promise<{ id: string; tiersId: string }> {
  const profil = nettoyerProfil(saisie);
  return db.transaction(async (tx) => {
    let tiersId = saisie.tiersId ?? null;
    if (tiersId) {
      const [t] = await tx.select({ id: tiers.id }).from(tiers).where(and(eq(tiers.id, tiersId), eq(tiers.organizationId, organizationId)));
      if (!t) throw new Error("Fiche tiers introuvable.");
      await tx.update(tiers).set({ estFournisseur: true, updatedAt: new Date() }).where(eq(tiers.id, tiersId));
    } else {
      if (!saisie.nom || saisie.nom.trim().length < 2) throw new Error("Indiquez le nom du prestataire.");
      ({ id: tiersId } = await creerTiersDans(
        tx,
        organizationId,
        {
          nom: saisie.nom.trim(),
          nature: saisie.nature ?? "particulier",
          paysCode: saisie.paysCode ?? null,
          estClient: false,
          estFournisseur: true,
          telephone: saisie.telephone ?? null,
          email: saisie.email ?? null,
          ville: saisie.ville ?? null,
          identifiantFiscal: saisie.identifiantFiscal ?? null,
          secteur: profil.metiers[0],
        },
        userId,
      ));
    }
    const id = newId();
    await tx.insert(prestataires).values({ id, organizationId, tiersId, ...profil });
    await journaliser(tx, organizationId, userId, "prestataire.creer", id, { metiers: profil.metiers });
    return { id, tiersId };
  });
}

export async function modifierPrestatairePour(organizationId: string, userId: string, id: string, profil: ProfilPrestataire): Promise<void> {
  const champs = nettoyerProfil(profil);
  await db.transaction(async (tx) => {
    const [modifie] = await tx
      .update(prestataires)
      .set({ ...champs, updatedAt: new Date(), version: sql`${prestataires.version} + 1` })
      .where(and(eq(prestataires.id, id), eq(prestataires.organizationId, organizationId)))
      .returning({ id: prestataires.id });
    if (!modifie) throw new Error("Prestataire introuvable.");
    await journaliser(tx, organizationId, userId, "prestataire.modifier", id, { metiers: champs.metiers, disponible: champs.disponible });
  });
}

export interface NouvellePrestation {
  prestataireId: string;
  objet: string;
  description?: string | null;
  lieu?: string | null;
  prevueLe?: string | null;
  montantConvenu?: number | null;
  projetId?: string | null;
}

export async function demanderPrestationPour(organizationId: string, userId: string, saisie: NouvellePrestation): Promise<{ id: string; numero: string }> {
  if (saisie.objet.trim().length < 3) throw new Error("Décrivez la prestation.");
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: prestataires.id })
      .from(prestataires)
      .where(and(eq(prestataires.id, saisie.prestataireId), eq(prestataires.organizationId, organizationId), isNull(prestataires.deletedAt)));
    if (!p) throw new Error("Prestataire introuvable.");
    const annee = String(new Date().getFullYear());
    const numero = await prochainNumero(tx, organizationId, { cle: "prestation", prefix: `PRE-${annee}-`, padding: 5, periode: annee });
    const id = newId();
    await tx.insert(prestations).values({
      id,
      organizationId,
      prestataireId: saisie.prestataireId,
      numero,
      objet: saisie.objet.trim(),
      description: saisie.description ?? null,
      lieu: saisie.lieu ?? null,
      prevueLe: saisie.prevueLe ?? null,
      montantConvenu: saisie.montantConvenu ?? null,
      projetId: saisie.projetId ?? null,
      userId,
    });
    await journaliser(tx, organizationId, userId, "prestation.demander", saisie.prestataireId, { numero, objet: saisie.objet, montant: saisie.montantConvenu ?? null });
    return { id, numero };
  });
}

async function prestationDe(tx: Transaction, organizationId: string, id: string): Promise<Prestation> {
  const [p] = await tx.select().from(prestations).where(and(eq(prestations.id, id), eq(prestations.organizationId, organizationId)));
  if (!p) throw new Error("Prestation introuvable.");
  return p;
}

/** Confirmer, constater la réalisation, annuler. Le paiement a sa propre fonction. */
export async function changerStatutPour(
  organizationId: string,
  userId: string,
  id: string,
  vers: Exclude<StatutPrestation, "payee" | "demandee">,
  options: { motif?: string | null; montantConvenu?: number | null } = {},
): Promise<string> {
  return db.transaction(async (tx) => {
    const p = await prestationDe(tx, organizationId, id);
    if (!transitionPermise(p.statut, vers)) throw new Error(`${p.numero} ne peut pas passer de « ${p.statut} » à « ${vers} ».`);
    if (vers === "annulee" && !options.motif?.trim()) throw new Error("Indiquez le motif de l'annulation.");
    await tx
      .update(prestations)
      .set({
        statut: vers,
        ...(vers === "realisee" ? { realiseeLe: new Date() } : {}),
        ...(vers === "annulee" ? { motifAnnulation: options.motif!.trim() } : {}),
        ...(options.montantConvenu != null ? { montantConvenu: options.montantConvenu } : {}),
        updatedAt: new Date(),
        version: sql`${prestations.version} + 1`,
      })
      .where(eq(prestations.id, id));
    await journaliser(tx, organizationId, userId, `prestation.${vers === "confirmee" ? "confirmer" : vers === "realisee" ? "realiser" : "annuler"}`, p.prestataireId, { numero: p.numero });
    return p.numero;
  });
}

/** Avis sur une prestation réalisée : il compte dans la note du prestataire. */
export async function evaluerPour(organizationId: string, userId: string, id: string, note: number, avis: string | null): Promise<void> {
  if (!Number.isInteger(note) || note < 1 || note > 5) throw new Error("Une note va de 1 à 5.");
  await db.transaction(async (tx) => {
    const p = await prestationDe(tx, organizationId, id);
    if (p.statut !== "realisee" && p.statut !== "payee") throw new Error("On note une prestation une fois réalisée.");
    await tx.update(prestations).set({ note, avis: avis?.trim() || null, updatedAt: new Date() }).where(eq(prestations.id, id));
    await journaliser(tx, organizationId, userId, "prestation.evaluer", p.prestataireId, { numero: p.numero, note });
  });
}

export interface Paiement {
  montant: number;
  /** Taux de retenue à la source en points de base. Zéro par défaut. */
  retenueBp: number;
  compteCharge: CompteCharge;
  compteTresorerieId: string;
  date: string;
}

/**
 * Paie une prestation réalisée : l'écriture passe dans la même transaction —
 * charge au débit, trésorerie et retenue au crédit.
 */
export async function payerPour(organizationId: string, userId: string, id: string, paiement: Paiement): Promise<{ numero: string; ecriture: string }> {
  return db.transaction(async (tx) => {
    const p = await prestationDe(tx, organizationId, id);
    if (!transitionPermise(p.statut, "payee")) throw new Error(p.statut === "payee" ? `${p.numero} est déjà payée.` : "Constatez d'abord la réalisation de la prestation.");
    const compte = await compteTresorerieDe(tx, organizationId, paiement.compteTresorerieId);
    if (!compte) throw new Error("Compte de trésorerie introuvable ou fermé.");
    const [prestataire] = await tx
      .select({ nom: tiers.nom })
      .from(prestataires)
      .innerJoin(tiers, eq(tiers.id, prestataires.tiersId))
      .where(eq(prestataires.id, p.prestataireId));
    const montantRetenu = calculerRetenue(paiement.montant, paiement.retenueBp);
    const ecriture = await enregistrerEcritureDans(
      tx,
      ecriturePrestation({
        numero: p.numero,
        date: paiement.date,
        objet: p.objet,
        prestataire: prestataire?.nom ?? "Prestataire",
        montant: paiement.montant,
        retenue: montantRetenu,
        compteCharge: paiement.compteCharge,
        tresorerie: { numero: compte.numero, libelle: compte.libelle, journal: compte.nature === "banque" ? "BQ" : "CA" },
      }),
      { organizationId, userId, origine: "prestation", pieceId: p.id, exercice: paiement.date.slice(0, 4), dateIso: paiement.date },
    );
    await tx
      .update(prestations)
      .set({
        statut: "payee",
        montantPaye: paiement.montant,
        retenue: montantRetenu,
        compteCharge: paiement.compteCharge,
        ecritureNumero: ecriture,
        payeeLe: new Date(`${paiement.date}T12:00:00Z`),
        updatedAt: new Date(),
        version: sql`${prestations.version} + 1`,
      })
      .where(eq(prestations.id, id));
    await journaliser(tx, organizationId, userId, "prestation.payer", p.prestataireId, { numero: p.numero, montant: paiement.montant, retenue: montantRetenu, ecriture });
    return { numero: p.numero, ecriture };
  });
}

// ----------------------------------------------------------------- lectures

export interface PrestataireSuivi extends Prestataire {
  nom: string;
  /** Type de prestataire, lu à sa fiche tiers. */
  nature: NatureTiers;
  /** Nul : local ; sinon le pays d'un prestataire international. */
  paysCode: string | null;
  telephone: string | null;
  email: string | null;
  ville: string | null;
  identifiantFiscal: string | null;
  note: number | null;
  avis: number;
  realisees: number;
  totalPaye: number;
}

export async function listerPrestataires(organizationId: string): Promise<PrestataireSuivi[]> {
  const [lignes, toutes] = await Promise.all([
    db
      .select({ p: prestataires, nom: tiers.nom, telephone: tiers.telephone, email: tiers.email, ville: tiers.ville, identifiantFiscal: tiers.identifiantFiscal, nature: tiers.nature, paysCode: tiers.paysCode })
      .from(prestataires)
      .innerJoin(tiers, eq(tiers.id, prestataires.tiersId))
      .where(and(eq(prestataires.organizationId, organizationId), isNull(prestataires.deletedAt)))
      .orderBy(tiers.nom),
    db.select({ prestataireId: prestations.prestataireId, statut: prestations.statut, note: prestations.note, montantPaye: prestations.montantPaye }).from(prestations).where(eq(prestations.organizationId, organizationId)),
  ]);
  return lignes.map(({ p, ...t }) => {
    const siennes = toutes.filter((x) => x.prestataireId === p.id);
    return {
      ...p,
      ...t,
      note: noteMoyenne(siennes.map((x) => x.note)),
      avis: siennes.filter((x) => x.note !== null).length,
      realisees: siennes.filter((x) => x.statut === "realisee" || x.statut === "payee").length,
      totalPaye: siennes.reduce((s, x) => s + (x.montantPaye ?? 0), 0),
    };
  });
}

export interface PrestationAffichee extends Prestation {
  prestataire: string;
}

export async function listerPrestations(organizationId: string, prestataireId?: string): Promise<PrestationAffichee[]> {
  const lignes = await db
    .select({ p: prestations, nom: tiers.nom })
    .from(prestations)
    .innerJoin(prestataires, eq(prestataires.id, prestations.prestataireId))
    .innerJoin(tiers, eq(tiers.id, prestataires.tiersId))
    .where(and(eq(prestations.organizationId, organizationId), ...(prestataireId ? [eq(prestations.prestataireId, prestataireId)] : [])))
    .orderBy(desc(prestations.createdAt));
  return lignes.map(({ p, nom }) => ({ ...p, prestataire: nom }));
}
