import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Un seul pool PostgreSQL par processus, en production comme en développement.
 *
 * Le 15/10/2026, la production refusait le tableau de bord sur « too many
 * clients already » : hors développement, chaque accès à `db` ouvrait un pool
 * neuf. Ce test compte les pools ouverts ; il ne touche aucune base,
 * postgres-js ne se connectant qu'à la première requête.
 */
const ouvertures = vi.hoisted(() => ({ n: 0 }));
vi.mock("postgres", () => ({
  default: vi.fn(() => {
    ouvertures.n++;
    return Object.assign(() => undefined, { options: { parsers: {}, serializers: {} } });
  }),
}));

const registre = globalThis as { mariaDb?: unknown; mariaConnection?: unknown };

afterEach(() => {
  vi.unstubAllEnvs();
  delete registre.mariaDb;
  delete registre.mariaConnection;
  ouvertures.n = 0;
});

describe("pool de connexions", () => {
  it("n'ouvre qu'un pool en production, quel que soit le nombre d'accès", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://maria:maria@localhost:5432/maria");
    vi.stubEnv("AUTH_SECRET", "x".repeat(32));
    delete registre.mariaDb;
    delete registre.mariaConnection;
    vi.resetModules();

    const { db } = await import("@/db");
    for (let i = 0; i < 20; i++) void db.select;
    expect(ouvertures.n).toBe(1);

    // Un second chargement du module — un autre paquet du serveur — reprend le même pool.
    vi.resetModules();
    const { db: autre } = await import("@/db");
    void autre.select;
    expect(ouvertures.n).toBe(1);
  });
});
