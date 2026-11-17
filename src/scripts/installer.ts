/**
 * Installe MARIA GROUP SARL et son propriétaire.
 *
 *   pnpm installer
 *
 * Maria Suite ne sert qu'une entreprise. Il n'y a ni inscription publique ni
 * création d'entreprise dans l'application : l'entreprise naît ici, une fois,
 * avec ses rôles préréglés et un propriétaire. Les autres comptes sont ensuite
 * invités depuis « Membres ».
 *
 * Le propriétaire est le super administrateur du logiciel : il détient tous
 * les droits, sans condition. C'est `PROPRIETAIRE` (`src/db/installation.ts`), sauf si
 * l'environnement en désigne un autre.
 *
 * Variables, toutes facultatives :
 *   · MARIA_ADMIN_EMAIL         adresse de connexion du propriétaire ;
 *   · MARIA_ADMIN_NOM           son nom affiché (« Administrateur » sinon) ;
 *   · MARIA_ADMIN_MOT_DE_PASSE  mot de passe provisoire, tiré au hasard sinon
 *                               et affiché UNE fois dans ce terminal.
 *
 * Le mot de passe est provisoire : la première connexion exige de le changer.
 *
 * Le script est idempotent. Relancé, il ne duplique rien et ne touche pas au
 * mot de passe d'un compte existant — sauf avec `--reinitialiser`, qui en
 * tire un nouveau (mot de passe perdu, administrateur remplacé).
 *
 * Il refuse de tourner sur une base qui porte déjà une autre entreprise :
 * c'est le signe qu'on vise la mauvaise base.
 *
 * SQL brut plutôt que Drizzle, comme `verifier-base.ts` : `tsx` ne résout pas
 * les alias de chemins du tsconfig, et un script d'exploitation n'a pas à
 * dépendre de la couche applicative.
 *
 * En production, l'image Docker l'embarque, empaqueté par esbuild
 * (`pnpm build:scripts`). Depuis le terminal du conteneur (Dokploy) :
 *
 *   node scripts/installer.cjs
 *
 * Il prend DATABASE_URL dans l'environnement du conteneur.
 *
 * Sur la base locale PGlite : `pnpm installer:local`, serveur ARRÊTÉ (un seul
 * processus ouvre le dossier). Les identifiants sont alors aussi écrits dans
 * `.pglite/identifiants.txt`, à côté de la base qu'ils ouvrent.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { config as loadEnv } from "dotenv";

import { ENTREPRISE, installerEntreprise, PROPRIETAIRE } from "../db/installation";
import { ouvrirBase, urlBase } from "./connexion-base";

loadEnv({ path: ".env.local", quiet: true });

// La base locale PGlite prime : `installer:local` ne doit jamais écrire sur
// la base distante de DATABASE_URL_MIGRATION.
const url = urlBase();

if (!url) {
  console.error("DATABASE_URL absent. Renseignez .env.local.");
  process.exit(1);
}

async function main() {
  const base = await ouvrirBase(url!);

  try {
    const { email, motDePasse } = await installerEntreprise(base.requete, {
      email: process.env.MARIA_ADMIN_EMAIL?.trim() || PROPRIETAIRE,
      nom: process.env.MARIA_ADMIN_NOM?.trim() || "Administrateur",
      motDePasse: process.env.MARIA_ADMIN_MOT_DE_PASSE,
      reinitialiser: process.argv.includes("--reinitialiser"),
    });

    const lignes = [`Entreprise      ${ENTREPRISE.nom}`, `Propriétaire    ${email}`];
    if (motDePasse) lignes.push(`Mot de passe    ${motDePasse}  (provisoire, à changer à la première connexion)`);
    const identifiants = `${lignes.join("\n")}\n`;

    if (base.dossierPglite && motDePasse) {
      writeFileSync(join(base.dossierPglite, "identifiants.txt"), identifiants);
    }

    const conclusion = motDePasse
      ? "Le mot de passe n'est affiché qu'ici."
      : "Compte existant : mot de passe inchangé. `--reinitialiser` en tire un nouveau.";

    console.info(`\n  Maria Suite installée.\n\n${identifiants.replace(/^(?=.)/gm, "    ")}\n  ${conclusion}\n`);
  } finally {
    await base.fermer();
  }
}

main().catch((erreur) => {
  console.error("Installation en échec.", erreur);
  process.exit(1);
});
