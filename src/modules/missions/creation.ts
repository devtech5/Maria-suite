import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";

import {
  etapesMission,
  formulaires,
  missions,
  preuvesMission,
  reponsesFormulaire,
  type ChampFormulaire,
  type NatureMission,
  type TypePreuve,
} from "./schema";
import {
  GABARITS,
  PREFIXE_MISSION,
  estOuverte,
  estValidableEnOrdre,
  positionValide,
  preuvesManquantes,
  statutApresEtape,
  type GabaritEtape,
} from "./suivi";

/** Marge tolérée sur l'horloge d'un téléphone avant de la juger fantaisiste. */
const DERIVE_TOLEREE_MS = 5 * 60 * 1000;

/**
 * Heure du terrain, bornée par celle du serveur.
 *
 * L'heure de la prise fait foi, mais un téléphone déréglé dans le futur
 * produirait une étape « faite demain ». Au-delà de la marge, on retient
 * l'heure du serveur : mieux vaut une heure approchée qu'une impossible.
 */
export function heureTerrain(declaree: Date | undefined, maintenant = new Date()): Date {
  if (!declaree || Number.isNaN(declaree.getTime())) return maintenant;
  return declaree.getTime() > maintenant.getTime() + DERIVE_TOLEREE_MS
    ? maintenant
    : declaree;
}

// ----------------------------------------------------------------- missions

export interface NouvelleMission {
  nature: NatureMission;
  titre: string;
  lieu?: string | null;
  employeId?: string | null;
  intervenantId?: string | null;
  clientId?: string | null;
  actifId?: string | null;
  montant?: number;
  echeanceLe?: Date | null;
  notes?: string | null;
  /** Étapes propres à cette mission. Vide : le gabarit de la nature. */
  etapes?: GabaritEtape[];
}

/**
 * Ouvre une mission et ses étapes.
 *
 * La référence vient d'un compteur par nature ET par année : LIV-2026-00012.
 * Une suite commune à toutes les natures ferait sauter des numéros dans chacune,
 * et une pièce numérotée ne tolère pas de trou.
 */
export async function creerMissionDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleMission,
  userId?: string,
): Promise<{ id: string; reference: string }> {
  if (donnees.employeId && donnees.intervenantId) {
    throw new Error("Une mission est confiée à une personne, pas à deux.");
  }

  const etapes = donnees.etapes?.length ? donnees.etapes : GABARITS[donnees.nature];
  const annee = String(new Date().getFullYear());

  const reference = await prochainNumero(tx, organizationId, {
    cle: `mission:${donnees.nature}`,
    prefix: `${PREFIXE_MISSION[donnees.nature]}-${annee}-`,
    padding: 5,
    periode: annee,
  });

  const id = newId();

  await tx.insert(missions).values({
    id,
    organizationId,
    reference,
    nature: donnees.nature,
    titre: donnees.titre.trim(),
    lieu: donnees.lieu ?? null,
    employeId: donnees.employeId ?? null,
    intervenantId: donnees.intervenantId ?? null,
    clientId: donnees.clientId ?? null,
    actifId: donnees.actifId ?? null,
    montant: donnees.montant ?? 0,
    echeanceLe: donnees.echeanceLe ?? null,
    notes: donnees.notes ?? null,
  });

  await tx.insert(etapesMission).values(
    etapes.map((etape, index) => ({
      id: newId(),
      organizationId,
      missionId: id,
      ordre: index + 1,
      libelle: etape.libelle.trim(),
      preuvesRequises: etape.preuves,
    })),
  );

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "mission.creer",
      entityType: "mission",
      entityId: id,
      after: { reference, titre: donnees.titre, nature: donnees.nature },
    });
  }

  return { id, reference };
}

// ------------------------------------------------------------------- preuves

export interface NouvellePreuve {
  /** Produit par l'appareil : un renvoi retrouve la preuve déjà posée. */
  id: string;
  missionId: string;
  etapeId?: string | null;
  type: TypePreuve;
  texte?: string | null;
  fichierCle?: string | null;
  latitudeMicro?: number | null;
  longitudeMicro?: number | null;
  reponseId?: string | null;
  priseLe?: Date;
  deviceId?: string | null;
}

