import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { enregistrerCommercialDans } from "@/modules/commerciaux/creation";
import { listerCommerciaux } from "@/modules/commerciaux/requetes";
import { commerciaux } from "@/modules/commerciaux/schema";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

const regle = { base: "ca_ht" as const, tauxBp: 300, fixeMensuel: 0, objectifMensuel: 0 };

async function compte(nom: string, phone: string | null = null): Promise<string> {
  const id = newId();
  await db.insert(users).values({ id, fullName: nom, email: `${id}@exemple.test`, phone });
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId: org, key: `r-${roleId}`, name: "Vente" });
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId: id, roleId, status: "actif" });
  return id;
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

describe("identité d'un commercial", () => {
  it("lié à un salarié : nom et téléphone viennent du Personnel, la saisie est ignorée", async () => {
    const { id: awa } = await creerSalariePour(org, { nom: "Awa Koné", poste: "Commerciale", debut: "2026-01-05", salaireBase: 150_000, telephone: "0707070707" }, user);
    const { id, nom } = await db.transaction((tx) =>
      enregistrerCommercialDans(tx, org, null, { ...regle, nom: "Awa K.", telephone: "0101", employeeId: awa }, user),
    );
    expect(nom).toBe("Awa Koné");
    const [ligne] = await db.select().from(commerciaux).where(eq(commerciaux.id, id));
    expect(ligne).toMatchObject({ nom: "Awa Koné", telephone: "0707070707", employeeId: awa });

    // Renommée au Personnel, elle l'est aussi chez les commerciaux.
    await db.update(employees).set({ nom: "Awa Koné-Traoré", telephone: "0505050505" }).where(eq(employees.id, awa));
    const liste = await listerCommerciaux(org);
    expect(liste.find((c) => c.id === id)).toMatchObject({ nom: "Awa Koné-Traoré", telephone: "0505050505" });
  });

  it("lié à un compte seul : nom et téléphone du compte", async () => {
    const caissier = await compte("Yao Caissier", "+2250102030405");
    const { nom } = await db.transaction((tx) => enregistrerCommercialDans(tx, org, null, { ...regle, userId: caissier }, user));
    expect(nom).toBe("Yao Caissier");
    const liste = await listerCommerciaux(org);
    expect(liste.find((c) => c.userId === caissier)).toMatchObject({ nom: "Yao Caissier", telephone: "+2250102030405" });
  });

  it("apporteur externe : nom saisi, exigé", async () => {
    const { nom } = await db.transaction((tx) => enregistrerCommercialDans(tx, org, null, { ...regle, nom: " Bamba Apporteur ", telephone: "0909" }, user));
    expect(nom).toBe("Bamba Apporteur");
    await expect(db.transaction((tx) => enregistrerCommercialDans(tx, org, null, { ...regle }, user))).rejects.toThrow(/nom/);
  });

  it("refuse un compte étranger et un salarié déjà commercial", async () => {
    const etranger = newId();
    await db.insert(users).values({ id: etranger, fullName: "Hors entreprise", email: `${etranger}@exemple.test` });
    await expect(db.transaction((tx) => enregistrerCommercialDans(tx, org, null, { ...regle, userId: etranger }, user))).rejects.toThrow(/entreprise/);

    const { id: ina } = await creerSalariePour(org, { nom: "Ouattara Ina", poste: "Vendeuse", debut: "2026-01-05", salaireBase: 90_000 }, user);
    await db.transaction((tx) => enregistrerCommercialDans(tx, org, null, { ...regle, employeeId: ina }, user));
    await expect(db.transaction((tx) => enregistrerCommercialDans(tx, org, null, { ...regle, nom: "Autre", employeeId: ina }, user))).rejects.toThrow();
  });
});
