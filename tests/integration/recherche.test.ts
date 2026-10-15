import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { lireFiltresListe, motsRecherche } from "@/lib/recherche";
import { creerFourniturePour, derniersMouvements, enregistrerMouvementPour } from "@/modules/moyens-generaux/creation";
import { creerSalariePour } from "@/modules/personnes/creation";
import { rechercherPartout } from "@/modules/recherche/globale";
import { creerTiersPour } from "@/modules/tiers/creation";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let fermer: () => Promise<void>;
let db: typeof Db;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

const tout = () => true;
const chercher = (o: string, q: string, visible: (r: string) => boolean = tout) => rechercherPartout(o, q, motsRecherche(q), visible);

describe("recherche globale en base", () => {
  it("trouve sans accents ni majuscules, tous les mots requis", async () => {
    await creerTiersPour(org, { nom: "Société Ivoirienne de Béton", estClient: true, ville: "Abidjan" }, user);
    await creerSalariePour(org, { nom: "Fatou Bamba", poste: "Comptable", debut: "2025-01-02", salaireBase: 0 }, user);

    const groupes = await chercher(org, "SOCIETE beton");
    expect(groupes.map((g) => g.cle)).toEqual(["clients"]);
    expect(groupes[0].trouvailles[0]).toMatchObject({ titre: "Société Ivoirienne de Béton", detail: expect.stringContaining("Abidjan") });

    const salaries = await chercher(org, "bamba comptable");
    expect(salaries.find((g) => g.cle === "salaries")?.trouvailles[0].titre).toBe("Fatou Bamba");
    expect(await chercher(org, "bamba plombier")).toEqual([]);
  });

  it("un % tapé ne joue pas le joker", async () => {
    expect(await chercher(org, "%")).toEqual([]);
  });

  it("n'interroge pas une source dont l'écran est fermé à la session", async () => {
    const sansClients = await chercher(org, "beton", (r) => r !== "/commercial");
    expect(sansClients).toEqual([]);
  });

  it("ne voit rien d'une autre entreprise", async () => {
    const autre = await semerEntreprise(db, "Voisine");
    expect(await chercher(autre.organizationId, "beton")).toEqual([]);
  });

  it("annonce qu'il y en a d'autres au-delà de cinq", async () => {
    for (let i = 1; i <= 6; i++) await creerTiersPour(org, { nom: `Quincaillerie ${i}`, estClient: true }, user);
    const [clients] = await chercher(org, "quincaillerie");
    expect(clients.trouvailles).toHaveLength(5);
    expect(clients.plus).toBe(true);
    expect(clients.hrefTout).toBe("/commercial?q=quincaillerie");
  });

  it("une liste se filtre en base : mots, accents et période bornes incluses", async () => {
    const { id: papier } = await creerFourniturePour(org, user, { designation: "Ramette papier A4", unite: "ramette" });
    const { id: encre } = await creerFourniturePour(org, user, { designation: "Cartouche d'encre", unite: "cartouche" });
    await enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "entree", quantite: 10, date: "2026-09-30" });
    await enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "sortie", quantite: 2, date: "2026-10-01", service: "Comptabilité" });
    await enregistrerMouvementPour(org, user, { fournitureId: encre, sens: "entree", quantite: 3, date: "2026-10-31" });
    await enregistrerMouvementPour(org, user, { fournitureId: encre, sens: "entree", quantite: 1, date: "2026-11-01" });

    const octobre = await derniersMouvements(org, 50, lireFiltresListe({ du: "2026-10-01", au: "2026-10-31" }));
    expect(octobre.map((m) => m.date).sort()).toEqual(["2026-10-01", "2026-10-31"]);

    const compta = await derniersMouvements(org, 50, lireFiltresListe({ q: "COMPTABILITE ramette" }));
    expect(compta.map((m) => [m.fourniture, m.quantite])).toEqual([["Ramette papier A4", 2]]);
  });
});
