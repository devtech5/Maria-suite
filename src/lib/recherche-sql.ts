import { and, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { motifLike, type Periode } from "./recherche";

/*
 * Accents retirés côté base comme `normaliser` les retire côté application.
 * `translate` avant `lower` : sous une collation C (PGlite), `lower` ne
 * connaît que l'ASCII et laisserait « É » tel quel.
 */
const ACCENTS = "ÀÁÂÄÃÅÇÈÉÊËÌÍÎÏÑÒÓÔÖÕÙÚÛÜÝàáâäãåçèéêëìíîïñòóôöõùúûüýÿ";
const SANS_ACCENTS = "AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy";

/**
 * Condition SQL : chaque mot cherché figure dans l'une des colonnes.
 * `undefined` sans mot, pour se poser tel quel dans un `and(...)`.
 */
export function motsDans(colonnes: (AnyColumn | SQL)[], mots: string[]): SQL | undefined {
  if (mots.length === 0) return undefined;
  const texte = sql`lower(translate(concat_ws(' ', ${sql.join(colonnes, sql`, `)}), ${ACCENTS}, ${SANS_ACCENTS}))`;
  return and(...mots.map((mot) => sql`${texte} like ${motifLike(mot)}`));
}

/**
 * Condition SQL : la colonne tombe dans la période, bornes incluses.
 *
 * Marche pour une colonne `date` comme pour un horodatage : la borne haute
 * est le lendemain exclu, pour qu'un événement du 31 à 23 h compte dans « au 31 ».
 * Les jours se lisent dans le fuseau de la session PostgreSQL (UTC, celui
 * d'Abidjan).
 */
export function dansPeriodeSql(colonne: AnyColumn | SQL, periode: Periode): SQL | undefined {
  return and(
    periode.du ? sql`${colonne} >= ${periode.du}::date` : undefined,
    periode.au ? sql`${colonne} < ${periode.au}::date + 1` : undefined,
  );
}
