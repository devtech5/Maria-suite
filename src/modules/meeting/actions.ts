"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { env } from "@/env";
import { exigerEntreprise, session } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";
import { notifier } from "@/modules/communication/notifications";
import { instantLocal } from "@/modules/presences/calcul";

import { DUREE_MAX, DUREE_MIN, type Acteur, type Geste, type Statut } from "./calcul";
import {
  appliquerGesteDans,
  creerReunionDans,
  enregistrerCompteRenduDans,
  inviterDans,
  quitterDans,
  rejoindreDans,
  signalerDans,
} from "./creation";
import { signerFlux } from "./jetons";
import { participantsDe, type ParticipantVue } from "./requetes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

async function acteur(): Promise<{ organizationId: string; acteur: Acteur }> {
  const s = await exigerEntreprise();
  return { organizationId: s.organizationId, acteur: { userId: s.userId, organise: await peut("meeting.organiser") } };
}

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Meeting : opération refusée", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function rafraichir(reunionId?: string) {
  revalidatePath("/meeting", "layout");
  if (reunionId) revalidatePath(`/meeting/${reunionId}`);
}

const texte = (donnees: FormData, champ: string) => {
  const v = donnees.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

const schemaReunion = z.object({
  titre: z.string().trim().min(3, "Donnez un titre à la réunion.").max(160, "Titre trop long : 160 caractères au plus."),
  ordreDuJour: z.string().max(4000, "Ordre du jour trop long.").optional(),
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date.").optional(),
  heure: z.string().regex(/^\d{2}:\d{2}$/, "Indiquez l'heure.").optional(),
  dureeMinutes: z.number().int().min(DUREE_MIN, "Durée trop courte.").max(DUREE_MAX, "Durée trop longue : 8 heures au plus."),
  participants: z.array(z.string().regex(UUID)).max(100, "Cent invités au plus."),
  instantanee: z.boolean(),
});

/**
 * Programme une réunion, ou l'ouvre sur-le-champ (`instantanee`) : début à
 * maintenant, et l'organisateur est envoyé droit dans la salle.
 */
export async function programmerReunion(donnees: FormData): Promise<Resultat> {
  const refus = await refusDroit("meeting.organiser");
  if (refus) return { ok: false, message: refus.erreur };
  const { organizationId, acteur: qui } = await acteur();

  const analyse = schemaReunion.safeParse({
    titre: donnees.get("titre") ?? "",
    ordreDuJour: texte(donnees, "ordreDuJour"),
    jour: texte(donnees, "jour"),
    heure: texte(donnees, "heure"),
    dureeMinutes: Number(texte(donnees, "dureeMinutes") ?? 60),
    participants: donnees.getAll("participants").filter((v): v is string => typeof v === "string"),
    instantanee: donnees.get("instantanee") === "oui",
  });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  const v = analyse.data;

  // L'heure saisie est celle de l'entreprise, pas celle du serveur.
  const [org] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  const fuseau = org?.fuseau || "Africa/Abidjan";
  let debutPrevu = new Date();
  if (!v.instantanee) {
    if (!v.jour || !v.heure) return { ok: false, message: "Indiquez la date et l'heure de la réunion." };
    debutPrevu = instantLocal(v.jour, v.heure, fuseau);
    if (debutPrevu.getTime() < Date.now() - 5 * 60_000) return { ok: false, message: "Cette heure est déjà passée : choisissez une heure à venir." };
  }

  try {
    const { id, numero, invites } = await db.transaction((tx) =>
      creerReunionDans(tx, organizationId, { ...v, debutPrevu }, qui),
    );
    rafraichir();
    if (invites.length > 0) {
      await notifier(organizationId, invites, {
        categorie: "reunion",
        titre: v.instantanee ? `Réunion en cours : ${v.titre}` : `Invitation à la réunion ${numero} : ${v.titre}`,
        corps: v.instantanee ? "Rejoignez la salle dès maintenant." : `Le ${debutPrevu.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: fuseau })}.`,
        lien: v.instantanee ? `/meeting/${id}/salle` : `/meeting/${id}`,
      });
    }
    return { ok: true, id, message: v.instantanee ? `Réunion ${numero} ouverte.` : `Réunion ${numero} programmée, ${invites.length} invité${invites.length > 1 ? "s" : ""} prévenu${invites.length > 1 ? "s" : ""}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function inviter(reunionId: string, userIds: string[]): Promise<Resultat> {
  const refus = await refusDroit("meeting.participer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(reunionId) || userIds.length === 0 || userIds.length > 100 || !userIds.every((u) => UUID.test(u))) {
    return { ok: false, message: "Choisissez au moins une personne à inviter." };
  }
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { numero, titre, nouveaux } = await db.transaction((tx) => inviterDans(tx, organizationId, reunionId, userIds, qui));
    rafraichir(reunionId);
    if (nouveaux.length > 0) {
      await notifier(organizationId, nouveaux, { categorie: "reunion", titre: `Invitation à la réunion ${numero} : ${titre}`, corps: null, lien: `/meeting/${reunionId}` });
    }
    return { ok: true, message: nouveaux.length > 0 ? `${nouveaux.length} personne${nouveaux.length > 1 ? "s" : ""} invitée${nouveaux.length > 1 ? "s" : ""}.` : "Ces personnes étaient déjà invitées." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

const MESSAGES: Record<Geste, (numero: string) => string> = {
  terminer: (n) => `${n} terminée.`,
  annuler: (n) => `${n} annulée.`,
};

export async function agirSurReunion(reunionId: string, geste: Geste, motif?: string): Promise<Resultat> {
  const refus = await refusDroit("meeting.participer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(reunionId) || !(geste in MESSAGES)) return { ok: false, message: "Geste inconnu." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { numero } = await db.transaction((tx) =>
      appliquerGesteDans(tx, organizationId, reunionId, geste, qui, motif?.slice(0, 1000) ?? null),
    );
    rafraichir(reunionId);
    return { ok: true, message: MESSAGES[geste](numero) };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function enregistrerCompteRendu(reunionId: string, donnees: FormData): Promise<Resultat> {
  const refus = await refusDroit("meeting.participer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(reunionId)) return { ok: false, message: "Réunion introuvable." };
  const contenu = String(donnees.get("compteRendu") ?? "");
  if (contenu.length > 20_000) return { ok: false, message: "Compte rendu trop long : 20 000 caractères au plus." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { numero } = await db.transaction((tx) => enregistrerCompteRenduDans(tx, organizationId, reunionId, contenu, qui));
    rafraichir(reunionId);
    return { ok: true, message: `Compte rendu de ${numero} enregistré.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

// ------------------------------------------------------------------- salle

export interface Jetons {
  /** Adresse du serveur vidéo, `null` s'il n'est pas configuré. */
  base: string | null;
  publier: string;
  lire: string;
}

function jetons(organizationId: string, reunionId: string, userId: string): Jetons {
  return {
    base: env.VIDEO_URL_PUBLIQUE?.replace(/\/$/, "") ?? null,
    publier: signerFlux({ organizationId, reunionId, userId, sens: "publier" }),
    lire: signerFlux({ organizationId, reunionId, userId, sens: "lire" }),
  };
}

export type EntreeSalle = ({ ok: true; userId: string; jetons: Jetons } & { message: string }) | { ok: false; message: string };

/** Entre dans la salle : ouvre la réunion à la première arrivée, et remet les jetons des flux. */
export async function entrerDansLaSalle(reunionId: string): Promise<EntreeSalle> {
  const refus = await refusDroit("meeting.participer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(reunionId)) return { ok: false, message: "Réunion introuvable." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    await db.transaction((tx) => rejoindreDans(tx, organizationId, reunionId, qui));
    rafraichir(reunionId);
    return { ok: true, message: "", userId: qui.userId, jetons: jetons(organizationId, reunionId, qui.userId) };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export type Signal =
  | { etat: "salle"; statut: Statut; participants: ParticipantVue[]; jetons: Jetons }
  | { etat: "close"; statut: Statut }
  /** Écran verrouillé, session échue : rien à dire, la salle attend sans rediriger. */
  | { etat: "muet" };

/**
 * Signal de présence, toutes les quatre secondes depuis la salle. Comme toute
 * interrogation de fond, il lit la session sans rediriger et se tait si
 * l'écran est verrouillé : une redirection ferait perdre la salle sous le voile.
 */
export async function signalerPresence(reunionId: string, medias: { micro: boolean; camera: boolean; ecran: boolean }): Promise<Signal> {
  const s = await session();
  if (!s?.organizationId || s.verrouillee || s.doitChangerMotDePasse) return { etat: "muet" };
  if (!UUID.test(reunionId) || !(await peut("meeting.participer"))) return { etat: "muet" };
  const organizationId = s.organizationId;

  try {
    const { statut } = await db.transaction((tx) =>
      signalerDans(tx, organizationId, reunionId, s.userId, { micro: medias.micro === true, camera: medias.camera === true, ecran: medias.ecran === true }),
    );
    if (statut !== "en_cours") return { etat: "close", statut };
    return {
      etat: "salle",
      statut,
      participants: await participantsDe(organizationId, reunionId),
      jetons: jetons(organizationId, reunionId, s.userId),
    };
  } catch (erreur) {
    console.error("Meeting : signal de présence", erreur);
    return { etat: "muet" };
  }
}

/** Quitte la salle. Appelé aussi à la fermeture de l'onglet : rien à rendre. */
export async function quitterLaSalle(reunionId: string): Promise<void> {
  const s = await session();
  if (!s?.organizationId || !UUID.test(reunionId)) return;
  const organizationId = s.organizationId;
  await db.transaction((tx) => quitterDans(tx, organizationId, reunionId, s.userId)).catch((erreur) => {
    console.error("Meeting : sortie de salle", erreur);
  });
  rafraichir(reunionId);
}
