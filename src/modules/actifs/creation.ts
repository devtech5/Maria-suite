import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, prochainNumeroLibre, type Transaction } from "@/lib/sequences";

import {
  actifs,
  echeances,
  interventions,
  relevesCompteur,
  type NatureEcheance,
  type NatureIntervention,
  type StatutActif,
  type TypeActif,
} from "./schema";

/** Préfixe de référence par nature d'actif. VEH-001, INF-004, ENG-002. */
const PREFIXE: Record<TypeActif, string> = {
  vehicule: "VEH-",
  informatique: "INF-",
  engin: "ENG-",
  mobilier: "MOB-",
  local: "LOC-",
};

/** Unité de compteur usuelle, quand la saisie ne la précise pas. */
const UNITE_PAR_TYPE: Partial<Record<TypeActif, string>> = {
  vehicule: "km",
  engin: "h",
};

// -------------------------------------------------------------------- actifs

export interface NouvelActif {
  designation: string;
  type?: TypeActif;
  statut?: StatutActif;
  employeId?: string | null;
  intervenantId?: string | null;
  proprietaireId?: string | null;
  site?: string | null;
  dateAcquisition?: string | null;
  valeurAcquisition?: number;
  uniteCompteur?: string | null;
  notes?: string | null;
  code?: string | null;
  /** Relevé de départ. Crée la première ligne de compteur. */
  compteurInitial?: number | null;
  /**
   * Date du relevé de départ. Par défaut maintenant — on ouvre une fiche et on
   * lit le compteur dans la foulée. À renseigner quand la fiche est ouverte
   * APRÈS des interventions déjà connues : un relevé de départ daté du jour
   * masquerait celui de la dernière vidange, et le compteur reculerait.
   */
  compteurInitialLe?: Date | null;
}

/**
 * Ouvre une fiche d'actif, et son compteur si l'usage se mesure.
 *
 * Le code vient d'un compteur PAR TYPE : une suite commune donnerait VEH-001
 * puis VEH-003, avec le 002 parti sur un ordinateur. Sur un parc, la référence
 * se lit à voix haute au téléphone — elle doit rester courte et cohérente.
 */
export async function creerActifDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelActif,
  userId?: string,
): Promise<{ id: string; code: string }> {
  const type = donnees.type ?? "vehicule";

  if (donnees.employeId && donnees.intervenantId) {
    throw new Error("Un actif est confié à une personne, pas à deux.");
  }

  // Code libre : la démonstration et la reprise posent des codes sans faire
  // avancer le compteur, et la fiche suivante recevait INF-001, déjà pris.
  const code =
    donnees.code?.trim() ||
    (await prochainNumeroLibre(tx, organizationId, { cle: `actif:${type}`, prefix: PREFIXE[type], padding: 3 }, async (candidat) => {
      const [pris] = await tx
        .select({ id: actifs.id })
        .from(actifs)
        .where(and(eq(actifs.organizationId, organizationId), eq(actifs.code, candidat)))
        .limit(1);
      return Boolean(pris);
    }));

  const id = newId();
  const uniteCompteur =
    donnees.uniteCompteur?.trim() || UNITE_PAR_TYPE[type] || null;

  await tx.insert(actifs).values({
    id,
    organizationId,
    code,
    designation: donnees.designation.trim(),
    type,
    statut: donnees.statut ?? "actif",
    employeId: donnees.employeId ?? null,
    intervenantId: donnees.intervenantId ?? null,
    proprietaireId: donnees.proprietaireId ?? null,
    site: donnees.site ?? null,
    dateAcquisition: donnees.dateAcquisition ?? null,
    valeurAcquisition: donnees.valeurAcquisition ?? 0,
    uniteCompteur,
    notes: donnees.notes ?? null,
  });

  // Le relevé de départ est une ligne comme les autres : il n'y a pas de
  // « valeur initiale » sur la fiche, seulement une suite de constats datés.
  if (uniteCompteur && donnees.compteurInitial != null) {
    await tx.insert(relevesCompteur).values({
      id: newId(),
      organizationId,
      actifId: id,
      valeur: donnees.compteurInitial,
      releveLe: donnees.compteurInitialLe ?? new Date(),
      userId: userId ?? null,
    });
  }

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "actif.creer",
      entityType: "actif",
      entityId: id,
      after: { code, designation: donnees.designation, type },
    });
  }

  return { id, code };
}

export async function creerActifPour(
  organizationId: string,
  donnees: NouvelActif,
  userId?: string,
): Promise<{ id: string; code: string }> {
  return db.transaction((tx) => creerActifDans(tx, organizationId, donnees, userId));
}

// -------------------------------------------------------------- compteur

export interface NouveauReleve {
  actifId: string;
  valeur: number;
  releveLe?: Date;
  interventionId?: string | null;
}

/**
 * Enregistre un relevé de compteur.
 *
 * Aucun contrôle de croissance : un compteur remplacé repart de zéro, et
 * refuser la baisse obligerait à mentir sur le relevé pour que l'écran
 * l'accepte. C'est le relevé le PLUS RÉCENT qui fait foi, pas le plus élevé.
 */
