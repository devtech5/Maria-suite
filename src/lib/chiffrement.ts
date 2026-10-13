import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { env } from "@/env";

/**
 * Chiffrement des secrets qu'il faut RELIRE — le mot de passe d'application
 * d'une boîte mail, que le serveur présente à chaque connexion IMAP. Un mot de
 * passe de connexion à Maria Suite, lui, se hache (Argon2) : on n'a jamais besoin
 * de le relire.
 *
 * AES-256-GCM : chiffré ET authentifié — un octet modifié en base fait échouer
 * le déchiffrement au lieu de produire un mot de passe faux. La clé dérive
 * d'`AUTH_SECRET` par HKDF, avec un contexte propre à chaque usage : changer
 * `AUTH_SECRET` oblige à reconnecter les boîtes, rien de plus.
 */

const VERSION = "v1";

// « fiessou » est le nom d'origine du logiciel. Il reste dans la dérivation :
// le changer rendrait illisible tout secret déjà chiffré.
function cle(usage: string): Buffer {
  return Buffer.from(hkdfSync("sha256", env.AUTH_SECRET, "fiessou", `fiessou:${usage}`, 32));
}

export function chiffrer(texte: string, usage: string): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle(usage), iv);
  const donnees = Buffer.concat([chiffreur.update(texte, "utf8"), chiffreur.final()]);
  const etiquette = chiffreur.getAuthTag();
  return [VERSION, iv.toString("base64url"), etiquette.toString("base64url"), donnees.toString("base64url")].join(".");
}

export function dechiffrer(scelle: string, usage: string): string {
  const [version, iv, etiquette, donnees] = scelle.split(".");
  if (version !== VERSION || !iv || !etiquette || donnees === undefined) throw new Error("Secret illisible.");
  const dechiffreur = createDecipheriv("aes-256-gcm", cle(usage), Buffer.from(iv, "base64url"));
  dechiffreur.setAuthTag(Buffer.from(etiquette, "base64url"));
  return Buffer.concat([dechiffreur.update(Buffer.from(donnees, "base64url")), dechiffreur.final()]).toString("utf8");
}
