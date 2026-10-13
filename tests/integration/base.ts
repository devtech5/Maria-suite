import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { db as Db } from "@/db";
import { adapter } from "@/db/pglite";
import * as schema from "@/db/schema";
import { newId } from "@/lib/ids";

/**
 * Ouvre un PostgreSQL en mémoire, applique toutes les migrations et l'installe
 * comme base de l'application : `import { db } from "@/db"` le retrouve.
 */
export async function ouvrirBaseDeTest() {
  const client = new PGlite();
  await client.waitReady;
  const instance = drizzle(client, { schema });
  await migrate(instance, { migrationsFolder: resolve("./drizzle") });
  const db = adapter(instance) as unknown as typeof Db;
  (globalThis as { mariaDb?: unknown }).mariaDb = db;
  return { db, fermer: () => client.close() };
}

/** Une entreprise et son exploitant, prêts à écrire. */
export async function semerEntreprise(db: typeof Db, nom = "Entreprise d'essai") {
  const organizationId = newId();
  const userId = newId();
  await db.insert(schema.organizations).values({ id: organizationId, name: nom, slug: `essai-${organizationId}` });
  await db.insert(schema.users).values({ id: userId, fullName: "Exploitant", email: `${userId}@exemple.test` });
  return { organizationId, userId };
}
