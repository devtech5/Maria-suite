import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs, reglagesCalculs } from "@/db/schema";
import { enregistrerReglagesCalculsPour, reglagesCalculsDe } from "@/modules/calculs/donnees";
import { REGLAGES_DEFAUT } from "@/modules/calculs/regles";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let autreOrg: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ organizationId: autreOrg } = await semerEntreprise(db, "Autre entreprise"));
});
afterAll(async () => fermer());

describe("ratios des calculs sur une vraie base", () => {
  it("rend les valeurs de départ, à vérifier, tant que rien n'est enregistré", async () => {
    const r = await reglagesCalculsDe(org);
    expect(r.valeurs).toEqual(REGLAGES_DEFAUT);
    expect(r.verifie).toBe(false);
    expect(r.personnalises).toBe(false);
  });

  it("enregistre, atteste, puis repasse à vérifier sans attestation", async () => {
    const valeurs = { ...REGLAGES_DEFAUT, sacCimentKg: 25 };
    await enregistrerReglagesCalculsPour(org, user, valeurs, true);
    let lignes = await db.select().from(reglagesCalculs).where(eq(reglagesCalculs.organizationId, org));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].verifieParUserId).toBe(user);
    expect(lignes[0].version).toBe(1);

    await enregistrerReglagesCalculsPour(org, user, { ...valeurs, pertesBetonPct: 8 }, false);
    lignes = await db.select().from(reglagesCalculs).where(eq(reglagesCalculs.organizationId, org));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].verifieLe).toBeNull();
    expect(lignes[0].version).toBe(2);

    const journal = await db.select().from(auditLogs).where(and(eq(auditLogs.organizationId, org), eq(auditLogs.action, "calculs.reglages")));
    expect(journal).toHaveLength(2);
  });

  it("isole les entreprises", async () => {
    // `cache` de React ne s'applique pas hors rendu : chaque appel relit la base.
    expect((await reglagesCalculsDe(org)).valeurs.sacCimentKg).toBe(25);
    expect((await reglagesCalculsDe(autreOrg)).valeurs).toEqual(REGLAGES_DEFAUT);
  });
});
