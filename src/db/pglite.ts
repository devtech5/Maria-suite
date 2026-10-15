import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";
const globalPglite = globalThis as unknown as {
  mariaPglite?: Promise<unknown>;
};

/**
 * Ouvre la base, applique les migrations et recopie le catalogue des droits.
 *
 * Appelée une fois, au démarrage du serveur (`instrumentation.ts`), avant la
 * première requête. Rend l'instance Drizzle, que `src/db/index.ts` reprend.
 */
export function ouvrirPglite(url: string): Promise<unknown> {
  globalPglite.mariaPglite ??= (async () => {
    const dossier = resolve(/*turbopackIgnore: true*/ url.slice("pglite:".length) || "./.pglite");
    mkdirSync(dossier, { recursive: true });

    const client = new PGlite(dossier);
    await client.waitReady;

    const instance = drizzle(client, { schema });
    await migrate(instance, { migrationsFolder: resolve(/*turbopackIgnore: true*/ "./drizzle") });

    const { synchroniserDroits } = await import("./droits");
    await synchroniserDroits((texte, valeurs) => client.query(texte, valeurs));

    console.info(`\n  Base locale PGlite prête : ${dossier}\n`);

    return adapter(instance);
  })();

  return globalPglite.mariaPglite;
}

/**
 * Aligne `execute` sur postgres-js.
 *
 * Avec postgres-js, `db.execute(sql)` rend directement le tableau de lignes ;
 * PGlite rend `{ rows, fields, … }`. Tout le code applicatif lit un tableau —
 * l'adaptateur évite d'y semer des conditions sur le pilote.
 */
export function adapter<T extends object>(instance: T): T {
  return new Proxy(instance, {
    get(cible, cle, recepteur) {
      const valeur = Reflect.get(cible, cle, recepteur);

      if (cle === "execute" && typeof valeur === "function") {
        return async (...args: unknown[]) => {
          const resultat = await valeur.apply(cible, args);
          return (resultat as { rows: unknown[] }).rows;
        };
      }

      if (cle === "transaction" && typeof valeur === "function") {
        return (rappel: (tx: unknown) => unknown, ...reste: unknown[]) =>
          valeur.call(
            cible,
            (tx: object) => rappel(adapter(tx)),
            ...reste,
          );
      }

      return typeof valeur === "function" ? valeur.bind(cible) : valeur;
    },
  });
}
