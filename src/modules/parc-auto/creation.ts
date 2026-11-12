import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { creerActifDans, creerEcheanceDans, enregistrerReleveDans } from "@/modules/actifs/creation";
import { actifs } from "@/modules/actifs/schema";
import { employees } from "@/modules/personnes/schema";

import { normaliserImmatriculation } from "./calcul";
import { pleinsCarburant, vehicules, type EnergieVehicule } from "./schema";

export interface DetailsVehicule {
  immatriculation: string;
  marque?: string | null;
  modele?: string | null;
  annee?: number | null;
  energie?: EnergieVehicule | null;
  numeroChassis?: string | null;
  numeroCarteGrise?: string | null;
  puissanceFiscale?: number | null;
  places?: number | null;
  couleur?: string | null;
  reservoirLitres?: number | null;
  usage?: string | null;
}

export interface NouveauVehicule extends DetailsVehicule {
  /** Désignation de l'actif. Par défaut : marque, modèle et immatriculation. */
  designation?: string | null;
  conducteurId?: string | null;
  site?: string | null;
  dateAcquisition?: string | null;
  valeurAcquisition?: number;
  kilometrage?: number | null;
  /** Échéances posées dès l'ouverture : c'est le moment où l'on a les papiers en main. */
  assuranceLe?: string | null;
  visiteLe?: string | null;
  vignetteLe?: string | null;
}

function designationPar(v: DetailsVehicule): string {
  return [v.marque, v.modele].filter(Boolean).join(" ").trim() || "Véhicule";
}

async function verifierConducteur(tx: Transaction, organizationId: string, conducteurId: string | null | undefined) {
  if (!conducteurId) return;
  const [ok] = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, conducteurId), eq(employees.organizationId, organizationId)));
  if (!ok) throw new Error("Conducteur introuvable.");
}

/**
 * Ouvre un véhicule : sa fiche d'actif (compteur en kilomètres, conducteur),
 * sa fiche de véhicule et ses premières échéances — dans une transaction.
 */
export async function creerVehiculeDans(
  tx: Transaction,
  organizationId: string,
  saisie: NouveauVehicule,
  userId?: string,
): Promise<{ id: string; code: string }> {
  const immatriculation = normaliserImmatriculation(saisie.immatriculation);
  if (immatriculation.length < 4) throw new Error("Indiquez l'immatriculation.");
  await verifierConducteur(tx, organizationId, saisie.conducteurId);

  const { id, code } = await creerActifDans(
    tx,
    organizationId,
    {
      designation: `${saisie.designation?.trim() || designationPar(saisie)} — ${immatriculation}`,
      type: "vehicule",
      employeId: saisie.conducteurId ?? null,
      site: saisie.site ?? null,
      dateAcquisition: saisie.dateAcquisition ?? null,
      valeurAcquisition: saisie.valeurAcquisition ?? 0,
      uniteCompteur: "km",
      compteurInitial: saisie.kilometrage ?? null,
    },
    userId,
  );

  await tx.insert(vehicules).values({ actifId: id, organizationId, ...champsVehicule(saisie), immatriculation });

  for (const [nature, date] of [
    ["assurance", saisie.assuranceLe],
    ["visite", saisie.visiteLe],
    ["vignette", saisie.vignetteLe],
  ] as const) {
    if (date) await creerEcheanceDans(tx, organizationId, { actifId: id, nature, echeanceLe: date }, userId);
  }

  return { id, code };
}

export async function creerVehiculePour(organizationId: string, saisie: NouveauVehicule, userId?: string) {
  return db.transaction((tx) => creerVehiculeDans(tx, organizationId, saisie, userId));
}

function champsVehicule(v: DetailsVehicule) {
  return {
    marque: v.marque ?? null,
    modele: v.modele ?? null,
    annee: v.annee ?? null,
    energie: v.energie ?? null,
    numeroChassis: v.numeroChassis?.toUpperCase() ?? null,
    numeroCarteGrise: v.numeroCarteGrise ?? null,
    puissanceFiscale: v.puissanceFiscale ?? null,
    places: v.places ?? null,
    couleur: v.couleur ?? null,
    reservoirLitres: v.reservoirLitres ?? null,
    usage: v.usage ?? null,
  };
}

/**
 * Complète ou corrige la fiche d'un véhicule — y compris un véhicule ouvert
 * avant ce module, depuis l'écran Actifs, qui n'a pas encore de carte grise.
 */
