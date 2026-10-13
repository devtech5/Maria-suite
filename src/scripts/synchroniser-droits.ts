/**
 * Recopie le catalogue des droits dans `permissions`, et installe les rôles
 * préréglés dans les entreprises qui ne les ont pas encore.
 *
 *   pnpm db:droits
 *
 * Le code reste la source de vérité : la table n'est qu'un miroir, et sert de
 * clé étrangère aux rôles qu'une entreprise crée elle-même. Un rôle préréglé
 * n'en dépend pas — ses droits sont lus dans `src/lib/droits/catalogue.ts`.
 *
 * À relancer après tout ajout de droit ou de rôle préréglé. L'opération est idempotente : les
 * libellés se mettent à jour, rien ne se duplique.
 *
 * Les droits retirés du catalogue ne sont PAS supprimés ici. Effacer une ligne
 * emporterait en cascade les accords des rôles personnalisés, sans retour
 * possible ; le script les signale et laisse la décision à un humain.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

import { DROITS, PRESETS_ROLES, type DefinitionDroit } from "../lib/droits/catalogue";

loadEnv({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL absent. Renseignez .env.local.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

// `DROITS` est figé par `as const` : chaque entrée y a son type littéral, et
// celles sans description n'exposent pas la propriété. Cette vue élargie rend
// le catalogue lisible uniformément.
const catalogue: readonly DefinitionDroit[] = DROITS;

// Enveloppé dans une fonction : tsx compile ce script en CommonJS, qui n'admet
// pas d'`await` au niveau racine.
async function main() {
  for (const droit of catalogue) {
    await sql`
      insert into permissions (key, module_key, label, description)
      values (${droit.cle}, ${droit.moduleKey}, ${droit.libelle}, ${droit.description ?? null})
      on conflict (key) do update
        set module_key  = excluded.module_key,
            label       = excluded.label,
            description = excluded.description
    `;
  }

  console.log(`${catalogue.length} droits synchronisés.`);

  const orphelines = await sql<{ key: string }[]>`
    select key from permissions
    where key <> all(${sql.array(catalogue.map((d) => d.cle))})
    order by key
  `;

  if (orphelines.length > 0) {
    console.warn(
      `\n${orphelines.length} droit(s) en base hors catalogue : ${orphelines
        .map((o) => o.key)
        .join(", ")}`,
    );
    console.warn(
      "Plus aucune vérification ne les lit. Les supprimer retirerait aussi les " +
        "accords des rôles personnalisés qui les portent — à faire à la main.",
    );
  }

  await installerRolesPresets();
}

/**
 * Installe les rôles préréglés dans les entreprises qui ne les ont pas.
 *
 * Sert au rattrapage : une entreprise créée avant l'arrivée d'un préréglage
 * n'a que les rôles de son époque, et personne ne peut y être nommé caissier
 * tant que la ligne manque. Le script d'installation les pose à la création
 * de l'entreprise (`src/scripts/installer.ts`).
 *
 * Un rôle déjà présent n'est pas retouché : l'exploitant a pu le renommer, et
 * ce nom lui appartient. Seuls les droits viennent du code, et ils n'ont pas
 * de ligne en base.
 */
async function installerRolesPresets() {
  let poses = 0;

  for (const preset of PRESETS_ROLES) {
    const inseres = await sql`
      insert into roles (organization_id, key, name, description, is_system)
      select id, ${preset.cle}, ${preset.nom}, ${preset.description}, true
      from organizations
      on conflict (organization_id, key) do nothing
      returning id
    `;
    poses += inseres.length;
  }

  // Les entreprises créées avant que les préréglages n'existent portent un
  // rôle de propriétaire non marqué. La marque ne décide de rien — la
  // résolution regarde la clé — mais un écran qui trierait sur la colonne
  // rangerait ce rôle parmi ceux que l'entreprise a composés.
  const marques = await sql`
    update roles set is_system = true
    where is_system = false
      and key = any(${sql.array(PRESETS_ROLES.map((p) => p.cle))})
    returning id
  `;

  if (marques.length > 0) {
    console.log(`${marques.length} rôle(s) préréglé(s) marqué(s) comme fournis par Fiessou.`);
  }

  console.log(
    poses === 0
      ? `${PRESETS_ROLES.length} rôles préréglés, déjà en place partout.`
      : `${poses} rôle(s) préréglé(s) posé(s) dans les entreprises qui en manquaient.`,
  );
}

main()
  .catch((erreur) => {
    console.error("\nÉchec de la synchronisation :");
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
