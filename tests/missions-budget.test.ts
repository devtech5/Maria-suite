import { describe, expect, it } from "vitest";

import { bilanBudget, erreurBudget, erreurEngagement, erreurMontant, manqueAuPaiement, passagePermis } from "@/modules/missions/budget";

/**
 * Budget d'une mission et intervenants. Ce qui compte : on ne confie pas plus
 * que le budget, et un paiement sans décharge n'est pas un paiement.
 */

describe("bilan du budget", () => {
  it("compte le confié hors annulés, le payé, et ce qui reste", () => {
    expect(
      bilanBudget(500_000, [
        { statut: "paye", montantConvenu: 100_000 },
        { statut: "a_payer", montantConvenu: 150_000 },
        { statut: "annule", montantConvenu: 999_000 },
      ]),
    ).toEqual({ budget: 500_000, engage: 250_000, paye: 100_000, aPayer: 150_000, reste: 250_000 });
  });

  it("n'a pas de reste sans budget", () => {
    expect(bilanBudget(null, []).reste).toBeNull();
  });
});

describe("engagement", () => {
  it("exige un budget fixé d'abord", () => {
    expect(erreurEngagement(null, 0, 50_000)).toMatch(/budget/);
  });

  it("refuse un dépassement et dit ce qui reste", () => {
    expect(erreurEngagement(300_000, 250_000, 50_000)).toBeNull();
    expect(erreurEngagement(300_000, 250_000, 60_000)).toMatch(/dépassé de 10.000 F/);
    expect(erreurEngagement(300_000, 250_000, 60_000)).toMatch(/reste 50.000 F/);
  });

  it("refuse un montant nul, fractionnaire ou aberrant", () => {
    expect(erreurMontant(0)).not.toBeNull();
    expect(erreurMontant(1500.5)).not.toBeNull();
    expect(erreurMontant(1_000_000_000)).not.toBeNull();
    expect(erreurMontant(25_000)).toBeNull();
  });

  it("ne laisse pas descendre le budget sous ce qui est confié", () => {
    expect(erreurBudget(250_000, 250_000)).toBeNull();
    expect(erreurBudget(200_000, 250_000)).toMatch(/inférieur/);
    expect(erreurBudget(-5, 0)).not.toBeNull();
  });
});

describe("paiement sur place", () => {
  it("exige qui a reçu et la décharge", () => {
    expect(manqueAuPaiement("Yao Kouassi", true)).toBeNull();
    expect(manqueAuPaiement(" ", true)).toMatch(/reçu/);
    expect(manqueAuPaiement("Yao Kouassi", false)).toMatch(/décharge/);
  });

  it("ne ramène pas un payé ou un annulé en arrière", () => {
    expect(passagePermis("a_payer", "paye")).toBe(true);
    expect(passagePermis("a_payer", "annule")).toBe(true);
    expect(passagePermis("paye", "annule")).toBe(false);
    expect(passagePermis("annule", "paye")).toBe(false);
  });
});