export type ResultatPreuve =
  | { ok: true; deja: boolean }
  | { ok: false; message: string };

/**
 * Enregistre une preuve venue du terrain.
 *
 * IDEMPOTENT : une file hors connexion renvoie deux fois la même photo quand le
 * réseau flanche. L'identifiant étant celui de l'appareil, le second envoi
 * retrouve la ligne et n'y touche pas.
 *
 * Une preuve sur une mission close est REFUSÉE : l'ajouter après coup
 * réécrirait l'histoire d'une livraison déjà contestée ou facturée.
 */
export async function enregistrerPreuveDans(
  tx: Transaction,
  organizationId: string,
  preuve: NouvellePreuve,
  userId?: string,
): Promise<ResultatPreuve> {
  const [existante] = await tx
    .select({ id: preuvesMission.id })
    .from(preuvesMission)
    .where(
      and(
        eq(preuvesMission.id, preuve.id),
        eq(preuvesMission.organizationId, organizationId),
      ),
    );
  if (existante) return { ok: true, deja: true };

  const [mission] = await tx
    .select({ statut: missions.statut })
    .from(missions)
    .where(
      and(
        eq(missions.id, preuve.missionId),
        eq(missions.organizationId, organizationId),
        isNull(missions.deletedAt),
      ),
    );
  if (!mission) return { ok: false, message: "Mission introuvable." };
  if (!estOuverte(mission.statut)) {
    return { ok: false, message: "Cette mission est close : elle n'accepte plus de preuve." };
  }

  if (preuve.etapeId) {
    const [etape] = await tx
      .select({ id: etapesMission.id })
      .from(etapesMission)
      .where(
        and(
          eq(etapesMission.id, preuve.etapeId),
          eq(etapesMission.missionId, preuve.missionId),
          eq(etapesMission.organizationId, organizationId),
        ),
      );
    if (!etape) return { ok: false, message: "Étape introuvable sur cette mission." };
  }

  if (preuve.type === "position") {
    if (
      preuve.latitudeMicro == null ||
      preuve.longitudeMicro == null ||
      !positionValide(preuve.latitudeMicro, preuve.longitudeMicro)
    ) {
      return { ok: false, message: "Position illisible." };
    }
  } else if (preuve.type === "photo") {
    if (!preuve.fichierCle) return { ok: false, message: "Photo manquante." };
  } else if (preuve.type === "formulaire") {
    if (!preuve.reponseId) return { ok: false, message: "Réponse de formulaire manquante." };
  } else if (!preuve.texte?.trim()) {
    return {
      ok: false,
      message:
        preuve.type === "signature"
          ? "Indiquez le nom de la personne qui signe."
          : "La note est vide.",
    };
  }

  await tx.insert(preuvesMission).values({
    id: preuve.id,
    organizationId,
    missionId: preuve.missionId,
    etapeId: preuve.etapeId ?? null,
    type: preuve.type,
    texte: preuve.texte?.trim() || null,
    fichierCle: preuve.fichierCle ?? null,
    latitudeMicro: preuve.latitudeMicro ?? null,
    longitudeMicro: preuve.longitudeMicro ?? null,
    reponseId: preuve.reponseId ?? null,
    priseLe: heureTerrain(preuve.priseLe),
    deviceId: preuve.deviceId ?? null,
    userId: userId ?? null,
  });

  return { ok: true, deja: false };
}

// -------------------------------------------------------------------- étapes

export type ResultatEtape =
  | { ok: true; statut: string; deja: boolean }
  | { ok: false; message: string };

const LIBELLE_PREUVE_MANQUANTE: Record<TypePreuve, string> = {
  photo: "une photo",
  position: "la position",
  signature: "la signature",
  note: "une note",
  formulaire: "le formulaire",
};

