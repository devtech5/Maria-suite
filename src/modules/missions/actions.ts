"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { exigerDroit, refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { cheminDe, deposer, urlSignee } from "@/lib/stockage";

import {
  cloreMissionDans,
  creerFormulaireDans,
  creerMissionDans,
  enregistrerPreuveDans,
  enregistrerReponseDans,
  validerEtapeDans,
} from "./creation";
import { preuvesMission } from "./schema";
import { GABARITS, cleDeChamp } from "./suivi";
import { estDoublon } from "@/lib/erreurs-pg";
import { tracer } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entierSigne = z.number().int();

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

function reference(donnees: FormData, champ: string): string | undefined {
  const valeur = texte(donnees, champ);
  return valeur && UUID.test(valeur) ? valeur : undefined;
}

function rafraichir() {
  revalidatePath("/missions", "layout");
  revalidatePath("/");
}

// ------------------------------------------------------------------ missions

export interface EtatMission {
  erreur?: string;
  reference?: string;
}

const schemaMission = z.object({
  nature: z.enum(["livraison", "chantier", "collecte", "projet", "intervention"]),
  titre: z.string().trim().min(3, "Donnez un titre à la mission."),
  lieu: z.string().trim().max(120).optional(),
  montant: entier,
  echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).optional(),
});

export async function creerMission(
  _precedent: EtatMission,
  donnees: FormData,
): Promise<EtatMission> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("missions.mission.gerer");
  if (refus) return refus;

  const analyse = schemaMission.safeParse({
    nature: donnees.get("nature") ?? "livraison",
    titre: donnees.get("titre"),
    lieu: texte(donnees, "lieu"),
    montant: String(donnees.get("montant") ?? "0"),
    echeance: texte(donnees, "echeance"),
  });
  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;
  const employeId = reference(donnees, "employeId");
  const intervenantId = reference(donnees, "intervenantId");

  if (employeId && intervenantId) {
    return { erreur: "Une mission est confiée à une personne, pas à deux." };
  }

  // Une date nue devient midi UTC : minuit basculerait la veille dès que le
  // serveur tourne à l'ouest d'Abidjan. Une heure saisie est lue en UTC, qui
  // est aussi l'heure d'Abidjan toute l'année.
  const echeanceLe = valeurs.echeance
    ? new Date(
        valeurs.echeance.includes("T")
          ? `${valeurs.echeance}:00Z`
          : `${valeurs.echeance}T12:00:00Z`,
      )
    : null;

  try {
    const { reference: ref } = await db.transaction((tx) =>
      creerMissionDans(
        tx,
        session.organizationId,
        {
          nature: valeurs.nature,
          titre: valeurs.titre,
          lieu: valeurs.lieu ?? null,
          employeId: employeId ?? null,
          intervenantId: intervenantId ?? null,
          clientId: reference(donnees, "clientId") ?? null,
          actifId: reference(donnees, "actifId") ?? null,
          montant: valeurs.montant,
          echeanceLe,
          etapes: GABARITS[valeurs.nature],
        },
        session.userId,
      ),
    );

    rafraichir();
    return { reference: ref };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}

/** Déclare une mission échouée ou l'annule, avec son motif. */
export async function cloreMission(donnees: FormData): Promise<void> {
  const session = await exigerDroit("missions.mission.gerer");

  const analyse = z
    .object({
      id: z.string().regex(UUID),
      issue: z.enum(["echouee", "annulee"]),
      motif: z.string().trim().min(3),
    })
    .safeParse({
      id: donnees.get("id"),
      issue: donnees.get("issue"),
      motif: donnees.get("motif"),
    });
  if (!analyse.success) return;

  const { id, issue, motif } = analyse.data;
  const close = await db.transaction((tx) =>
    cloreMissionDans(tx, session.organizationId, id, issue, motif, session.userId),
  );

  if (close) rafraichir();
}

// ------------------------------------------------------------------- terrain

/**
 * Opération remontée du terrain.
 *
 * Un seul point d'entrée, pris par la saisie en ligne comme par le rattrapage
 * d'une file hors connexion : deux chemins d'écriture divergeraient. Chaque
 * opération porte son identifiant, produit par l'appareil, et se rejoue sans
 * effet.
 */
