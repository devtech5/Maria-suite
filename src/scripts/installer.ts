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
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import postgres from "postgres";

import { ENTREPRISE, installerEntreprise, PROPRIETAIRE, type Requete } from "../db/installation";

loadEnv({ path: ".env.local", quiet: true });

// La base locale PGlite prime : `installer:local` ne doit jamais écrire sur
// la base distante de DATABASE_URL_MIGRATION.
const url = process.env.DATABASE_URL?.startsWith("pglite:")
  ? process.env.DATABASE_URL
  : process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL absent. Renseignez .env.local.");
  process.exit(1);
}

async function ouvrir(chaine: string): Promise<{ requete: Requete; fermer(): Promise<void>; dossierPglite?: string }> {
  if (chaine.startsWith("pglite:")) {
    const dossier = resolve(chaine.slice("pglite:".length) || "./.pglite");
    mkdirSync(dossier, { recursive: true });
    // Import différé : l'image de production n'embarque pas PGlite, et le
    // script y tourne sur PostgreSQL.
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite(dossier);
    await client.waitReady;
    // Les tables viennent des migrations, appliquées au démarrage du serveur.
    const [{ existe }] = (
      await client.query<{ existe: boolean }>("select to_regclass('public.users') is not null as existe")
    ).rows;
    if (!existe) {
      await client.close();
      throw new Error("Base PGlite vide : lancer `pnpm dev:local` une fois pour appliquer les migrations.");
    }
    return {
      dossierPglite: dossier,
      requete: async (texte, valeurs) => (await client.query<Record<string, string>>(texte, valeurs)).rows,
      fermer: () => client.close(),
    };
  }

  const sql = postgres(chaine, { max: 1, connect_timeout: 15 });
  return {
    requete: (texte, valeurs) => sql.unsafe<Record<string, string>[]>(texte, (valeurs ?? []) as never[]),
    fermer: () => sql.end(),
  };
}

async function main() {
  const base = await ouvrir(url!);

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
