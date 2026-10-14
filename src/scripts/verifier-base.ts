/**
 * Contrôle l'état de la base après migration.
 *
 *   pnpm db:check
 *
 * Vérifie trois choses, dans cet ordre d'importance :
 *   1. la connexion aboutit ;
 *   2. les tables attendues existent — socle et modules livrés ;
 *   3. la sécurité au niveau ligne est active sur chacune.
 *
 * Le troisième point est une défense en profondeur : Maria Suite se connecte avec
 * un rôle propriétaire, qui contourne RLS. Mais qu'un outil expose un jour le
 * schéma `public` (API REST automatique, rôle de lecture partagé), une table
 * sans RLS y deviendrait lisible d'une entreprise à l'autre.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL absent. Renseignez .env.local.");
  process.exit(1);
}

const TABLES_ATTENDUES = [
  "abonnements",
  "acces_dossiers_archives",
  "acces_modules",
  "acomptes_sejour",
  "actifs",
  "ajustements_conge",
  "archives",
  "arretes_caisse",
  "articles",
  "audit_logs",
  "avances_tresorerie",
  "avenants",
  "billets",
  "bons_caisse",
  "bons_paiement",
  "budgets_charges",
  "bulletins_paie",
  "cameras",
  "campagnes",
  "change_log",
  "chambres_hotel",
  "charges_recurrentes",
  "commandes_achat",
  "commandes_salle",
  "commerciaux",
  "commissions",
  "comptages_caisse",
  "comptes_courriel",
  "comptes_tresorerie",
  "conges",
  "consultations",
  "contacts_tiers",
  "contrats_location",
  "creneaux_planning",
  "conventions",
  "conversations",
  "declarations_tva",
  "demandes_signature",
  "departs",
  "depenses",
  "depots",
  "desinscriptions",
  "document_sequences",
  "documents",
  "dossiers_archives",
  "echeances",
  "echeances_charge",
  "ecritures",
  "employees",
  "enquetes",
  "entity_codes",
  "envois",
  "equipements_informatiques",
  "etapes_mission",
  "exercices_clotures",
  "factures_fournisseur",
  "familles_article",
  "floats_session",
  "formulaires",
  "horaires_planning",
  "imports_releve",
  "interventions",
  "jours_feries",
  "licences_attribuees",
  "licences_logicielles",
  "lignes_commande_achat",
  "lignes_commande_salle",
  "lignes_ecriture",
  "lignes_facture_fournisseur",
  "lignes_piece",
  "lignes_reception_achat",
  "lignes_releve",
  "lignes_transport",
  "lignes_vente",
  "memberships",
  "messages",
  "missions",
  "modeles_article",
  "mouvements_stock",
  "mouvements_tresorerie",
  "notifications",
  "offres",
  "operations_guichet",
  "organization_modules",
  "organizations",
  "paiements_abonnement",
  "parametres_paie",
  "participants",
  "passages_abonnement",
  "periodes_paie",
  "permissions",
  "pieces_commerciales",
  "pieces_employe",
  "pieces_projet",
  "pieces_soumission",
  "pleins_carburant",
  "pointages",
  "postes_caisse",
  "presences",
  "prestataires",
  "prestations",
  "prestations_sejour",
  "preuves_mission",
  "projets",
  "receptions_achat",
  "reglages_presence",
  "reglements_fournisseur",
  "reglements_piece",
  "reglements_vente",
  "regularisations_avance",
  "releves_compteur",
  "reponses_enquete",
  "reponses_formulaire",
  "ressources",
  "role_permissions",
  "roles",
  "sejours_hotel",
  "sessions",
  "sessions_caisse",
  "sessions_guichet",
  "signataires",
  "sites_securite",
  "soumissions",
  "sync_cursors",
  "sync_mutations",
  "tables_salle",
  "taches",
  "reunions",
  "reunion_participants",
  "tiers",
  "users",
  "vehicules",
  "ventes",
  "verification_codes",
  "voyageurs_sejour",
  "virements_internes",
  "workers",
];

const sql = postgres(url, { max: 1, prepare: false });

// Enveloppé dans une fonction : tsx compile ce script en CommonJS, qui n'admet
// pas d'`await` au niveau racine.
async function main() {
  const debut = Date.now();
  await sql`select 1`;
  console.log(`Connexion établie en ${Date.now() - debut} ms.`);

  const lignes = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    select tablename, rowsecurity
    from pg_tables
    where schemaname = 'public'
    order by tablename
  `;

  const presentes = new Set(lignes.map((l) => l.tablename));
  const manquantes = TABLES_ATTENDUES.filter((t) => !presentes.has(t));
  const sansRls = lignes.filter(
    (l) => TABLES_ATTENDUES.includes(l.tablename) && !l.rowsecurity,
  );

  console.log(
    `\nTables attendues : ${TABLES_ATTENDUES.length - manquantes.length} / ${TABLES_ATTENDUES.length}`,
  );

  if (manquantes.length > 0) {
    console.error(`Manquantes : ${manquantes.join(", ")}`);
    console.error("Lancez `pnpm db:migrate`.");
    process.exit(1);
  }

  if (sansRls.length > 0) {
    console.error(
      `\nRLS INACTIF sur ${sansRls.length} table(s) : ${sansRls
        .map((l) => l.tablename)
        .join(", ")}`,
    );
    console.error(
      "Ces tables sont lisibles avec la clé publiable. Appliquez la migration 0001.",
    );
    process.exit(1);
  }

  console.log(`RLS actif sur les ${TABLES_ATTENDUES.length} tables.`);

  // Les tables hors liste sont signalées sans faire échouer : ce sont soit des
  // tables métier à venir, soit des tables propres à l'hébergeur.
  const autres = lignes.filter((l) => !TABLES_ATTENDUES.includes(l.tablename));
  if (autres.length > 0) {
    const risquees = autres.filter((l) => !l.rowsecurity).map((l) => l.tablename);
    console.log(`\nAutres tables du schéma public : ${autres.length}`);
    if (risquees.length > 0) {
      console.warn(`Sans RLS : ${risquees.join(", ")}`);
    }
  }

  console.log("\nBase conforme.");
}

main()
  .catch((erreur) => {
    console.error("\nÉchec de la vérification :");
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