export async function enregistrerReleveDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauReleve,
  userId?: string,
): Promise<string> {
  if (donnees.valeur < 0) throw new Error("Un compteur ne se relève pas en négatif.");

  const [actif] = await tx
    .select({ id: actifs.id, unite: actifs.uniteCompteur, designation: actifs.designation })
    .from(actifs)
    .where(
      and(eq(actifs.id, donnees.actifId), eq(actifs.organizationId, organizationId)),
    );

  if (!actif) throw new Error("Actif introuvable.");
  if (!actif.unite) {
    throw new Error(
      `« ${actif.designation} » n'a pas de compteur : son entretien suit le calendrier.`,
    );
  }

  const id = newId();

  await tx.insert(relevesCompteur).values({
    id,
    organizationId,
    actifId: actif.id,
    valeur: donnees.valeur,
    interventionId: donnees.interventionId ?? null,
    releveLe: donnees.releveLe ?? new Date(),
    userId: userId ?? null,
  });

  return id;
}

// -------------------------------------------------------------- interventions

export interface NouvelleIntervention {
  actifId: string;
  nature?: NatureIntervention;
  libelle: string;
  prestataireId?: string | null;
  prestataire?: string | null;
  cout: number;
  /** Relevé constaté au moment du passage. Crée une ligne de compteur. */
  compteur?: number | null;
  effectueeLe?: Date;
  notes?: string | null;
  /** Échéance que cette intervention vient honorer. */
  echeanceId?: string | null;
}

/**
 * Enregistre une intervention, son relevé et l'échéance qu'elle solde.
 *
 * Les trois dans la MÊME transaction : une vidange enregistrée sans son relevé
 * laisserait l'échéance suivante se calculer sur un kilométrage de trois mois,
 * et une échéance honorée dans un second temps resterait en tête de liste si
 * la connexion tombe entre les deux.
 *
 * `facturable` se déduit du propriétaire de l'actif — un actif de client se
 * facture — mais se FIGE sur la ligne : racheter le véhicule au client plus
 * tard ne doit pas requalifier les interventions déjà facturées.
 */
export async function enregistrerInterventionDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleIntervention,
  userId?: string,
): Promise<{ id: string; numero: string }> {
  if (donnees.cout < 0) throw new Error("Une intervention ne coûte pas moins que rien.");

  const [actif] = await tx
    .select({
      id: actifs.id,
      code: actifs.code,
      designation: actifs.designation,
      proprietaireId: actifs.proprietaireId,
      unite: actifs.uniteCompteur,
    })
    .from(actifs)
    .where(
      and(eq(actifs.id, donnees.actifId), eq(actifs.organizationId, organizationId)),
    );

  if (!actif) throw new Error("Actif introuvable.");

  const numero = await prochainNumero(tx, organizationId, {
    cle: "intervention",
    prefix: "INT-",
    padding: 6,
  });

  const id = newId();
  const effectueeLe = donnees.effectueeLe ?? new Date();

  await tx.insert(interventions).values({
    id,
    organizationId,
    numero,
    actifId: actif.id,
    nature: donnees.nature ?? "correctif",
    libelle: donnees.libelle.trim(),
    prestataireId: donnees.prestataireId ?? null,
    prestataire: donnees.prestataire ?? null,
    cout: donnees.cout,
    facturable: actif.proprietaireId !== null,
    effectueeLe,
    notes: donnees.notes ?? null,
    userId: userId ?? null,
  });

  if (actif.unite && donnees.compteur != null) {
    await tx.insert(relevesCompteur).values({
      id: newId(),
      organizationId,
      actifId: actif.id,
      valeur: donnees.compteur,
      interventionId: id,
      releveLe: effectueeLe,
      userId: userId ?? null,
    });
  }

  if (donnees.echeanceId) {
    await tx
      .update(echeances)
      .set({ honoreeLe: effectueeLe, interventionId: id, updatedAt: new Date() })
      .where(
        and(
          eq(echeances.id, donnees.echeanceId),
          eq(echeances.organizationId, organizationId),
        ),
      );
  }

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "intervention.saisir",
      entityType: "intervention",
      entityId: id,
      after: { numero, actif: actif.code, libelle: donnees.libelle, cout: donnees.cout },
    });
  }

  return { id, numero };
}

export async function enregistrerInterventionPour(
  organizationId: string,
  donnees: NouvelleIntervention,
  userId?: string,
): Promise<{ id: string; numero: string }> {
  return db.transaction((tx) =>
    enregistrerInterventionDans(tx, organizationId, donnees, userId),
  );
}

// ----------------------------------------------------------------- échéances

export interface NouvelleEcheance {
  actifId: string;
  nature: NatureEcheance;
  libelle?: string | null;
  echeanceLe?: string | null;
  compteurCible?: number | null;
  notes?: string | null;
}

export async function creerEcheanceDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleEcheance,
  userId?: string,
): Promise<string> {
  if (!donnees.echeanceLe && donnees.compteurCible == null) {
    // Sans déclencheur, l'échéance n'échoit jamais : elle resterait dans la
    // liste sans que personne ne sache quoi en faire.
    throw new Error("Indiquez une date, un seuil de compteur, ou les deux.");
  }

  const id = newId();

  await tx.insert(echeances).values({
    id,
    organizationId,
    actifId: donnees.actifId,
    nature: donnees.nature,
    libelle: donnees.libelle ?? null,
    echeanceLe: donnees.echeanceLe ?? null,
    compteurCible: donnees.compteurCible ?? null,
    notes: donnees.notes ?? null,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "echeance.creer",
      entityType: "echeance",
      entityId: id,
      after: {
        nature: donnees.nature,
        echeanceLe: donnees.echeanceLe,
        compteurCible: donnees.compteurCible,
      },
    });
  }

  return id;
}
