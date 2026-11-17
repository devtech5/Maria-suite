import type { Requete } from "./installation";

/**
 * Effacement des données d'essai, avant la mise en service réelle.
 *
 * Ce qui RESTE : l'entreprise et son identité, les comptes et leurs droits,
 * les modules ouverts, les référentiels et les réglages — ce que
 * l'installation a posé ou que l'administration a réglé. Ce qui PART : tout
 * le reste, c'est-à-dire toute donnée saisie à l'usage (salariés, tiers,
 * articles, pièces, écritures, congés, visites, courrier, projets…), avec
 * l'historique et la numérotation, qui repart de 1.
 *
 * La liste est celle des tables GARDÉES, pas celle des tables effacées : une
 * table métier ajoutée plus tard est une donnée d'usage, et s'efface. Une
 * nouvelle table de réglage s'ajoute ici.
 */
export const TABLES_GARDEES = [
  // Socle : l'entreprise, les comptes, les droits, les modules.
  "organizations",
  "users",
  "memberships",
  "roles",
  "role_permissions",
  "permissions",
  "sessions",
  "verification_codes",
  "organization_modules",
  "acces_modules",
  "acces_modules_roles",
  // Référentiels de l'installation.
  "postes",
  "services",
  // Réglages.
  "reglages_presence",
  "reglages_calculs",
  "parametres_paie",
  "jours_feries",
  "horaires_planning",
  "baremes_perdiem",
  "taches_colonnes",
  "comptes_courriel",
  // Installations : points d'accueil, sites et caméras.
  "accueils",
  "accueils_agents",
  "sites_securite",
  "cameras",
  // Règlement intérieur et guide : le texte et qui l'a lu.
  "reglement_versions",
  "reglement_acceptations",
  "guide_lectures",
  "guide_quiz",
] as const;

export interface PlanEffacement {
  organisation: { id: string; nom: string };
  /** Tables effacées et leur nombre de lignes, les plus remplies d'abord. */
  effacees: { table: string; lignes: number }[];
  gardees: string[];
}

/** Tables du schéma public, avec ou sans `organization_id`. */
async function tablesDuSchema(requete: Requete): Promise<{ table: string; organisee: boolean }[]> {
  const lignes = await requete(
    `select t.table_name as table,
            exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'organization_id') as organisee
     from information_schema.tables t
     where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
     order by t.table_name`,
  );
  return lignes.map((l) => ({ table: l.table, organisee: String(l.organisee) === "true" }));
}

/**
 * Ce que l'effacement ferait, sans rien toucher. Refuse une base qui porte
 * plusieurs entreprises : l'outil vide des tables entières, il n'a de sens
 * que pour l'entreprise unique.
 */
export async function planEffacement(requete: Requete): Promise<PlanEffacement> {
  const orgs = await requete(`select id, name from organizations`);
  if (orgs.length !== 1) throw new Error(`La base porte ${orgs.length} entreprises : l'effacement n'agit que sur une base à entreprise unique.`);

  const gardees = new Set<string>(TABLES_GARDEES);
  const tables = await tablesDuSchema(requete);
  // Seules les tables d'entreprise s'effacent ; celles sans `organization_id`
  // (comptes, catalogue des droits) sont du socle.
  const aEffacer = tables.filter((t) => t.organisee && !gardees.has(t.table)).map((t) => t.table);

  // Une table gardée qui pointe vers une table effacée perdrait ses lignes
  // (cascade) ou bloquerait l'effacement : mieux vaut refuser avant.
  const liens = await requete(
    `select distinct tc.table_name as source, ccu.table_name as cible
     from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
     where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
  );
  const effacees = new Set(aEffacer);
  const bloquants = liens.filter((l) => !effacees.has(l.source) && effacees.has(l.cible));
  if (bloquants.length > 0) {
    throw new Error(`Des tables gardées pointent vers des tables effacées : ${bloquants.map((b) => `${b.source} → ${b.cible}`).join(", ")}.`);
  }

  const comptes: { table: string; lignes: number }[] = [];
  for (const table of aEffacer) {
    const [{ n }] = await requete(`select count(*)::int as n from "${table}"`);
    comptes.push({ table, lignes: Number(n) });
  }
  comptes.sort((a, b) => b.lignes - a.lignes || a.table.localeCompare(b.table));

  return {
    organisation: { id: orgs[0].id, nom: orgs[0].name },
    effacees: comptes,
    gardees: tables.filter((t) => !effacees.has(t.table)).map((t) => t.table),
  };
}

/**
 * Efface en une seule instruction, donc tout ou rien : `TRUNCATE` sans
 * cascade, sur la liste entière. PostgreSQL refuse si une table hors de la
 * liste en dépend, ce que `planEffacement` a déjà vérifié.
 */
export async function effacerDonnees(requete: Requete, plan: PlanEffacement): Promise<number> {
  const tables = plan.effacees.map((t) => `"${t.table}"`);
  if (tables.length === 0) return 0;
  await requete(`truncate table ${tables.join(", ")}`);
  return plan.effacees.reduce((s, t) => s + t.lignes, 0);
}
