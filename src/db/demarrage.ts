import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { synchroniserDroits } from "./droits";
import { installerEntreprise, PROPRIETAIRE } from "./installation";

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
    if (process.env.MARIA_ADMIN_MOT_DE_PASSE) {
      await installerAuDemarrage((texte, valeurs) => client.unsafe(texte, (valeurs ?? []) as never[]));
    }
    await client`select pg_advisory_unlock(${VERROU_MIGRATION})`;
    console.info(JSON.stringify({ evenement: "migrations_appliquees", horodatage: new Date().toISOString() }));
  } finally {
    await client.end({ timeout: 5 });
  }
}

/**
 * Crée MARIA GROUP SARL et son propriétaire au démarrage, quand
 * `MARIA_ADMIN_MOT_DE_PASSE` est renseignée.
 *
 * Sert quand aucun terminal n'atteint le conteneur : la variable se pose dans
 * l'hébergeur, le redéploiement fait le reste. Le mot de passe est provisoire,
 * la première connexion exige de le changer.
 *
 * Un compte existant n'est jamais touché : laisser la variable en place ne
 * remet pas le mot de passe à chaque redémarrage. Il vaut mieux la retirer
 * une fois le compte ouvert, pour qu'elle ne traîne pas dans l'hébergeur.
 *
 * Un échec est journalisé sans arrêter le serveur : l'application doit rester
 * en ligne, et le script `installer` reste là pour réessayer. Le mot de passe
 * n'est jamais écrit dans le journal.
 */
async function installerAuDemarrage(requete: Parameters<typeof installerEntreprise>[0]): Promise<void> {
  try {
    const { email, motDePasse } = await installerEntreprise(requete, {
      email: process.env.MARIA_ADMIN_EMAIL?.trim() || PROPRIETAIRE,
      nom: process.env.MARIA_ADMIN_NOM?.trim() || "Administrateur",
      motDePasse: process.env.MARIA_ADMIN_MOT_DE_PASSE,
    });
    console.info(
      JSON.stringify({
        evenement: motDePasse ? "proprietaire_cree" : "proprietaire_existant",
        email,
        horodatage: new Date().toISOString(),
      }),
    );
  } catch (erreur) {
    console.error(
      JSON.stringify({
        evenement: "installation_refusee",
        message: erreur instanceof Error ? erreur.message : String(erreur),
        horodatage: new Date().toISOString(),
      }),
    );
  }
}