/**
 * Valide une étape.
 *
 * Trois contrôles, dans l'ordre où ils coûtent le moins cher à expliquer :
 * l'étape précédente est faite, les preuves exigées sont là, la mission est
 * ouverte. Valider ne coche pas une case — cela vérifie que le terrain a
 * rapporté de quoi trancher un litige.
 *
 * Idempotent : valider deux fois la même étape (rejeu de file) rend `deja`.
 */
export async function validerEtapeDans(
  tx: Transaction,
  organizationId: string,
  etapeId: string,
  options: { faiteLe?: Date; userId?: string } = {},
): Promise<ResultatEtape> {
  const [etape] = await tx
    .select()
    .from(etapesMission)
    .where(
      and(eq(etapesMission.id, etapeId), eq(etapesMission.organizationId, organizationId)),
    );
  if (!etape) return { ok: false, message: "Étape introuvable." };

  // Verrou sur la mission : deux validations simultanées d'étapes différentes
  // se sérialisent, sinon chacune lirait « l'autre n'est pas faite ».
  const [mission] = await tx
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.id, etape.missionId),
        eq(missions.organizationId, organizationId),
        isNull(missions.deletedAt),
      ),
    )
    .for("update");
  if (!mission) return { ok: false, message: "Mission introuvable." };

  const toutes = await tx
    .select()
    .from(etapesMission)
    .where(eq(etapesMission.missionId, mission.id))
    .orderBy(asc(etapesMission.ordre));

  const courante = toutes.find((e) => e.id === etapeId);
  if (courante?.faiteLe) return { ok: true, statut: mission.statut, deja: true };

  if (!estOuverte(mission.statut)) {
    return { ok: false, message: "Cette mission est close : ses étapes ne bougent plus." };
  }

  if (!estValidableEnOrdre(toutes, etapeId)) {
    return { ok: false, message: "Validez d'abord les étapes précédentes." };
  }

  const rapportees = await tx
    .select({ type: preuvesMission.type })
    .from(preuvesMission)
    .where(
      and(eq(preuvesMission.etapeId, etapeId), isNull(preuvesMission.deletedAt)),
    );

  const manque = preuvesManquantes(
    etape.preuvesRequises,
    rapportees.map((p) => p.type),
  );
  if (manque.length > 0) {
    return {
      ok: false,
      message: `Il manque ${manque.map((t) => LIBELLE_PREUVE_MANQUANTE[t]).join(", ")} pour clore « ${etape.libelle} ».`,
    };
  }

  const maintenant = new Date();
  const faiteLe = heureTerrain(options.faiteLe, maintenant);

  const [posee] = await tx
    .update(etapesMission)
    .set({
      faiteLe,
      faiteParUserId: options.userId ?? null,
      updatedAt: maintenant,
      version: sql`${etapesMission.version} + 1`,
    })
    .where(and(eq(etapesMission.id, etapeId), isNull(etapesMission.faiteLe)))
    .returning({ id: etapesMission.id });
  if (!posee) return { ok: true, statut: mission.statut, deja: true };

  const apres = toutes.map((e) => (e.id === etapeId ? { ...e, faiteLe } : e));
  const statut = statutApresEtape(mission.statut, apres);

  if (statut !== mission.statut) {
    await tx
      .update(missions)
      .set({
        statut,
        debuteLe: mission.debuteLe ?? faiteLe,
        clotureLe: statut === "terminee" ? faiteLe : null,
        updatedAt: maintenant,
        version: sql`${missions.version} + 1`,
      })
      .where(eq(missions.id, mission.id));
  }

  if (options.userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId: options.userId,
      action: "mission.etape",
      entityType: "mission",
      entityId: mission.id,
      after: { reference: mission.reference, etape: etape.libelle, statut },
    });
  }

  return { ok: true, statut, deja: false };
}

/**
 * Pose l'issue d'une mission : échouée ou annulée, avec son motif.
 *
 * Le passage est un `UPDATE ... RETURNING` conditionné au statut ouvert : deux
 * clics ne produisent pas deux issues, et une mission terminée ne se renie pas.
 */
