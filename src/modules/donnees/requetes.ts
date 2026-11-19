import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import type { Transaction } from "@/lib/sequences";

import { CATALOGUE } from "./catalogue";
import { accesColonne, colonnesRecherche, type ColonneDecrite, type TableDecrite } from "./regles";

/**
 * Lecture des tables pour la console. Une table ou une colonne n'entre dans
 * une requête que nommée par le catalogue, jamais par la saisie ; toute
 * lecture filtre sur l'entreprise ; un secret n'est jamais lu.
 */

export type Valeur = string | number | boolean | null | Record<string, unknown> | unknown[];
export type Ligne = Record<string, Valeur>;

export const PAR_PAGE = 50;

type Executant = Transaction | typeof db;

const aColonne = (t: TableDecrite, nom: string) => t.colonnes.some((c) => c.nom === nom);

/** Les colonnes qu'on peut lire : toutes, sauf les secrets. */
export function colonnesLisibles(t: TableDecrite): ColonneDecrite[] {
  return t.colonnes.filter((c) => accesColonne(t.nom, c) !== "masquee");
}

function selection(t: TableDecrite): SQL {
  return sql.join(
    colonnesLisibles(t).map((c) => sql.identifier(c.nom)),
    sql`, `,
  );
}

/** Ramène une valeur du pilote à ce que l'écran affiche : nombre, date ISO, objet JSON. */
function normaliser(c: ColonneDecrite, v: unknown): Valeur {
  if (v === null || v === undefined) return null;
  if (c.genre === "entier") return Number(v);
  if (c.genre === "booleen") return Boolean(v);
  if (c.genre === "date") return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  if (c.genre === "horodatage") return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
  if (c.genre === "json" || c.genre === "liste") return typeof v === "string" ? (JSON.parse(v) as Valeur) : (v as Valeur);
  return String(v);
}

function enLigne(t: TableDecrite, brute: Record<string, unknown>): Ligne {
  const ligne: Ligne = {};
  for (const c of colonnesLisibles(t)) ligne[c.nom] = normaliser(c, brute[c.nom]);
  return ligne;
}

export interface Comptes {
  actives: number;
  corbeille: number;
}

/** Nombre de lignes de chaque table, actives et à la corbeille, en une requête. */
export async function compterTables(organizationId: string): Promise<Map<string, Comptes>> {
  const morceaux = [...CATALOGUE.values()].map((t) =>
    aColonne(t, "deleted_at")
      ? sql`select ${t.nom}::text as t, count(*) filter (where deleted_at is null) as actives, count(*) filter (where deleted_at is not null) as corbeille from ${sql.identifier(t.nom)} where organization_id = ${organizationId}`
      : sql`select ${t.nom}::text as t, count(*) as actives, 0::bigint as corbeille from ${sql.identifier(t.nom)} where organization_id = ${organizationId}`,
  );
  const lignes = await db.execute<{ t: string; actives: string; corbeille: string }>(sql.join(morceaux, sql` union all `));
  return new Map(lignes.map((l) => [l.t, { actives: Number(l.actives), corbeille: Number(l.corbeille) }]));
}

export interface Page {
  lignes: Ligne[];
  /** Une page de plus existe. */
  suite: boolean;
}

/**
 * Une page de lignes, les plus récentes d'abord. La recherche porte sur le
 * texte lisible de la ligne ; la corbeille montre les lignes supprimées.
 */
export async function listerLignes(
  t: TableDecrite,
  organizationId: string,
  options: { q?: string; page?: number; corbeille?: boolean; filtre?: { colonne: string; valeur: string } | null },
): Promise<Page> {
  const conditions: SQL[] = [sql`organization_id = ${organizationId}`];
  // Le filtre ne nomme qu'une colonne connue du catalogue : « les bons de cette caisse ».
  const filtre = options.filtre && t.colonnes.find((c) => c.nom === options.filtre?.colonne && accesColonne(t.nom, c) !== "masquee");
  if (filtre && options.filtre) conditions.push(sql`${sql.identifier(filtre.nom)}::text = ${options.filtre.valeur}`);
  if (aColonne(t, "deleted_at")) conditions.push(options.corbeille ? sql`deleted_at is not null` : sql`deleted_at is null`);
  else if (options.corbeille) return { lignes: [], suite: false };
  const q = options.q?.trim();
  const texte = colonnesRecherche(t);
  if (q) {
    const motif = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const champs = [...(t.cle ? [sql`${sql.identifier(t.cle)}::text`] : []), ...texte.map((c) => sql`${sql.identifier(c.nom)}::text`)];
    conditions.push(sql`concat_ws(' ', ${sql.join(champs, sql`, `)}) ilike ${motif}`);
  }
  const page = Math.max(0, Math.floor(options.page ?? 0));
  const departage = t.cle ? sql`, ${sql.identifier(t.cle)} desc` : sql``;
  const ordre = aColonne(t, "created_at") ? sql`order by created_at desc${departage}` : t.cle ? sql`order by ${sql.identifier(t.cle)} desc` : sql``;
  const brutes = await db.execute<Record<string, unknown>>(sql`
    select ${selection(t)} from ${sql.identifier(t.nom)}
    where ${sql.join(conditions, sql` and `)}
    ${ordre}
    limit ${PAR_PAGE + 1} offset ${page * PAR_PAGE}
  `);
  return { lignes: brutes.slice(0, PAR_PAGE).map((b) => enLigne(t, b)), suite: brutes.length > PAR_PAGE };
}

/** La condition qui désigne une ligne : l'entreprise, et la clé primaire. */
export function designer(t: TableDecrite, organizationId: string, id: string): SQL {
  if (!t.cle) throw new Error("Cette table n'a pas de clé simple : ses lignes ne s'ouvrent pas une à une.");
  return sql`organization_id = ${organizationId} and ${sql.identifier(t.cle)}::text = ${id}`;
}

/** Une ligne, corbeille comprise. */
export async function lireLigne(t: TableDecrite, organizationId: string, id: string, tx: Executant = db): Promise<Ligne | null> {
  const [brute] = await tx.execute<Record<string, unknown>>(sql`select ${selection(t)} from ${sql.identifier(t.nom)} where ${designer(t, organizationId, id)}`);
  return brute ? enLigne(t, brute) : null;
}

/** La même, verrouillée pour une écriture. */
export async function verrouillerLigne(tx: Transaction, t: TableDecrite, organizationId: string, id: string): Promise<Ligne | null> {
  const [brute] = await tx.execute<Record<string, unknown>>(
    sql`select ${selection(t)} from ${sql.identifier(t.nom)} where ${designer(t, organizationId, id)} for update`,
  );
  return brute ? enLigne(t, brute) : null;
}

export interface Reference {
  table: string;
  colonne: string;
  nombre: number;
}

/** Les lignes d'autres tables qui désignent celle-ci, corbeille comprise. */
export async function referencesVers(t: TableDecrite, organizationId: string, id: string, tx: Executant = db): Promise<Reference[]> {
  if (t.referencee.length === 0) return [];
  const morceaux = t.referencee.map(
    (r) =>
      sql`select ${r.table}::text as t, ${r.colonne}::text as c, count(*) as n from ${sql.identifier(r.table)} where organization_id = ${organizationId} and ${sql.identifier(r.colonne)}::text = ${id}`,
  );
  const lignes = await tx.execute<{ t: string; c: string; n: string }>(sql.join(morceaux, sql` union all `));
  return lignes.map((l) => ({ table: l.t, colonne: l.c, nombre: Number(l.n) })).filter((r) => r.nombre > 0);
}
