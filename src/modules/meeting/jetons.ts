import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";

/**
 * Jetons des flux de réunion.
 *
 * Remis au navigateur depuis la salle, renouvelés à chaque signal de
 * présence, valables deux minutes : le temps d'établir une connexion. Une
 * liaison WebRTC déjà ouverte continue ; un lien recopié ailleurs ne sert
 * plus à rien passé ce délai.
 *
 *   · publier — vaut pour les flux du titulaire seulement (sa caméra, son
 *     écran) : on ne publie pas sous le nom d'un autre ;
 *   · lire    — vaut pour tous les flux de la réunion, et d'elle seule.
 */

const DUREE_S = 120;

export type Sens = "publier" | "lire";

export interface ObjetFlux {
  organizationId: string;
  reunionId: string;
  userId: string;
  sens: Sens;
}

/** Clé HMAC propre à cet usage, dérivée d'AUTH_SECRET : un jeton de réunion n'ouvre pas une caméra de magasin. */
function cle(): Buffer {
  return createHmac("sha256", env.AUTH_SECRET).update("maria:meeting:flux").digest();
}

function signer(contenu: string): string {
  return createHmac("sha256", cle()).update(contenu).digest("base64url");
}

export function signerFlux(objet: ObjetFlux, maintenant = Date.now()): string {
  const expire = Math.floor(maintenant / 1000) + DUREE_S;
  const contenu = [objet.organizationId, objet.reunionId, objet.userId, objet.sens, String(expire)].join("~");
  return `${Buffer.from(contenu).toString("base64url")}.${signer(contenu)}`;
}

export function verifierFlux(jeton: string, maintenant = Date.now()): ObjetFlux | null {
  const [charge, signature] = jeton.split(".");
  if (!charge || !signature) return null;
  const contenu = Buffer.from(charge, "base64url").toString();
  const attendue = Buffer.from(signer(contenu));
  const recue = Buffer.from(signature);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  const [organizationId, reunionId, userId, sens, expire] = contenu.split("~");
  if (!Number.isFinite(Number(expire)) || Number(expire) * 1000 < maintenant) return null;
  if (sens !== "publier" && sens !== "lire") return null;
  return { organizationId, reunionId, userId, sens };
}
