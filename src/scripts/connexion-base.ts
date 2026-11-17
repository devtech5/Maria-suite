import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import type { Requete } from "../db/installation";

/**
 * Ouvre la base d'un script d'exploitation : PGlite (`pglite:…`) en local,
 * PostgreSQL sinon, sur une seule connexion. SQL brut, sans Drizzle : `tsx`
 * ne résout pas les alias de chemins, et un script d'exploitation n'a pas à
 * dépendre de la couche applicative.
 */
export async function ouvrirBase(chaine: string): Promise<{ requete: Requete; fermer(): Promise<void>; dossierPglite?: string }> {
  if (chaine.startsWith("pglite:")) {
    const dossier = resolve(chaine.slice("pglite:".length) || "./.pglite");
    mkdirSync(dossier, { recursive: true });
    // Import différé : l'image de production n'embarque pas PGlite, et le
    // script y tourne sur PostgreSQL.
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite(dossier);
    await client.waitReady;
    // Les tables viennent des migrations, appliquées au démarrage du serveur.
    const [{ existe }] = (await client.query<{ existe: boolean }>("select to_regclass('public.users') is not null as existe")).rows;
    if (!existe) {
      await client.close();
      throw new Error("Base PGlite vide : lancer `pnpm dev:local` une fois pour appliquer les migrations.");
    }
    return {
      dossierPglite: dossier,
      requete: async (texte, valeurs) => (await client.query<Record<string, string>>(texte, valeurs)).rows,
      fermer: () => client.close(),
    };
  }

  const sql = postgres(chaine, { max: 1, connect_timeout: 15 });
  return {
    requete: (texte, valeurs) => sql.unsafe<Record<string, string>[]>(texte, (valeurs ?? []) as never[]),
    fermer: () => sql.end(),
  };
}

/** La base visée : PGlite d'abord (jamais la base distante par mégarde), puis la connexion directe. */
export function urlBase(): string | undefined {
  return process.env.DATABASE_URL?.startsWith("pglite:") ? process.env.DATABASE_URL : process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL;
}
