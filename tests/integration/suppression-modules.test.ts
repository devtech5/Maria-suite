import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";

import { ouvrirBaseDeTest } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;

/** Les instructions de la migration 0074, rejouées telles quelles. */
const instructions = readFileSync(resolve("./drizzle/0074_suppression_modules.sql"), "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const existe = async (table: string) =>
  ((await db.execute(sql.raw(`select to_regclass('public.${table}') is not null as existe`))) as unknown as { existe: boolean }[])[0].existe;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
});
afterAll(async () => fermer());

describe("suppression des modules retirés (migration 0074)", () => {
  it("a supprimé les tables vides d'une base neuve", async () => {
    for (const table of ["tables_salle", "sejours_hotel", "ressources", "billets", "sessions_guichet"]) expect(await existe(table), table).toBe(false);
    // Ce qui sert encore reste.
    for (const table of ["ventes", "articles", "mouvements_stock"]) expect(await existe(table), table).toBe(true);
  });

  it("garde un groupe dont une table contient des données, supprime les groupes vides", async () => {
    // Une base où la billetterie a servi, et où le guichet n'a jamais servi.
    // Une instruction par appel : la base de test refuse les requêtes multiples.
    for (const t of ["billets", "departs", "lignes_transport", "sessions_guichet", "floats_session"]) await db.execute(sql.raw(`create table ${t} (id int)`));
    await db.execute(sql.raw(`insert into billets values (1)`));

    for (const instruction of instructions) await db.execute(sql.raw(instruction));

    expect(await existe("billets")).toBe(true);
    expect(await existe("departs")).toBe(true);
    expect(await existe("lignes_transport")).toBe(true);
    expect(((await db.execute(sql.raw(`select count(*)::int as n from billets`))) as unknown as { n: number }[])[0].n).toBe(1);
    expect(await existe("sessions_guichet")).toBe(false);
    expect(await existe("floats_session")).toBe(false);
  });
});
