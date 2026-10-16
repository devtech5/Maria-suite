import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs } from "@/db/schema";
import { creerActifPour } from "@/modules/actifs/creation";
import { actifs } from "@/modules/actifs/schema";
import { creerFourniturePour, derniersMouvements, enregistrerMouvementPour, listerFournitures } from "@/modules/moyens-generaux/creation";
import { creerSalariePour } from "@/modules/personnes/creation";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

describe("moyens généraux en base", () => {
  it("fournitures : entrées, remises, stock tiré des mouvements, sortie refusée au-delà", async () => {
    const { id: papier } = await creerFourniturePour(org, user, { designation: "Ramette papier A4", unite: "ramette", seuil: 10 });
    const { id: salarie } = await creerSalariePour(org, { nom: "Fatou Bamba", poste: "Comptable", debut: "2025-01-02", salaireBase: 0 }, user);

    await enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "entree", quantite: 20, date: "2026-10-01", cout: 60_000 });
    await enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "sortie", quantite: 12, date: "2026-10-05", employeId: salarie, service: "Comptabilité" });

    const [fiche] = await listerFournitures(org);
    expect(fiche).toMatchObject({ designation: "Ramette papier A4", stock: 8, etat: "a_racheter", coutMoyen: 3000 });

    // Il en reste 8 : en sortir 9 est refusé, et rien n'est écrit.
    await expect(
      enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "sortie", quantite: 9, date: "2026-10-06", service: "Accueil" }),
    ).rejects.toThrow(/n'en reste que 8 ramette/);
    expect((await listerFournitures(org))[0].stock).toBe(8);

    // Un coût sur une sortie est ignoré ; la base refuserait de toute façon de le garder.
    await enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "sortie", quantite: 8, date: "2026-10-07", service: "Accueil", cout: 999 });
    expect((await listerFournitures(org))[0]).toMatchObject({ stock: 0, etat: "rupture" });

    const mouvements = await derniersMouvements(org);
    expect(mouvements.map((m) => [m.sens, m.quantite, m.cout])).toEqual([
      ["sortie", 8, null],
      ["sortie", 12, null],
      ["entree", 20, 60_000],
    ]);
    expect(mouvements[1].beneficiaire).toBe("Fatou Bamba");

    const traces = await db.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.organizationId, org), eq(auditLogs.entityType, "fourniture")));
    expect(traces.map((t) => t.action).sort()).toEqual(["fourniture.creer", "fourniture.entree", "fourniture.sortie", "fourniture.sortie"]);
  });

  it("une fourniture d'une autre entreprise est hors d'atteinte ; une désignation ne se double pas", async () => {
    const autre = await semerEntreprise(db, "Voisine");
    const { id } = await creerFourniturePour(autre.organizationId, autre.userId, { designation: "Stylos" });
    await expect(enregistrerMouvementPour(org, user, { fournitureId: id, sens: "entree", quantite: 1, date: "2026-10-01" })).rejects.toThrow(/introuvable/);
    await expect(creerFourniturePour(org, user, { designation: "Ramette papier A4" })).rejects.toThrow();
  });

  it("un local est un actif de type local, codé LOC-", async () => {
    const { code } = await creerActifPour(org, { designation: "Bureaux — 2e étage", type: "local", site: "Cocody" }, user);
    expect(code).toBe("LOC-001");
    const [ligne] = await db.select().from(actifs).where(and(eq(actifs.organizationId, org), eq(actifs.code, code)));
    expect(ligne.type).toBe("local");
  });
});
