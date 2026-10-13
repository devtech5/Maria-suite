/**
 * Installe MARIA GROUP SARL et son premier administrateur.
 *
 *   MARIA_ADMIN_EMAIL=… pnpm installer
 *
 * Maria Suite ne sert qu'une entreprise. Il n'y a ni inscription publique ni
 * création d'entreprise dans l'application : l'entreprise naît ici, une fois,
 * avec ses rôles préréglés et un propriétaire. Les autres comptes sont ensuite
 * invités depuis « Membres ».
 *
 * Variables :
 *   · MARIA_ADMIN_EMAIL         adresse de connexion de l'administrateur (requise) ;
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
 *   MARIA_ADMIN_EMAIL=… node scripts/installer.cjs
 *
 * Il prend DATABASE_URL dans l'environnement du conteneur.
 *
 * Sur la base locale PGlite : `pnpm installer:local`, serveur ARRÊTÉ (un seul
 * processus ouvre le dossier). Les identifiants sont alors aussi écrits dans
 * `.pglite/identifiants.txt`, à côté de la base qu'ils ouvrent.
 */
import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { hash } from "@node-rs/argon2";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

import { PRESETS_ROLES } from "../lib/droits/catalogue";

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

/** L'entreprise, telle qu'elle naît. Le reste se complète dans « Entreprise ». */
const ENTREPRISE = {
  nom: "MARIA GROUP SARL",
  slug: "maria-group",
  formeJuridique: "SARL",
  pays: "CI",
  devise: "XOF",
  fuseau: "Africa/Abidjan",
};

type Ligne = Record<string, string>;

/** Une requête paramétrée, quel que soit le moteur derrière. */
interface Base {
  requete(texte: string, valeurs?: unknown[]): Promise<Ligne[]>;
  fermer(): Promise<void>;
}

async function ouvrir(chaine: string): Promise<Base & { dossierPglite?: string }> {
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
      requete: async (texte, valeurs) => (await client.query<Ligne>(texte, valeurs)).rows,
      fermer: () => client.close(),
    };
  }

  const sql = postgres(chaine, { max: 1, connect_timeout: 15 });
  return {
    requete: (texte, valeurs) => sql.unsafe<Ligne[]>(texte, (valeurs ?? []) as never[]),
    fermer: () => sql.end(),
  };
}

/** Quatre groupes de quatre caractères, sans les signes qu'on confond (0/o, 1/l/i). */
function motDePasseAuHasard(): string {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(0, 31)]).join(""),
  ).join("-");
}

async function main() {
  const email = process.env.MARIA_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("MARIA_ADMIN_EMAIL absent ou invalide : l'adresse de connexion de l'administrateur.");
    process.exit(1);
  }
  const nom = process.env.MARIA_ADMIN_NOM?.trim() || "Administrateur";
  const reinitialiser = process.argv.includes("--reinitialiser");

  const base = await ouvrir(url!);

  try {
    const autres = await base.requete(`select name from organizations where slug <> $1 limit 1`, [ENTREPRISE.slug]);
    if (autres.length > 0) {
      throw new Error(
        `La base porte déjà une autre entreprise (« ${autres[0].name} »). ` +
          "Maria Suite ne sert que MARIA GROUP SARL : vérifiez DATABASE_URL.",
      );
    }

    const [entreprise] = await base.requete(
      `insert into organizations (name, slug, legal_form, country_code, currency, timezone, status)
      values ($1, $2, $3, $4, $5, $6, 'actif')
      on conflict (slug) do update set status = 'actif'
      returning id`,
      [ENTREPRISE.nom, ENTREPRISE.slug, ENTREPRISE.formeJuridique, ENTREPRISE.pays, ENTREPRISE.devise, ENTREPRISE.fuseau],
    );

    // Les rôles préréglés, comme dans toute entreprise : un caissier ne doit
    // pas voir la comptabilité.
    for (const preset of PRESETS_ROLES) {
      await base.requete(
        `insert into roles (organization_id, key, name, description, is_system)
        values ($1, $2, $3, $4, true)
        on conflict (organization_id, key) do nothing`,
        [entreprise.id, preset.cle, preset.nom, preset.description],
      );
    }

    const [proprietaire] = await base.requete(
      `select id from roles where organization_id = $1 and key = 'proprietaire'`,
      [entreprise.id],
    );

    const [existant] = await base.requete(`select id from users where email = $1`, [email]);
    let motDePasse: string | null = null;
    let userId: string;

    if (existant && !reinitialiser) {
      userId = existant.id;
    } else {
      motDePasse = process.env.MARIA_ADMIN_MOT_DE_PASSE || motDePasseAuHasard();
      const [utilisateur] = await base.requete(
        `insert into users (email, full_name, password_hash, must_change_password)
        values ($1, $2, $3, true)
        on conflict (email) do update set
          password_hash = excluded.password_hash,
          must_change_password = true,
          failed_logins = 0,
          locked_until = null
        returning id`,
        [email, nom, await hash(motDePasse)],
      );
      userId = utilisateur.id;
    }

    await base.requete(
      `insert into memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
      values ($1, $2, $3, 'actif', true, now())
      on conflict (organization_id, user_id) do update set
        role_id = excluded.role_id,
        status = 'actif',
        is_owner = true`,
      [entreprise.id, userId, proprietaire.id],
    );

    const lignes = [`Entreprise      ${ENTREPRISE.nom}`, `Administrateur  ${email}`];
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
