/**
 * Efface les données d'essai avant la mise en service réelle.
 *
 *   node scripts/effacer-donnees.cjs                               état des lieux, rien n'est touché
 *   node scripts/effacer-donnees.cjs --confirmer "MARIA GROUP SARL"   efface
 *
 * Garde l'entreprise, les comptes, les rôles et les droits, les modules, les
 * référentiels et les réglages (`TABLES_GARDEES`, `src/db/effacement.ts`).
 * Efface tout ce qui a été saisi à l'usage : salariés, intervenants, tiers,
 * articles et stock, devis et factures, achats, trésorerie, comptabilité,
 * paie, présences et congés, visiteurs, courrier, projets, tâches, PV,
 * réunions, messagerie, notifications, journal d'audit — et remet la
 * numérotation des pièces à 1.
 *
 * IRRÉVERSIBLE. Faire une sauvegarde de la base juste avant (Dokploy :
 * « Backups » de la base, ou `pg_dump`). La confirmation exige la raison
 * sociale exacte : on ne vide pas une base par une flèche du haut.
 *
 * Les pièces jointes ne sont pas détruites : le dossier de l'entreprise dans
 * STOCKAGE_LOCAL est RENOMMÉ (`<id>.efface-<date>`), plus rien ne le lit ; le
 * supprimer à la main une fois la reprise vérifiée.
 *
 * Depuis le terminal du conteneur (Dokploy) : `node scripts/effacer-donnees.cjs`.
 * Sur la base locale PGlite : `pnpm effacer-donnees`, serveur ARRÊTÉ.
 */
import { existsSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { effacerDonnees, planEffacement } from "../db/effacement";
import { ouvrirBase, urlBase } from "./connexion-base";

loadEnv({ path: ".env.local", quiet: true });

const url = urlBase();
if (!url) {
  console.error("DATABASE_URL absent.");
  process.exit(1);
}

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const base = await ouvrirBase(url!);
  try {
    const plan = await planEffacement(base.requete);
    const total = plan.effacees.reduce((s, t) => s + t.lignes, 0);
    const remplies = plan.effacees.filter((t) => t.lignes > 0);

    console.info(`\n  Entreprise : ${plan.organisation.nom}`);
    console.info(`\n  Gardé (${plan.gardees.length} tables) : ${plan.gardees.join(", ")}`);
    console.info(`\n  À effacer : ${total} lignes dans ${remplies.length} tables (sur ${plan.effacees.length})`);
    for (const t of remplies) console.info(`    ${String(t.lignes).padStart(8)}  ${t.table}`);

    const confirmation = argument("--confirmer");
    if (confirmation === undefined) {
      console.info(`\n  Rien n'a été touché. Pour effacer, après une sauvegarde de la base :\n    node scripts/effacer-donnees.cjs --confirmer "${plan.organisation.nom}"\n`);
      return;
    }
    if (confirmation !== plan.organisation.nom) {
      console.error(`\n  Confirmation refusée : « ${confirmation} » n'est pas la raison sociale « ${plan.organisation.nom} ». Rien n'a été touché.\n`);
      process.exitCode = 1;
      return;
    }

    const effacees = await effacerDonnees(base.requete, plan);
    console.info(`\n  Effacé : ${effacees} lignes. La numérotation des pièces repart de 1.`);

    // Les pièces jointes : mises de côté, pas détruites.
    const racine = resolve(process.env.STOCKAGE_LOCAL ?? (base.dossierPglite ? join(base.dossierPglite, "fichiers") : ".stockage"));
    const dossier = join(racine, plan.organisation.id);
    if (existsSync(dossier)) {
      const cote = `${dossier}.efface-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
      renameSync(dossier, cote);
      console.info(`  Pièces jointes mises de côté : ${cote}\n  (à supprimer à la main une fois la reprise vérifiée).`);
    }
    console.info("");
  } finally {
    await base.fermer();
  }
}

main().catch((erreur) => {
  console.error("Effacement en échec.", erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
