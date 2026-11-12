import { describe, expect, it } from "vitest";

import { resoudreDroits } from "@/lib/droits/catalogue";
import { GROUPES_MODULES } from "@/lib/navigation";
import { bilanPerdiem, erreurJours, erreurMontant, formatNumero, montantAttribution, passagePermis } from "@/modules/perdiem/regles";

/**
 * Perdiem. Ce qui compte : un montant juste en francs entiers, un perdiem
 * payé qui ne revient pas en arrière, et le barème réservé à la comptable.
 */

describe("montant d'un perdiem", () => {
  it("multiplie des jours entiers par un montant du jour entier", () => {
    expect(montantAttribution(5, 15_000)).toBe(75_000);
    expect(montantAttribution(1, 25_000)).toBe(25_000);
  });

  it("refuse des jours à zéro, fractionnaires ou démesurés", () => {
    expect(erreurJours(3)).toBeNull();
    expect(erreurJours(0)).not.toBeNull();
    expect(erreurJours(1.5)).not.toBeNull();
    expect(erreurJours(367)).toMatch(/366/);
  });

  it("refuse un montant du jour nul, fractionnaire ou aberrant", () => {
    expect(erreurMontant(15_000)).toBeNull();
    expect(erreurMontant(0)).not.toBeNull();
    expect(erreurMontant(-5)).not.toBeNull();
    expect(erreurMontant(1000.5)).not.toBeNull();
    expect(erreurMontant(50_000_000)).not.toBeNull();
  });

  it("numérote PD-AAAA-NNNNN", () => {
    expect(formatNumero(2026)).toMatchObject({ prefix: "PD-2026-", padding: 5, cle: "perdiem" });
  });
});

describe("vie d'un perdiem", () => {
  it("se paie ou s'annule tant qu'il est à payer, puis ne bouge plus", () => {
    expect(passagePermis("a_payer", "paye")).toBe(true);
    expect(passagePermis("a_payer", "annule")).toBe(true);
    expect(passagePermis("paye", "annule")).toBe(false);
    expect(passagePermis("paye", "a_payer")).toBe(false);
    expect(passagePermis("annule", "paye")).toBe(false);
  });

  it("fait le bilan sans compter les annulés", () => {
    expect(
      bilanPerdiem([
        { statut: "a_payer", montantTotal: 75_000 },
        { statut: "a_payer", montantTotal: 30_000 },
        { statut: "paye", montantTotal: 50_000 },
        { statut: "annule", montantTotal: 999_000 },
      ]),
    ).toEqual({ aPayer: 105_000, paye: 50_000, nombreAPayer: 2 });
  });
});

describe("droits", () => {
  it("laisse la comptable tenir le barème, pas le magasinier ni la secrétaire", () => {
    expect(resoudreDroits({ cleRole: "comptable", estProprietaire: false }).has("perdiem.gerer")).toBe(true);
    expect(resoudreDroits({ cleRole: "comptable", estProprietaire: false }).has("perdiem.consulter")).toBe(true);
    expect(resoudreDroits({ cleRole: "magasinier", estProprietaire: false }).has("perdiem.gerer")).toBe(false);
    expect(resoudreDroits({ cleRole: "secretaire", estProprietaire: false }).has("perdiem.gerer")).toBe(false);
    expect(resoudreDroits({ cleRole: "gerant", estProprietaire: false }).has("perdiem.gerer")).toBe(true);
  });

  it("a son entrée de menu, sous Finance", () => {
    const finance = GROUPES_MODULES.find((g) => g.cle === "finance")!;
    expect(finance.modules.find((m) => m.href === "/perdiem")?.droit).toBe("perdiem.consulter");
  });
});
