import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { synchroniserDroits } from "./droits";

/** Clé du verrou consultatif : deux démarrages simultanés ne migrent pas ensemble. */
const VERROU_MIGRATION = 727_001;

/**
 * Migrations et catalogue des droits, au démarrage du serveur.
 *
 * Sur le VPS, c'est ce qui garantit qu'un déploiement ne sert jamais une
 * version du code sur un schéma en retard — exactement la panne qui guettait
 * une ancienne instance, restée plusieurs migrations derrière le dépôt.
 *
 * Connexion dédiée, une seule, fermée à la fin : le pooler en mode
 * transaction ne tient pas une migration, d'où DATABASE_URL_MIGRATION quand
 * elle existe. Un échec arrête le démarrage — mieux vaut un service absent
 * qu'un service qui écrit dans un schéma qu'il ne comprend pas.
 */
export async function migrerAuDemarrage(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : migrations impossibles.");

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${VERROU_MIGRATION})`;
    await migrate(drizzle(client), { migrationsFolder: resolve(/*turbopackIgnore: true*/ "./drizzle") });
    await synchroniserDroits(async (texte, valeurs) => ({
      rows: await client.unsafe(texte, (valeurs ?? []) as never[]),
    }));
    await client`select pg_advisory_unlock(${VERROU_MIGRATION})`;
    console.info(JSON.stringify({ evenement: "migrations_appliquees", horodatage: new Date().toISOString() }));
  } finally {
    await client.end({ timeout: 5 });
  }
}
