import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { creerSalariePour } from "@/modules/personnes/creation";
import { modifierEtatProfessionnelPour } from "@/modules/personnes/dossier";
import {
  ajouterPostePour,
  basculerPostePour,
  listerPostes,
  postesActifs,
  renommerPostePour,
} from "@/modules/personnes/referentiel-postes";
import { employees } from "@/modules/personnes/schema";

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

const etat = (poste: string) => ({ emailProfessionnel: null, poste, service: null, superieurId: null, finPeriodeEssai: null });

describe("référentiel des postes en base", () => {
  it("ajoute en fin de liste et refuse un doublon, casse et espaces ignorés", async () => {
    await ajouterPostePour(org, user, "Comptable");
    await ajouterPostePour(org, user, "  Chef   de projet ");
    expect(await postesActifs(org)).toEqual(["Comptable", "Chef de projet"]);
    await expect(ajouterPostePour(org, user, "comptable")).rejects.toThrow(/existe déjà/);
  });

  it("renomme le poste et les fiches qui le portent, dans la même transaction", async () => {
    const { id: awa } = await creerSalariePour(org, { nom: "Awa", poste: "Comptable", debut: "2026-01-05", salaireBase: 0 }, user);
    const [comptable] = (await listerPostes(org)).filter((p) => p.libelle === "Comptable");
    expect(comptable.occupants).toBe(1);

    const { fiches } = await renommerPostePour(org, user, comptable.id, "Comptable principal");
    expect(fiches).toBe(1);
    const [ligne] = await db.select({ poste: employees.poste, version: employees.version }).from(employees).where(eq(employees.id, awa));
    expect(ligne).toEqual({ poste: "Comptable principal", version: 2 });

    // Vers un nom déjà pris : refusé, rien ne bouge.
    await expect(renommerPostePour(org, user, comptable.id, "chef de projet")).rejects.toThrow(/existe déjà/);
  });

  it("un poste retiré ne s'attribue plus, mais reste à qui l'occupe", async () => {
    const { id: yao } = await creerSalariePour(org, { nom: "Yao", poste: "Chef de projet", debut: "2026-02-01", salaireBase: 0 }, user);
    const { id: kone } = await creerSalariePour(org, { nom: "Koné", poste: "Comptable principal", debut: "2026-02-01", salaireBase: 0 }, user);
    const chef = (await listerPostes(org)).find((p) => p.libelle === "Chef de projet")!;
    await basculerPostePour(org, user, chef.id, false);
    expect(await postesActifs(org)).toEqual(["Comptable principal"]);

    // Yao garde son poste retiré en modifiant le reste de sa fiche…
    await modifierEtatProfessionnelPour(org, user, yao, etat("Chef de projet"));
    // … mais Koné ne peut pas le recevoir, ni un intitulé hors liste.
    await expect(modifierEtatProfessionnelPour(org, user, kone, etat("Chef de projet"))).rejects.toThrow(/dans la liste/);
    await expect(modifierEtatProfessionnelPour(org, user, kone, etat("Magasinier"))).rejects.toThrow(/dans la liste/);

    // Un poste actif s'enregistre sous le libellé du référentiel.
    await modifierEtatProfessionnelPour(org, user, yao, etat("comptable PRINCIPAL"));
    const [ligne] = await db.select({ poste: employees.poste }).from(employees).where(eq(employees.id, yao));
    expect(ligne.poste).toBe("Comptable principal");

    // Les retirés passent en fin de liste.
    expect((await listerPostes(org)).map((p) => [p.libelle, p.actif, p.occupants])).toEqual([
      ["Comptable principal", true, 3],
      ["Chef de projet", false, 0],
    ]);
  });

  it("n'est lu que dans son entreprise", async () => {
    const autre = await semerEntreprise(db, "Autre");
    expect(await postesActifs(autre.organizationId)).toEqual([]);
    const chef = (await listerPostes(org)).find((p) => p.libelle === "Chef de projet")!;
    await expect(basculerPostePour(autre.organizationId, autre.userId, chef.id, true)).rejects.toThrow(/introuvable/);
  });
});
