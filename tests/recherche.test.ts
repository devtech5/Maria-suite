import { describe, expect, it } from "vitest";

import { correspond, dansPeriode, dateValide, lireFiltresListe, lirePeriode, motifLike, motsRecherche, normaliser } from "@/lib/recherche";

describe("recherche", () => {
  it("normalise : minuscules, sans accents, mots dédoublonnés, six au plus", () => {
    expect(normaliser("  Éléphant BÉBÉ ")).toBe("elephant bebe");
    expect(motsRecherche("Kouamé  kouame Yao")).toEqual(["kouame", "yao"]);
    expect(motsRecherche("a b c d e f g h")).toHaveLength(6);
    expect(motsRecherche("   ")).toEqual([]);
    expect(motsRecherche(null)).toEqual([]);
  });

  it("tous les mots doivent figurer, dans n'importe quel champ", () => {
    expect(correspond("bamba compta", ["Fatou Bamba", "Comptabilité"])).toBe(true);
    expect(correspond("bamba paie", ["Fatou Bamba", "Comptabilité"])).toBe(false);
    expect(correspond("", ["n'importe quoi"])).toBe(true);
  });

  it("un % ou un _ tapé se cherche tel quel", () => {
    expect(motifLike("18%")).toBe("%18\\%%");
    expect(motifLike("a_b")).toBe("%a\\_b%");
    expect(motifLike("c:\\x")).toBe("%c:\\\\x%");
  });

  it("une date doit exister ; des bornes inversées se remettent dans l'ordre", () => {
    expect(dateValide("2026-02-28")).toBe("2026-02-28");
    expect(dateValide("2026-02-30")).toBeNull();
    expect(dateValide("28/02/2026")).toBeNull();
    expect(lirePeriode("2026-10-31", "2026-10-01")).toEqual({ du: "2026-10-01", au: "2026-10-31" });
    expect(lirePeriode("2026-10-01", "n'importe")).toEqual({ du: "2026-10-01", au: null });
  });

  it("la période inclut ses bornes ; une fiche sans date n'y entre pas", () => {
    const octobre = { du: "2026-10-01", au: "2026-10-31" };
    expect(dansPeriode("2026-10-01", octobre)).toBe(true);
    expect(dansPeriode("2026-10-31", octobre)).toBe(true);
    expect(dansPeriode(new Date("2026-10-31T23:30:00Z"), octobre)).toBe(true);
    expect(dansPeriode("2026-11-01", octobre)).toBe(false);
    expect(dansPeriode(null, octobre)).toBe(false);
    expect(dansPeriode(null, { du: null, au: null })).toBe(true);
    expect(dansPeriode("2026-09-15", { du: null, au: "2026-09-30" })).toBe(true);
  });
});

describe("filtres d'une liste", () => {
  it("lit q, du et au ; ignore ce qui est mal formé", () => {
    expect(lireFiltresListe({ q: "  ciment ", du: "2026-10-01", au: "2026-10-31" })).toEqual({
      q: "ciment",
      periode: { du: "2026-10-01", au: "2026-10-31" },
      actif: true,
    });
    expect(lireFiltresListe({ q: ["a", "b"], du: "hier" })).toEqual({ q: "", periode: { du: null, au: null }, actif: false });
    expect(lireFiltresListe({ au: "2026-12-31" }).actif).toBe(true);
  });
});
