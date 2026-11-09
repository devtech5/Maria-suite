import { describe, expect, it } from "vitest";

import { montantSaisi } from "@/lib/saisie-montant";

describe("montant saisi au clavier", () => {
  it("lit un entier, séparateurs de milliers ignorés", () => {
    expect(montantSaisi("10000000")).toBe(10_000_000);
    expect(montantSaisi("10 000 000")).toBe(10_000_000);
    expect(montantSaisi("10 000 000")).toBe(10_000_000);
    expect(montantSaisi("1.000.000")).toBe(1_000_000);
  });

  it("rend null pour un champ vide, NaN pour un texte illisible", () => {
    expect(montantSaisi("  ")).toBeNull();
    expect(montantSaisi("dix mille")).toBeNaN();
    expect(montantSaisi("12,5")).toBeNaN();
    expect(montantSaisi("-500")).toBeNaN();
  });
});
