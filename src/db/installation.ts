import { randomInt } from "node:crypto";

import { hash } from "@node-rs/argon2";

// Chemin relatif et non alias : ce module sert aussi au script
// `pnpm installer`, que `tsx` lance sans résoudre les alias du tsconfig.
import { ADRESSE_PROPRIETAIRE, MOTIF_ADRESSE_REFUSEE, adresseAutorisee } from "../lib/auth/identifiants";
import { PRESETS_ROLES } from "../lib/droits/catalogue";

/**
 * Installation de MARIA GROUP SARL et de son propriétaire.
 *
 * Partagée entre le script `pnpm installer` et le démarrage du serveur
 * (`MARIA_ADMIN_MOT_DE_PASSE`, voir `demarrage.ts`). Idempotente : relancée,
 * elle ne duplique ni l'entreprise, ni ses rôles, ni le compte.
 */

/** Une requête paramétrée, quel que soit le moteur derrière. */
export type Requete = (texte: string, valeurs?: unknown[]) => Promise<Record<string, string>[]>;

/** L'entreprise, telle qu'elle naît. Le reste se complète dans « Entreprise ». */
export const ENTREPRISE = {
  nom: "MARIA GROUP SARL",
  slug: "maria-group",
  formeJuridique: "SARL",
  pays: "CI",
  devise: "XOF",
  fuseau: "Africa/Abidjan",
  /** Bleu nuit et or, comme `COULEUR_PAR_DEFAUT` (`src/lib/identite.ts`) et la migration 0058. */
  couleurPrimaire: "#162E49",
  couleurSecondaire: "#BFA169",
};

/**
 * Modules coupés à la naissance de l'entreprise : MARIA GROUP SARL ne tient
 * ni commerce de détail, ni restaurant, ni maquis, ni hôtel, ni billetterie,
 * ni point de vente mobile money, ni stock. Le propriétaire en rallume un depuis
 * « Utilisateurs › Modules » ; l'installation, relancée, ne le recoupe pas.
 * Mêmes modules que les migrations 0049 et 0051, qui les coupent sur une
 * base existante.
 */
export const MODULES_COUPES_A_LA_NAISSANCE = [
  "boutique",
  "restaurant",
  "maquis",
  "hotellerie",
  "reservation",
  "enquetes",
  "billetterie",
  "valeur_electronique",
  "stock",
] as const;

/** Propriétaire et super administrateur du logiciel. */
export const PROPRIETAIRE = ADRESSE_PROPRIETAIRE;

export interface OptionsInstallation {
  email: string;
  nom: string;
  /** Mot de passe provisoire. Tiré au hasard s'il manque et qu'il en faut un. */
  motDePasse?: string;
  /** Remplace le mot de passe d'un compte existant. Sans lui, il n'y est pas touché. */
  reinitialiser?: boolean;
}

export interface ResultatInstallation {
  email: string;
  /** Le mot de passe posé, ou `null` si le compte existait et n'a pas été touché. */
  motDePasse: string | null;
}

/**
 * Crée l'entreprise, ses rôles préréglés et le propriétaire.
 *
 * Le mot de passe posé est provisoire : la première connexion exige de le
 * changer. Lève si la base porte déjà une autre entreprise — c'est le signe
 * qu'on vise la mauvaise base.
 */
export async function installerEntreprise(
  requete: Requete,
  options: OptionsInstallation,
): Promise<ResultatInstallation> {
  const email = options.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error(`Adresse du propriétaire invalide : « ${email} ».`);
  if (!adresseAutorisee(email)) throw new Error(`Adresse du propriétaire refusée : « ${email} ». ${MOTIF_ADRESSE_REFUSEE}`);

  const autres = await requete(`select name from organizations where slug <> $1 limit 1`, [ENTREPRISE.slug]);
  if (autres.length > 0) {
    throw new Error(
      `La base porte déjà une autre entreprise (« ${autres[0].name} »). ` +
        "Maria Suite ne sert que MARIA GROUP SARL : vérifiez DATABASE_URL.",
    );
  }

  const [entreprise] = await requete(
    `insert into organizations (name, slug, legal_form, country_code, currency, timezone, couleur_documents, couleur_secondaire, status)
    values ($1, $2, $3, $4, $5, $6, $7, $8, 'actif')
    on conflict (slug) do update set status = 'actif'
    returning id`,
    [
      ENTREPRISE.nom,
      ENTREPRISE.slug,
      ENTREPRISE.formeJuridique,
      ENTREPRISE.pays,
      ENTREPRISE.devise,
      ENTREPRISE.fuseau,
      ENTREPRISE.couleurPrimaire,
      ENTREPRISE.couleurSecondaire,
    ],
  );

  // Les rôles préréglés, comme dans toute entreprise : un caissier ne doit
  // pas voir la comptabilité.
  for (const preset of PRESETS_ROLES) {
    await requete(
      `insert into roles (organization_id, key, name, description, is_system)
      values ($1, $2, $3, $4, true)
      on conflict (organization_id, key) do nothing`,
      [entreprise.id, preset.cle, preset.nom, preset.description],
    );
  }

  for (const cle of MODULES_COUPES_A_LA_NAISSANCE) {
    await requete(
      `insert into organization_modules (organization_id, module_key, enabled)
      values ($1, $2, false)
      on conflict (organization_id, module_key) do nothing`,
      [entreprise.id, cle],
    );
  }

  const [proprietaire] = await requete(
    `select id from roles where organization_id = $1 and key = 'proprietaire'`,
    [entreprise.id],
  );

  const [existant] = await requete(`select id from users where email = $1`, [email]);
  let motDePasse: string | null = null;
  let userId: string;

  if (existant && !options.reinitialiser) {
    userId = existant.id;
  } else {
    motDePasse = options.motDePasse || motDePasseAuHasard();
    const [utilisateur] = await requete(
      `insert into users (email, full_name, password_hash, must_change_password)
      values ($1, $2, $3, true)
      on conflict (email) do update set
        password_hash = excluded.password_hash,
        must_change_password = true,
        failed_logins = 0,
        locked_until = null
      returning id`,
      [email, options.nom, await hash(motDePasse)],
    );
    userId = utilisateur.id;
  }

  await requete(
    `insert into memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values ($1, $2, $3, 'actif', true, now())
    on conflict (organization_id, user_id) do update set
      role_id = excluded.role_id,
      status = 'actif',
      is_owner = true`,
    [entreprise.id, userId, proprietaire.id],
  );

  return { email, motDePasse };
}

/** Quatre groupes de quatre caractères, sans les signes qu'on confond (0/o, 1/l/i). */
function motDePasseAuHasard(): string {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(0, 31)]).join(""),
  ).join("-");
}
