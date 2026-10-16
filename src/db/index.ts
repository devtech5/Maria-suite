import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Un seul pool par processus, en développement COMME en production.
 *
 * En développement, Next recharge les modules à chaque modification. En
 * production, le serveur charge ce module plusieurs fois — un paquet pour le
 * rendu des pages, un autre pour les routes d'API — qui ne partagent pas leurs
 * variables de module. Seul `globalThis` est commun.
 *
 * Ce cache était réservé au développement. En production, chaque accès à `db`
 * ouvrait alors un pool neuf : les vingt requêtes parallèles du tableau de
 * bord ouvraient chacune le leur, gardé vingt secondes, et PostgreSQL refusait
 * la suite (« too many clients already », 15/10/2026).
 */
const globalForDb = globalThis as unknown as {
  mariaConnection?: ReturnType<typeof postgres>;
  mariaDb?: Database;
};

/**
 * Un pooler en mode transaction — Supavisor sur le port 6543, ou PgBouncer —
 * rend la connexion au pool après chaque requête. Les requêtes préparées, qui
 * survivent à la session, ne peuvent donc pas être réutilisées : les désactiver
 * évite un « prepared statement already exists » intermittent, qui n'apparaît
 * que sous charge.
 */
function derrierePoolerTransaction(url: string): boolean {
  return url.includes(":6543") || /pgbouncer=true/i.test(url);
}

/**
 * Une fonction sans serveur traite une requête à la fois : un pool d'une seule
 * connexion y est le bon réglage, et vingt connexions par instance épuiseraient
 * le quota en quelques minutes de trafic.
 *
 * Un processus Node durable — `next dev`, ou un serveur sur VPS — sert au
 * contraire toutes les requêtes en parallèle. Un pool d'une connexion y
 * sérialise l'application entière : une requête lente bloque toutes les autres.
 */
const SANS_SERVEUR = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

function resolveDb(): Database {
  if (globalForDb.mariaDb) return globalForDb.mariaDb;

  // Base locale PGlite : ouverte au démarrage par `instrumentation.ts`, qui
  // dépose l'instance ci-dessus. L'atteindre ici veut dire que le démarrage
  // n'a pas eu lieu ou a échoué — le dire plutôt que de tenter un réseau.
  if (env.DATABASE_URL.startsWith("pglite:")) {
    throw new Error(
      "Base locale PGlite non ouverte : voir le journal de démarrage du serveur.",
    );
  }

  const pooler = derrierePoolerTransaction(env.DATABASE_URL);

  const connection =
    globalForDb.mariaConnection ??
    postgres(env.DATABASE_URL, {
      max: SANS_SERVEUR ? 1 : 10,
      prepare: !pooler,

      /**
       * Les trois délais ci-dessous ne sont pas du réglage fin : sans eux, une
       * connexion que le pooler a fermée de son côté reste dans le pool, et la
       * requête suivante attend dessus sans jamais aboutir ni échouer. Observé
       * en conditions réelles — Next répondait en 5 ms, le code applicatif
       * bloquait quarante secondes et ne se libérait qu'à l'abandon du client.
       */
      idle_timeout: 20,
      connect_timeout: 15,
      max_lifetime: 60 * 30,

      transform: { undefined: null },
    });

  const instance = drizzle(connection, { schema });

  globalForDb.mariaConnection = connection;
  globalForDb.mariaDb = instance;

  return instance;
}

/**
 * La connexion n'est créée qu'au premier accès, jamais au chargement du
 * module : `next build` importe ce fichier pour collecter les routes, à un
 * moment où DATABASE_URL peut ne pas être disponible.
 */
export const db = new Proxy({} as Database, {
  get: (_target, key: string | symbol) => {
    const instance = resolveDb();
    const value = instance[key as keyof Database];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
