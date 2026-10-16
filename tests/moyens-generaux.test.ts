import { describe, expect, it } from "vitest";

import { consommationParService, coutMoyenUnitaire, etatFourniture, refusSortie, stocks } from "@/modules/moyens-generaux/calcul";

describe("fournitures", () => {
  const mouvements = [
    { fournitureId: "papier", sens: "entree" as const, quantite: 50, cout: 150_000 },
    { fournitureId: "papier", sens: "sortie" as const, quantite: 12 },
    { fournitureId: "papier", sens: "entree" as const, quantite: 10, cout: 32_000 },
    { fournitureId: "encre", sens: "entree" as const, quantite: 3, cout: null },
    { fournitureId: "encre", sens: "sortie" as const, quantite: 3 },
  ];

  it("le stock est la somme des mouvements", () => {
    const s = stocks(mouvements);
    expect(s.get("papier")).toBe(48);
    expect(s.get("encre")).toBe(0);
    expect(s.get("agrafes")).toBeUndefined();
  });

  it("alerte en rupture et au seuil", () => {
    expect(etatFourniture(0, 5)).toBe("rupture");
    expect(etatFourniture(5, 5)).toBe("a_racheter");
    expect(etatFourniture(6, 5)).toBe("suffisant");
    expect(etatFourniture(1, 0)).toBe("suffisant");
    expect(etatFourniture(0, 0)).toBe("rupture");
  });

  it("refuse une sortie au-delà du stock", () => {
    expect(refusSortie(48, 48, "ramettes")).toBeNull();
    expect(refusSortie(48, 49, "ramettes")).toBe("Il n'en reste que 48 ramettes : impossible d'en sortir 49.");
    expect(refusSortie(48, 0, "ramettes")).toMatch(/entier positif/);
    expect(refusSortie(48, 1.5, "ramettes")).toMatch(/entier positif/);
  });

  it("coût moyen sur les seules entrées chiffrées, arrondi au franc", () => {
    // (150 000 + 32 000) / 60 = 3 033,33…
    expect(coutMoyenUnitaire(mouvements.filter((m) => m.fournitureId === "papier"))).toBe(3033);
    expect(coutMoyenUnitaire(mouvements.filter((m) => m.fournitureId === "encre"))).toBeNull();
  });

  it("consommation par service, le salarié à défaut", () => {
    expect(
      consommationParService([
        { quantite: 5, service: "Comptabilité", beneficiaire: "Fatou" },
        { quantite: 2, service: null, beneficiaire: "Yao" },
        { quantite: 4, service: " Comptabilité ", beneficiaire: null },
        { quantite: 1, service: null, beneficiaire: null },
      ]),
    ).toEqual([
      { service: "Comptabilité", quantite: 9 },
      { service: "Yao", quantite: 2 },
      { service: "Non précisé", quantite: 1 },
    ]);
  });
});