export async function cloreMissionDans(
  tx: Transaction,
  organizationId: string,
  missionId: string,
  issue: "echouee" | "annulee",
  motif: string,
  userId?: string,
): Promise<{ reference: string } | null> {
  const maintenant = new Date();

  const [mission] = await tx
    .update(missions)
    .set({
      statut: issue,
      motif: motif.trim(),
      clotureLe: maintenant,
      updatedAt: maintenant,
      version: sql`${missions.version} + 1`,
    })
    .where(
      and(
        eq(missions.id, missionId),
        eq(missions.organizationId, organizationId),
        sql`${missions.statut} in ('planifiee', 'en_cours')`,
      ),
    )
    .returning({ reference: missions.reference });

  if (!mission) return null;

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: issue === "echouee" ? "mission.echouer" : "mission.annuler",
      entityType: "mission",
      entityId: missionId,
      after: { reference: mission.reference, motif },
    });
  }

  return mission;
}

// ---------------------------------------------------------------- formulaires

export async function creerFormulaireDans(
  tx: Transaction,
  organizationId: string,
  donnees: { nom: string; usage?: string | null; champs: ChampFormulaire[] },
  userId?: string,
): Promise<{ id: string }> {
  const id = newId();

  await tx.insert(formulaires).values({
    id,
    organizationId,
    nom: donnees.nom.trim(),
    usage: donnees.usage ?? null,
    champs: donnees.champs,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "formulaire.creer",
      entityType: "formulaire",
      entityId: id,
      after: { nom: donnees.nom, champs: donnees.champs.length },
    });
  }

  return { id };
}

export interface NouvelleReponse {
  /** Produit par l'appareil : idempotent comme une vente ou une preuve. */
  id: string;
  formulaireId: string;
  missionId?: string | null;
  valeurs: Record<string, string | number | boolean>;
  priseLe?: Date;
  deviceId?: string | null;
}

/**
 * Enregistre une réponse de formulaire.
 *
 * Les champs obligatoires sont contrôlés ICI et non seulement à l'écran : une
 * file hors connexion peut rejouer une saisie incomplète, et une réponse à
 * moitié vide ne sert à aucun recensement.
 */
export async function enregistrerReponseDans(
  tx: Transaction,
  organizationId: string,
  reponse: NouvelleReponse,
  userId?: string,
): Promise<{ ok: true; deja: boolean } | { ok: false; message: string }> {
  const [existante] = await tx
    .select({ id: reponsesFormulaire.id })
    .from(reponsesFormulaire)
    .where(
      and(
        eq(reponsesFormulaire.id, reponse.id),
        eq(reponsesFormulaire.organizationId, organizationId),
      ),
    );
  if (existante) return { ok: true, deja: true };

  const [formulaire] = await tx
    .select()
    .from(formulaires)
    .where(
      and(
        eq(formulaires.id, reponse.formulaireId),
        eq(formulaires.organizationId, organizationId),
        isNull(formulaires.deletedAt),
      ),
    );
  if (!formulaire) return { ok: false, message: "Formulaire introuvable." };

  for (const champ of formulaire.champs) {
    // Une photo ne voyage pas dans une réponse : elle se joint à l'étape, avec
    // son propre dépôt. L'exiger ici rendrait le formulaire impossible à rendre.
    if (!champ.obligatoire || champ.type === "photo") continue;
    const valeur = reponse.valeurs[champ.cle];
    const vide = valeur === undefined || valeur === null || String(valeur).trim() === "";
    if (vide) return { ok: false, message: `« ${champ.libelle} » est obligatoire.` };
  }

  await tx.insert(reponsesFormulaire).values({
    id: reponse.id,
    organizationId,
    formulaireId: formulaire.id,
    missionId: reponse.missionId ?? null,
    champs: formulaire.champs,
    valeurs: reponse.valeurs,
    priseLe: heureTerrain(reponse.priseLe),
    deviceId: reponse.deviceId ?? null,
    userId: userId ?? null,
  });

  return { ok: true, deja: false };
}
