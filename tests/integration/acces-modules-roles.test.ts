import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { accesModulesRoles, roles } from "@/db/schema";
import { modulesDesactivesParRole } from "@/lib/auth/acces";
import { newId } from "@/lib/ids";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
});
afterAll(async () => fermer());

describe("modules désactivés par rôle", () => {
  it("se lisent par rôle, dans l'entreprise seulement, sans doublon", async () => {
    const { organizationId } = await semerEntreprise(db);
    const autre = await semerEntreprise(db, "Autre");
    const caissier = newId();
    await db.insert(roles).values({ id: caissier, organizationId, key: "caissier", name: "Caissier" });
    await db.insert(accesModulesRoles).values([
      { id: newId(), organizationId, roleId: caissier, moduleKey: "tresorerie" },
      { id: newId(), organizationId, roleId: caissier, moduleKey: "stock" },
    ]);
    await expect(
      db.insert(accesModulesRoles).values({ id: newId(), organizationId, roleId: caissier, moduleKey: "stock" }),
    ).rejects.toThrow();

    const lus = await modulesDesactivesParRole(organizationId);
    expect([...(lus.get(caissier) ?? [])].sort()).toEqual(["stock", "tresorerie"]);
    expect((await modulesDesactivesParRole(autre.organizationId)).size).toBe(0);
  });
});
