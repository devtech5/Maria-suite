import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/env";

import type { Qualite } from "./calcul";

/**
 * Secrets de la vidéo.
 *
 *   · Jeton de LECTURE — remis au navigateur qui ouvre une caméra, valable
 *     deux minutes : le temps d'établir la connexion. Une session WebRTC déjà
 *     ouverte continue ; un lien recopié ailleurs ne sert plus à rien.
 *   · Clé de RELAIS — celle avec laquelle le boîtier d'un site publie ses
 *     flux. Montrée une fois à sa création ; la base n'en garde que
 *     l'empreinte, comme pour un jeton de session.
 */

const DUREE_LECTURE_S = 120;

/** Clé HMAC propre à cet usage, dérivée d'AUTH_SECRET : un jeton de lecture n'ouvre rien d'autre. */
// « fiessou » est le nom d'origine du logiciel, gardé dans le contexte de la
// clé : le changer invaliderait les jetons en cours.
function cle(): Buffer {
  return createHmac("sha256", env.AUTH_SECRET).update("fiessou:video:lecture").digest();
}

function signer(contenu: string): string {
  return createHmac("sha256", cle()).update(contenu).digest("base64url");
}

export interface ObjetLecture {
  organizationId: string;
  cameraId: string;
  qualite: Qualite;
  userId: string;
}

export function signerLecture(objet: ObjetLecture, maintenant = Date.now()): string {
  const expire = Math.floor(maintenant / 1000) + DUREE_LECTURE_S;
  const contenu = [objet.organizationId, objet.cameraId, objet.qualite, objet.userId, String(expire)].join("~");
  return `${Buffer.from(contenu).toString("base64url")}.${signer(contenu)}`;
}

export function verifierLecture(jeton: string, maintenant = Date.now()): ObjetLecture | null {
  const [charge, signature] = jeton.split(".");
  if (!charge || !signature) return null;
  const contenu = Buffer.from(charge, "base64url").toString();
  const attendue = Buffer.from(signer(contenu));
  const recue = Buffer.from(signature);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  const [organizationId, cameraId, qualite, userId, expire] = contenu.split("~");
  if (!Number.isFinite(Number(expire)) || Number(expire) * 1000 < maintenant) return null;
  if (qualite !== "hd" && qualite !== "sd") return null;
  return { organizationId, cameraId, qualite, userId };
}

/** Nouvelle clé de relais : 32 octets tirés au hasard, et son empreinte. */
export function nouvelleCleRelais(): { cle: string; empreinte: string } {
  const cleRelais = randomBytes(32).toString("base64url");
  return { cle: cleRelais, empreinte: empreinteCle(cleRelais) };
}

export function empreinteCle(cleRelais: string): string {
  return createHash("sha256").update(cleRelais).digest("hex");
}

/** Comparaison à temps constant : la durée de la réponse ne trahit pas la clé. */
export function cleValide(cleRelais: string, empreinte: string | null): boolean {
  if (!empreinte || !cleRelais) return false;
  const a = Buffer.from(empreinteCle(cleRelais));
  const b = Buffer.from(empreinte);
  return a.length === b.length && timingSafeEqual(a, b);
}
