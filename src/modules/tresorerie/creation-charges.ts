import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { categorieConnue } from "@/modules/projets/calcul";
import { demanderDepenseDans } from "@/modules/projets/creation";
import { tiers } from "@/modules/tiers/schema";

import {
  echeancesCharge as calculerEcheances,
  familleConnue,
  libelleMois,
  moisDe,
  moisGlissants,
  PERIODICITES,
  type Periodicite,
} from "./charges";
import { budgetsCharges, chargesRecurrentes, echeancesCharge } from "./schema";

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action,
    entityType: "charge",
    entityId: entiteId,
    after: apres,
  });
}

export interface NouvelleCharge {
  libelle: string;
  categorie: string;
  montant: number;
  tauxTva?: number;
  periodicite: Periodicite;
  premiereEcheance: string;
  fournisseurId?: string | null;
  fournisseurLibelle?: string | null;
}

export async function creerChargeDans(
  tx: Transaction,
  organizationId: string,
  c: NouvelleCharge,
  userId: string,
  aujourdhui: string = new Date().toISOString().slice(0, 10),
): Promise<{ id: string }> {
  if (!c.libelle.trim()) throw new Error("Donnez un libellé à la charge.");
  if (!categorieConnue(c.categorie)) throw new Error("Nature de charge inconnue.");
  if (!Number.isInteger(c.montant) || c.montant <= 0) throw new Error("Montant invalide.");
  if (!(c.periodicite in PERIODICITES)) throw new Error("Périodicité inconnue.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.premiereEcheance)) throw new Error("Date de première échéance invalide.");
  // Chaque échéance passée deviendrait un retard à régler : un loyer payé
  // depuis deux ans ferait vingt-quatre lignes en souffrance. On part de la
  // prochaine — ou de celle du mois écoulé, si elle n'est pas encore réglée.
  if (c.premiereEcheance < moisGlissants(moisDe(aujourdhui), 2)[0] + "-01") {
    throw new Error("La première échéance est celle à venir, ou au plus celle du mois dernier.");
  }
  if (c.fournisseurId) {
    const [f] = await tx
      .select({ id: tiers.id })
      .from(tiers)
      .where(and(eq(tiers.id, c.fournisseurId), eq(tiers.organizationId, organizationId), isNull(tiers.deletedAt)));
    if (!f) throw new Error("Fournisseur introuvable.");
  }

  const id = newId();
  await tx.insert(chargesRecurrentes).values({
    id,
    organizationId,
    libelle: c.libelle.trim(),
    categorie: c.categorie,
    montant: c.montant,
    tauxTva: c.tauxTva ?? 0,
    periodicite: c.periodicite,
    premiereEcheance: c.premiereEcheance,
    fournisseurId: c.fournisseurId ?? null,
    fournisseurLibelle: c.fournisseurLibelle?.trim() || null,
    creeParUserId: userId,
  });
  await journaliser(tx, organizationId, userId, "charge.creer", id, { libelle: c.libelle, montant: c.montant, periodicite: c.periodicite });
  return { id };
}

async function lireCharge(tx: Transaction, organizationId: string, chargeId: string) {
  const [charge] = await tx
    .select()
    .from(chargesRecurrentes)
    .where(and(eq(chargesRecurrentes.id, chargeId), eq(chargesRecurrentes.organizationId, organizationId), isNull(chargesRecurrentes.deletedAt)))
    .for("update");
  if (!charge) throw new Error("Charge introuvable.");
  return charge;
}

/** Suspend une charge (bail résilié, abonnement arrêté) ou la reprend. */
export async function basculerChargeDans(tx: Transaction, organizationId: string, chargeId: string, actif: boolean, userId: string): Promise<void> {
  await lireCharge(tx, organizationId, chargeId);
  await tx
    .update(chargesRecurrentes)
    .set({ actif, updatedAt: new Date(), version: sql`${chargesRecurrentes.version} + 1` })
    .where(eq(chargesRecurrentes.id, chargeId));
  await journaliser(tx, organizationId, userId, actif ? "charge.reprendre" : "charge.suspendre", chargeId, {});
}

/** Retire une charge. Les dépenses déjà préparées restent : elles ont leur propre vie. */
export async function supprimerChargeDans(tx: Transaction, organizationId: string, chargeId: string, userId: string): Promise<void> {
  const charge = await lireCharge(tx, organizationId, chargeId);
  await tx
    .update(chargesRecurrentes)
    .set({ deletedAt: new Date(), actif: false, updatedAt: new Date(), version: sql`${chargesRecurrentes.version} + 1` })
    .where(eq(chargesRecurrentes.id, chargeId));
  await journaliser(tx, organizationId, userId, "charge.supprimer", chargeId, { libelle: charge.libelle });
}

/** L'échéance de ce mois-là, si la charge en a une. */
function echeanceDuMois(charge: { premiereEcheance: string; periodicite: Periodicite }, periode: string) {
  const echeance = calculerEcheances(charge, `${periode}-31`).find((e) => e.periode === periode);
  if (!echeance) throw new Error("Cette charge n'a pas d'échéance ce mois-là.");
  return echeance;
}

/**
 * Prépare la dépense d'une échéance : une demande ordinaire, au montant
 * habituel, qui attend l'approbation d'un autre membre puis le paiement.
 *
 * L'unicité (charge, mois) en base refuse une seconde préparation, même
 * lancée au même instant depuis deux postes.
 */
export async function preparerEcheanceDans(
  tx: Transaction,
  organizationId: string,
  chargeId: string,
  periode: string,
  userId: string,
): Promise<{ numero: string }> {
  const charge = await lireCharge(tx, organizationId, chargeId);
  if (!charge.actif) throw new Error("Cette charge est suspendue.");
  const echeance = echeanceDuMois(charge, periode);

  const [deja] = await tx
    .select({ id: echeancesCharge.id })
    .from(echeancesCharge)
    .where(and(eq(echeancesCharge.chargeId, chargeId), eq(echeancesCharge.periode, periode)));
  if (deja) throw new Error(`L'échéance de ${libelleMois(periode)} est déjà traitée.`);

  const { id: depenseId, numero } = await demanderDepenseDans(
    tx,
    organizationId,
    {
      objet: `${charge.libelle} — ${libelleMois(periode)}`,
      categorie: charge.categorie,
      fournisseurId: charge.fournisseurId,
      fournisseurLibelle: charge.fournisseurLibelle,
      montant: charge.montant,
      tauxTva: charge.tauxTva,
    },
    userId,
  );
  await tx.insert(echeancesCharge).values({
    id: newId(),
    organizationId,
    chargeId,
    periode,
    dateEcheance: echeance.date,
    depenseId,
    userId,
  });
  await journaliser(tx, organizationId, userId, "charge.preparer", chargeId, { periode, depense: numero });
  return { numero };
}

/** Écarte une échéance sans dépense : payée autrement, ou rien à payer ce mois-là. */
export async function ignorerEcheanceDans(tx: Transaction, organizationId: string, chargeId: string, periode: string, userId: string): Promise<void> {
  const charge = await lireCharge(tx, organizationId, chargeId);
  const echeance = echeanceDuMois(charge, periode);
  const insere = await tx
    .insert(echeancesCharge)
    .values({ id: newId(), organizationId, chargeId, periode, dateEcheance: echeance.date, ignoree: true, userId })
    .onConflictDoNothing()
    .returning({ id: echeancesCharge.id });
  if (insere.length === 0) throw new Error(`L'échéance de ${libelleMois(periode)} est déjà traitée.`);
  await journaliser(tx, organizationId, userId, "charge.ignorer", chargeId, { periode });
}

/** Fixe l'enveloppe mensuelle d'une famille ; zéro la retire. */
export async function definirBudgetDans(tx: Transaction, organizationId: string, famille: string, montant: number, userId: string): Promise<void> {
  if (!familleConnue(famille)) throw new Error("Famille de charges inconnue.");
  if (!Number.isInteger(montant) || montant < 0) throw new Error("Montant invalide.");

  if (montant === 0) {
    await tx
      .update(budgetsCharges)
      .set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${budgetsCharges.version} + 1` })
      .where(and(eq(budgetsCharges.organizationId, organizationId), eq(budgetsCharges.famille, famille), isNull(budgetsCharges.deletedAt)));
  } else {
    await tx
      .insert(budgetsCharges)
      .values({ id: newId(), organizationId, famille, montantMensuel: montant })
      .onConflictDoUpdate({
        target: [budgetsCharges.organizationId, budgetsCharges.famille],
        set: { montantMensuel: montant, deletedAt: null, updatedAt: new Date(), version: sql`${budgetsCharges.version} + 1` },
      });
  }
  await journaliser(tx, organizationId, userId, "charge.budget", organizationId, { famille, montantMensuel: montant });
}