const schemaOperation = z.discriminatedUnion("genre", [
  z.object({
    genre: z.literal("preuve"),
    id: z.string().regex(UUID),
    missionId: z.string().regex(UUID),
    etapeId: z.string().regex(UUID).nullable().optional(),
    type: z.enum(["position", "signature", "note"]),
    texte: z.string().trim().max(2000).nullable().optional(),
    latitudeMicro: entierSigne.nullable().optional(),
    longitudeMicro: entierSigne.nullable().optional(),
    priseLe: z.string().datetime().optional(),
    deviceId: z.string().max(120).nullable().optional(),
  }),
  z.object({
    genre: z.literal("etape"),
    etapeId: z.string().regex(UUID),
    faiteLe: z.string().datetime().optional(),
  }),
  z.object({
    genre: z.literal("reponse"),
    id: z.string().regex(UUID),
    formulaireId: z.string().regex(UUID),
    missionId: z.string().regex(UUID).nullable().optional(),
    valeurs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    priseLe: z.string().datetime().optional(),
    deviceId: z.string().max(120).nullable().optional(),
  }),
]);

export type OperationTerrain = z.input<typeof schemaOperation>;

export type ResultatTerrain =
  | { ok: true; deja: boolean; statut?: string }
  | { ok: false; message: string };

export async function rapporterTerrain(
  operation: OperationTerrain,
): Promise<ResultatTerrain> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("missions.terrain.saisir");
  if (refus) return { ok: false, message: refus.erreur ?? "Accès refusé." };

  const analyse = schemaOperation.safeParse(operation);
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  const op = analyse.data;

  try {
    const resultat = await db.transaction(async (tx) => {
      if (op.genre === "preuve") {
        return enregistrerPreuveDans(
          tx,
          session.organizationId,
          {
            id: op.id,
            missionId: op.missionId,
            etapeId: op.etapeId ?? null,
            type: op.type,
            texte: op.texte ?? null,
            latitudeMicro: op.latitudeMicro ?? null,
            longitudeMicro: op.longitudeMicro ?? null,
            priseLe: op.priseLe ? new Date(op.priseLe) : undefined,
            deviceId: op.deviceId ?? null,
          },
          session.userId,
        );
      }

      if (op.genre === "etape") {
        return validerEtapeDans(tx, session.organizationId, op.etapeId, {
          faiteLe: op.faiteLe ? new Date(op.faiteLe) : undefined,
          userId: session.userId,
        });
      }

      return enregistrerReponseDans(
        tx,
        session.organizationId,
        {
          id: op.id,
          formulaireId: op.formulaireId,
          missionId: op.missionId ?? null,
          valeurs: op.valeurs,
          priseLe: op.priseLe ? new Date(op.priseLe) : undefined,
          deviceId: op.deviceId ?? null,
        },
        session.userId,
      );
    });

    if (!resultat.ok) return resultat;

    rafraichir();
    const statut =
      "statut" in resultat && typeof resultat.statut === "string"
        ? resultat.statut
        : undefined;
    return { ok: true, deja: resultat.deja, statut };
  } catch (erreur) {
    console.error("Remontée terrain refusée", erreur);
    return { ok: false, message: "L'enregistrement a échoué. Réessayez." };
  }
}

const TAILLE_PHOTO_MAX = 8 * 1024 * 1024;
const TYPES_PHOTO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Joint une photo à une étape.
 *
 * Le fichier part AVANT l'insertion : un dépôt raté laisse la base intacte. La
 * photo n'est pas prise en charge par la file hors connexion — un fichier
 * lourd mérite sa propre reprise, et l'écran le dit à l'utilisateur.
 */
