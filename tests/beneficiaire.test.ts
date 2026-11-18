import { describe, expect, it } from "vitest";

import { estNomComplet } from "@/modules/tresorerie/beneficiaire";

describe("nom complet du bénéficiaire", () => {
  it("accepte nom et prénom, accents et traits d'union compris", () => {
    expect(estNomComplet("Kouassi Aya")).toBe(true);
    expect(estNomComplet("  N'Guessan  Marie-Ève ")).toBe(true);
  });

  it("refuse un mot seul, des chiffres ou rien", () => {
    expect(estNomComplet("Aya")).toBe(false);
    expect(estNomComplet("Aya 12")).toBe(false);
    expect(estNomComplet("")).toBe(false);
    expect(estNomComplet(null)).toBe(false);
  });
});
