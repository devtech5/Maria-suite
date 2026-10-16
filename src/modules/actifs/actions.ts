"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { exigerEntreprise } from "@/lib/auth/dal";
import { exigerDroit, refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { tracer } from "@/lib/audit";

import {
  creerActifDans,
  creerEcheanceDans,
  enregistrerInterventionDans,
  enregistrerReleveDans,
} from "./creation";
import { actifs } from "./schema";

/** Les fiches de parc (auto, informatique) lisent les mêmes actifs. */
function revaliderParcs() {
  revalidatePath("/actifs", "layout");
  revalidatePath("/parc-auto", "layout");
  revalidatePath("/parc-informatique", "layout");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Un entier saisi au clavier, espaces de milliers admis. */
const entier = z
  .string()
  .trim()
  .transform((valeur) => Number(valeur.replace(/[\s ]/g, "")))
  .pipe(z.number().int().min(0));

function texte(donnees: FormData, champ: string): string | undefined {
  const valeur = donnees.get(champ);
  if (typeof valeur !== "string") return undefined;
  const propre = valeur.trim();
  return propre === "" ? undefined : propre;
}

/** Un identifiant facultatif venu d'un `select` : la valeur vide vaut « aucun ». */
function reference(donnees: FormData, champ: string): string | undefined {
  const valeur = texte(donnees, champ);
  return valeur && UUID.test(valeur) ? valeur : undefined;
}

// -------------------------------------------------------------------- actifs

export interface EtatActif {
  erreur?: string;
  /** Référence attribuée à l'actif créé. */
  code?: string;
}

const schemaActif = z.object({
  designation: z.string().trim().min(2, "Indiquez la désignation de l'actif."),
  type: z.enum(["vehicule", "informatique", "engin", "mobilier", "local"]),
  statut: z.enum(["actif", "entretien", "immobilise", "cede"]),
  site: z.string().trim().max(80).optional(),
  dateAcquisition: z.string().regex(DATE_ISO).optional(),
  valeurAcquisition: entier,
  uniteCompteur: z.string().trim().max(10).optional(),
  compteurInitial: entier.optional(),
});

export async function creerActif(
  _precedent: EtatActif,
  donnees: FormData,
): Promise<EtatActif> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("actifs.fiche.gerer");
  if (refus) return refus;

  const analyse = schemaActif.safeParse({
    designation: donnees.get("designation"),
    type: donnees.get("type") ?? "vehicule",
    statut: donnees.get("statut") ?? "actif",
    site: texte(donnees, "site"),
    dateAcquisition: texte(donnees, "dateAcquisition"),
    valeurAcquisition: String(donnees.get("valeurAcquisition") ?? "0"),
    uniteCompteur: texte(donnees, "uniteCompteur"),
    compteurInitial: texte(donnees, "compteurInitial"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  // Le propriétaire décide de tout le reste : un actif de client ne vaut rien
  // au bilan de l'entreprise, et ses interventions se facturent.
  const proprietaireId = reference(donnees, "proprietaireId");

  try {
    const { code } = await db.transaction((tx) =>
      creerActifDans(
        tx,
        session.organizationId,
        {
          designation: valeurs.designation,
          type: valeurs.type,
          statut: valeurs.statut,
          employeId: reference(donnees, "employeId") ?? null,
          intervenantId: reference(donnees, "intervenantId") ?? null,
          proprietaireId: proprietaireId ?? null,
          site: valeurs.site ?? null,
          dateAcquisition: valeurs.dateAcquisition ?? null,
          valeurAcquisition: proprietaireId ? 0 : valeurs.valeurAcquisition,
          uniteCompteur: valeurs.uniteCompteur ?? null,
          compteurInitial: valeurs.compteurInitial ?? null,
        },
        session.userId,
      ),
    );

    revaliderParcs();
    return { code };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}

/**
 * Change l'état de service d'un actif.
 *
 * Geste courant du matin : un véhicule part au garage, un ordinateur revient.
 * Il ne passe pas par le formulaire complet — trois clics pour dire qu'une
 * camionnette est immobilisée, et personne ne le fera.
 */
export async function changerStatutActif(donnees: FormData): Promise<void> {
  const session = await exigerDroit("actifs.fiche.gerer");

  const id = String(donnees.get("id") ?? "");
  const analyse = z
    .enum(["actif", "entretien", "immobilise", "cede"])
    .safeParse(donnees.get("statut"));

  if (!analyse.success) return;

  const [modifie] = await db
    .update(actifs)
    .set({
      statut: analyse.data,
      updatedAt: new Date(),
      version: sql`${actifs.version} + 1`,
    })
    .where(
      and(eq(actifs.id, id), eq(actifs.organizationId, session.organizationId)),
    )
    .returning({ id: actifs.id, code: actifs.code });

  if (!modifie) return;

  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: session.organizationId,
    userId: session.userId,
    action: "actif.statut",
    entityType: "actif",
    entityId: modifie.id,
    after: { code: modifie.code, statut: analyse.data },
  });

  revaliderParcs();
}

// -------------------------------------------------------------- interventions

export interface EtatIntervention {
  erreur?: string;
  numero?: string;
  message?: string;
}

const schemaIntervention = z.object({
  actifId: z.string().regex(UUID, "Choisissez un actif."),
  nature: z.enum(["preventif", "correctif", "controle"]),
  libelle: z.string().trim().min(2, "Décrivez ce qui a été fait."),
  prestataire: z.string().trim().max(80).optional(),
  cout: entier,
  compteur: entier.optional(),
  effectueeLe: z.string().regex(DATE_ISO).optional(),
});

export async function enregistrerIntervention(
  _precedent: EtatIntervention,
  donnees: FormData,
): Promise<EtatIntervention> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("actifs.intervention.saisir");
  if (refus) return refus;

  const analyse = schemaIntervention.safeParse({
    actifId: texte(donnees, "actifId") ?? "",
    nature: donnees.get("nature") ?? "correctif",
    libelle: donnees.get("libelle"),
    prestataire: texte(donnees, "prestataire"),
    cout: String(donnees.get("cout") ?? "0"),
    compteur: texte(donnees, "compteur"),
    effectueeLe: texte(donnees, "effectueeLe"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  try {
    const { numero } = await db.transaction((tx) =>
      enregistrerInterventionDans(
        tx,
        session.organizationId,
        {
          actifId: valeurs.actifId,
          nature: valeurs.nature,
          libelle: valeurs.libelle,
          prestataireId: reference(donnees, "prestataireId") ?? null,
          prestataire: valeurs.prestataire ?? null,
          cout: valeurs.cout,
          compteur: valeurs.compteur ?? null,
          // Une date nue devient midi UTC : minuit basculerait la veille dès
          // que le serveur tourne à l'ouest d'Abidjan.
          effectueeLe: valeurs.effectueeLe
            ? new Date(`${valeurs.effectueeLe}T12:00:00Z`)
            : undefined,
          echeanceId: reference(donnees, "echeanceId") ?? null,
        },
        session.userId,
      ),
    );

    revaliderParcs();
    return { numero, message: valeurs.libelle };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}

// -------------------------------------------------------------------- relevés

export interface EtatReleve {
  erreur?: string;
  message?: string;
}

export async function enregistrerReleve(
  _precedent: EtatReleve,
  donnees: FormData,
): Promise<EtatReleve> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("actifs.intervention.saisir");
  if (refus) return refus;

  const analyse = z
    .object({
      actifId: z.string().regex(UUID, "Choisissez un actif."),
      valeur: entier,
    })
    .safeParse({
      actifId: texte(donnees, "actifId") ?? "",
      valeur: String(donnees.get("valeur") ?? "0"),
    });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  try {
    await db.transaction((tx) =>
      enregistrerReleveDans(
        tx,
        session.organizationId,
        { actifId: analyse.data.actifId, valeur: analyse.data.valeur },
        session.userId,
      ),
    );

    await tracer({ action: "actif.releve", entite: "actif", entiteId: analyse.data.actifId, apres: { valeur: analyse.data.valeur } });
    revaliderParcs();
    return { message: `Compteur relevé à ${analyse.data.valeur}.` };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}

// ----------------------------------------------------------------- échéances

export interface EtatEcheance {
  erreur?: string;
  message?: string;
}

const schemaEcheance = z.object({
  actifId: z.string().regex(UUID, "Choisissez un actif."),
  nature: z.enum(["assurance", "visite", "garantie", "entretien", "vignette", "patente"]),
  libelle: z.string().trim().max(80).optional(),
  echeanceLe: z.string().regex(DATE_ISO).optional(),
  compteurCible: entier.optional(),
});

export async function creerEcheance(
  _precedent: EtatEcheance,
  donnees: FormData,
): Promise<EtatEcheance> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("actifs.echeance.gerer");
  if (refus) return refus;

  const analyse = schemaEcheance.safeParse({
    actifId: texte(donnees, "actifId") ?? "",
    nature: donnees.get("nature") ?? "entretien",
    libelle: texte(donnees, "libelle"),
    echeanceLe: texte(donnees, "echeanceLe"),
    compteurCible: texte(donnees, "compteurCible"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  try {
    await db.transaction((tx) =>
      creerEcheanceDans(
        tx,
        session.organizationId,
        {
          actifId: valeurs.actifId,
          nature: valeurs.nature,
          libelle: valeurs.libelle ?? null,
          echeanceLe: valeurs.echeanceLe ?? null,
          compteurCible: valeurs.compteurCible ?? null,
        },
        session.userId,
      ),
    );

    revaliderParcs();
    return { message: "Échéance enregistrée." };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}
