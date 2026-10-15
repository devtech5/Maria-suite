import { describe, expect, it } from "vitest";

import { anciennete, formeUneBoucle, libelleAnciennete } from "@/modules/personnes/calcul";

describe("anciennete", () => {
  it("compte les mois révolus au quantième d'entrée", () => {
    expect(anciennete("2024-03-15", "2026-06-14")).toEqual({ annees: 2, mois: 2 });
    expect(anciennete("2024-03-15", "2026-06-15")).toEqual({ annees: 2, mois: 3 });
  });

  it("révolu le dernier jour d'un mois plus court", () => {
    expect(anciennete("2026-01-31", "2026-02-28")).toEqual({ annees: 0, mois: 1 });
    expect(anciennete("2026-01-31", "2026-02-27")).toEqual({ annees: 0, mois: 0 });
  });

  it("nulle avant l'entrée", () => {
    expect(anciennete("2026-11-01", "2026-10-15")).toBeNull();
  });

  it("se lit en toutes lettres", () => {
    expect(libelleAnciennete({ annees: 2, mois: 3 })).toBe("2 ans et 3 mois");
    expect(libelleAnciennete({ annees: 1, mois: 0 })).toBe("1 an");
    expect(libelleAnciennete({ annees: 0, mois: 5 })).toBe("5 mois");
    expect(libelleAnciennete({ annees: 0, mois: 0 })).toBe("Moins d'un mois");
    expect(libelleAnciennete(null)).toBe("Entrée à venir");
  });
});

describe("formeUneBoucle", () => {
  // a ← b ← c : a dirige b, b dirige c.
  const chaine = new Map<string, string | null>([["a", null], ["b", "a"], ["c", "b"]]);

  it("refuse d'être son propre supérieur", () => {
    expect(formeUneBoucle("a", "a", chaine)).toBe(true);
  });

  it("refuse de placer un subordonné au-dessus de son chef", () => {
    expect(formeUneBoucle("a", "c", chaine)).toBe(true);
  });

  it("accepte une chaîne qui monte sans revenir", () => {
    expect(formeUneBoucle("c", "a", chaine)).toBe(false);
    expect(formeUneBoucle("d", "c", chaine)).toBe(false);
    expect(formeUneBoucle("a", null, chaine)).toBe(false);
  });

  it("ne tourne pas sans fin sur une chaîne déjà bouclée", () => {
    const bouclee = new Map<string, string | null>([["x", "y"], ["y", "x"]]);
    expect(formeUneBoucle("z", "x", bouclee)).toBe(true);
  });
});