export async function joindrePhoto(
  donnees: FormData,
): Promise<ResultatTerrain> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("missions.terrain.saisir");
  if (refus) return { ok: false, message: refus.erreur ?? "Accès refusé." };

  const missionId = String(donnees.get("missionId") ?? "");
  const etapeId = String(donnees.get("etapeId") ?? "");
  const fichier = donnees.get("photo");

  if (!UUID.test(missionId) || !UUID.test(etapeId)) {
    return { ok: false, message: "Étape introuvable." };
  }
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { ok: false, message: "Choisissez une photo." };
  }
  const extension = TYPES_PHOTO[fichier.type];
  if (!extension) return { ok: false, message: "Format de photo non pris en charge." };
  if (fichier.size > TAILLE_PHOTO_MAX) {
    return { ok: false, message: "Photo trop lourde (8 Mo maximum)." };
  }

  const id = newId();
  const chemin = cheminDe(session.organizationId, id, extension);

  const depot = await deposer({
    chemin,
    contenu: await fichier.arrayBuffer(),
    typeMime: fichier.type,
  });
  if (!depot.ok) return { ok: false, message: depot.raison };

  try {
    const resultat = await db.transaction((tx) =>
      enregistrerPreuveDans(
        tx,
        session.organizationId,
        { id, missionId, etapeId, type: "photo", fichierCle: chemin },
        session.userId,
      ),
    );
    if (!resultat.ok) {
      const { supprimer } = await import("@/lib/stockage");
      await supprimer(chemin);
      return resultat;
    }
    await tracer({ action: "mission.photo", entite: "mission", entiteId: missionId, apres: { etapeId, preuve: id } });
    rafraichir();
    return { ok: true, deja: false };
  } catch (erreur) {
    const { supprimer } = await import("@/lib/stockage");
    await supprimer(chemin);
    console.error("Photo refusée", erreur);
    return { ok: false, message: "L'enregistrement de la photo a échoué." };
  }
}

// ---------------------------------------------------------------- formulaires

export interface EtatFormulaire {
  erreur?: string;
  nom?: string;
}

const TYPES_CHAMP = ["texte", "nombre", "choix", "photo", "position", "oui_non"] as const;

const schemaFormulaire = z.object({
  nom: z.string().trim().min(3, "Donnez un nom au formulaire."),
  usage: z.string().trim().max(80).optional(),
  champs: z
    .array(
      z.object({
        libelle: z.string().trim().min(1),
        type: z.enum(TYPES_CHAMP),
        obligatoire: z.boolean(),
        options: z.array(z.string().trim().min(1)).optional(),
      }),
    )
    .min(1, "Ajoutez au moins un champ."),
});

export async function creerFormulaire(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("missions.formulaire.gerer");
  if (refus) return refus;

  // Les champs arrivent en lignes « libellé | type | * » (étoile : obligatoire),
  // une par ligne, les choix après un deuxième tiret : « Type | choix | * | A, B ».
  const lignes = String(donnees.get("champs") ?? "")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(Boolean);

  const champsBruts = lignes.map((ligne) => {
    const [libelle = "", type = "texte", marque = "", options = ""] = ligne
      .split("|")
      .map((part) => part.trim());
    return {
      libelle,
      type: type.toLowerCase(),
      obligatoire: marque === "*",
      options: options ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
    };
  });

  const analyse = schemaFormulaire.safeParse({
    nom: donnees.get("nom"),
    usage: texte(donnees, "usage"),
    champs: champsBruts,
  });
  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const prises = new Set<string>();
  const champs = analyse.data.champs.map((champ) => ({
    ...champ,
    cle: cleDeChamp(champ.libelle, prises),
  }));

  const sansListe = champs.find((c) => c.type === "choix" && !c.options?.length);
  if (sansListe) {
    return { erreur: `« ${sansListe.libelle} » est une liste : indiquez ses choix.` };
  }

  try {
    await db.transaction((tx) =>
      creerFormulaireDans(
        tx,
        session.organizationId,
        { nom: analyse.data.nom, usage: analyse.data.usage ?? null, champs },
        session.userId,
      ),
    );
    revalidatePath("/missions", "layout");
    return { nom: analyse.data.nom };
  } catch (erreur) {
    if (estDoublon(erreur)) {
      return { erreur: "Un formulaire porte déjà ce nom." };
    }
    throw erreur;
  }
}

/**
 * URL signée d'une photo, valable cinq minutes.
 *
 * Demandée AU CLIC et jamais rendue dans le HTML : une adresse posée dans une
 * page en cache resterait valable pour qui la retrouve.
 */
export async function ouvrirPhoto(preuveId: string): Promise<string | null> {
  const session = await exigerDroit("missions.consulter");
  if (!UUID.test(preuveId)) return null;

  const [preuve] = await db
    .select({ cle: preuvesMission.fichierCle })
    .from(preuvesMission)
    .where(
      and(
        eq(preuvesMission.id, preuveId),
        eq(preuvesMission.organizationId, session.organizationId),
        isNull(preuvesMission.deletedAt),
      ),
    );

  return preuve?.cle ? urlSignee(preuve.cle) : null;
}