export async function completerVehiculePour(
  organizationId: string,
  userId: string,
  actifId: string,
  details: DetailsVehicule & { conducteurId?: string | null },
): Promise<void> {
  const immatriculation = normaliserImmatriculation(details.immatriculation);
  if (immatriculation.length < 4) throw new Error("Indiquez l'immatriculation.");

  await db.transaction(async (tx) => {
    const [actif] = await tx
      .select({ id: actifs.id, type: actifs.type })
      .from(actifs)
      .where(and(eq(actifs.id, actifId), eq(actifs.organizationId, organizationId)));
    if (!actif) throw new Error("Véhicule introuvable.");
    if (actif.type !== "vehicule") throw new Error("Cet actif n'est pas un véhicule.");
    await verifierConducteur(tx, organizationId, details.conducteurId);

    const champs = { ...champsVehicule(details), immatriculation };
    await tx
      .insert(vehicules)
      .values({ actifId, organizationId, ...champs })
      .onConflictDoUpdate({
        target: vehicules.actifId,
        set: { ...champs, updatedAt: new Date(), version: sql`${vehicules.version} + 1` },
      });

    if (details.conducteurId !== undefined) {
      // Le conducteur EST l'affectation de l'actif : un collaborateur, jamais un
      // intervenant en même temps (contrainte `actifs_une_seule_affectation`).
      await tx
        .update(actifs)
        .set({
          employeId: details.conducteurId,
          ...(details.conducteurId ? { intervenantId: null } : {}),
          updatedAt: new Date(),
          version: sql`${actifs.version} + 1`,
        })
        .where(eq(actifs.id, actifId));
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "vehicule.modifier",
      entityType: "actif",
      entityId: actifId,
      after: { immatriculation, conducteur: details.conducteurId ?? null },
    });
  });
}

export interface NouveauPlein {
  actifId: string;
  faitLe?: Date;
  /** Millilitres. */
  volume: number;
  montant: number;
  kilometrage?: number | null;
  complet?: boolean;
  station?: string | null;
  conducteurId?: string | null;
  notes?: string | null;
}

/**
 * Note un plein, et le kilométrage relevé à la pompe dans le compteur.
 *
 * Un volume qui dépasse le réservoir est refusé : c'est presque toujours une
 * faute de frappe (425 litres pour 42,5), et elle fausserait la consommation
 * de tout le trimestre.
 */
export async function enregistrerPleinDans(
  tx: Transaction,
  organizationId: string,
  saisie: NouveauPlein,
  userId?: string,
): Promise<string> {
  if (saisie.volume <= 0) throw new Error("Indiquez le volume du plein.");
  if (saisie.montant < 0) throw new Error("Le montant ne peut pas être négatif.");

  const [vehicule] = await tx
    .select({ type: actifs.type, reservoir: vehicules.reservoirLitres, designation: actifs.designation })
    .from(actifs)
    .leftJoin(vehicules, eq(vehicules.actifId, actifs.id))
    .where(and(eq(actifs.id, saisie.actifId), eq(actifs.organizationId, organizationId), isNull(actifs.deletedAt)));
  if (!vehicule || vehicule.type !== "vehicule") throw new Error("Véhicule introuvable.");
  if (vehicule.reservoir && saisie.volume > vehicule.reservoir * 1000) {
    throw new Error(`${(saisie.volume / 1000).toLocaleString("fr-FR")} L dépasse le réservoir de ${vehicule.reservoir} L : vérifiez le volume.`);
  }
  await verifierConducteur(tx, organizationId, saisie.conducteurId);

  const faitLe = saisie.faitLe ?? new Date();
  const id = newId();
  await tx.insert(pleinsCarburant).values({
    id,
    organizationId,
    actifId: saisie.actifId,
    faitLe,
    volume: saisie.volume,
    montant: saisie.montant,
    kilometrage: saisie.kilometrage ?? null,
    complet: saisie.complet ?? true,
    station: saisie.station ?? null,
    conducteurId: saisie.conducteurId ?? null,
    notes: saisie.notes ?? null,
    userId: userId ?? null,
  });

  if (saisie.kilometrage != null) {
    await enregistrerReleveDans(tx, organizationId, { actifId: saisie.actifId, valeur: saisie.kilometrage, releveLe: faitLe }, userId);
  }

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "plein.enregistrer",
      entityType: "actif",
      entityId: saisie.actifId,
      after: { volume: saisie.volume, montant: saisie.montant, kilometrage: saisie.kilometrage ?? null },
    });
  }
  return id;
}

export async function enregistrerPleinPour(organizationId: string, saisie: NouveauPlein, userId?: string) {
  return db.transaction((tx) => enregistrerPleinDans(tx, organizationId, saisie, userId));
}

/** Retire un plein saisi par erreur. Le relevé de compteur qu'il a posé reste : il a été constaté. */
export async function retirerPleinPour(organizationId: string, userId: string, pleinId: string): Promise<void> {
  const [retire] = await db
    .update(pleinsCarburant)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pleinsCarburant.id, pleinId), eq(pleinsCarburant.organizationId, organizationId), isNull(pleinsCarburant.deletedAt)))
    .returning({ actifId: pleinsCarburant.actifId, montant: pleinsCarburant.montant });
  if (!retire) throw new Error("Plein introuvable.");
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "plein.retirer",
    entityType: "actif",
    entityId: retire.actifId,
    after: { montant: retire.montant },
  });
}
