import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { creerLicencePour } from "@/modules/parc-informatique/creation";
import { fournisseursProposes, listerLicences } from "@/modules/parc-informatique/requetes";
import { licencesLogicielles } from "@/modules/parc-informatique/schema";
import { creerTiersDans } from "@/modules/tiers/creation";
import { tiers } from "@/modules/tiers/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;
let revendeur: string;
let client: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ id: revendeur } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Inova Informatique", estClient: false, estFournisseur: true }, user)));
  ({ id: client } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Sotra", estClient: true }, user)));
});
afterAll(async () => fermer());

describe("fournisseur d'une licence", () => {
  it("se choisit parmi les fournisseurs ; le nom vient de la fiche", async () => {
    const proposes = await fournisseursProposes(org);
    expect(proposes).toEqual([{ id: revendeur, nom: "Inova Informatique" }]);

    const id = await creerLicencePour(org, user, {
      logiciel: "Microsoft 365",
      type: "abonnement",
      postes: 5,
      expireLe: "2027-01-31",
      fournisseurId: revendeur,
      fournisseur: "ignoré",
    });
    const [ligne] = await db.select().from(licencesLogicielles).where(eq(licencesLogicielles.id, id));
    expect(ligne).toMatchObject({ fournisseurId: revendeur, fournisseur: "Inova Informatique" });

    // La fiche renommée se lit à jour.
    await db.update(tiers).set({ nom: "Inova Informatique SARL" }).where(eq(tiers.id, revendeur));
    const licences = await listerLicences(org);
    expect(licences.find((l) => l.id === id)?.fournisseurNom).toBe("Inova Informatique SARL");
  });

  it("garde le nom saisi sans fiche", async () => {
    const id = await creerLicencePour(org, user, { logiciel: "Kaspersky", type: "perpetuelle", postes: 3, fournisseur: "Boutique en ligne" });
    const licences = await listerLicences(org);
    expect(licences.find((l) => l.id === id)).toMatchObject({ fournisseurId: null, fournisseurNom: "Boutique en ligne" });
  });

  it("refuse un tiers qui n'est pas fournisseur", async () => {
    await expect(
      creerLicencePour(org, user, { logiciel: "Sage 100", type: "perpetuelle", postes: 1, fournisseurId: client }),
    ).rejects.toThrow(/fournisseur/);
  });
});
