import { describe, expect, it } from "vitest";

import {
  dureeEnMois,
  libelleDuree,
  nomComplet,
  sexeDeCivilite,
  termeApresDuree,
} from "@/modules/personnes/calcul";

describe("durée d'un contrat à durée déterminée", () => {
  it("déduit le terme de la durée en mois, veille du même quantième", () => {
    expect(termeApresDuree("2026-01-05", 12)).toBe("2027-01-04");
    expect(termeApresDuree("2026-03-01", 6)).toBe("2026-08-31");
    // Pas de 31 avril : le contrat court jusqu'au dernier jour du mois.
    expect(termeApresDuree("2026-01-31", 3)).toBe("2026-04-30");
  });

  it("refuse une durée nulle, fractionnaire ou démesurée", () => {
    expect(() => termeApresDuree("2026-01-05", 0)).toThrow(/1 à 60 mois/);
    expect(() => termeApresDuree("2026-01-05", 1.5)).toThrow(/1 à 60 mois/);
    expect(() => termeApresDuree("2026-01-05", 61)).toThrow(/1 à 60 mois/);
  });

  it("retrouve la durée depuis le terme, ou rien s'il a été saisi à la main", () => {
    expect(dureeEnMois("2026-01-05", "2027-01-04")).toBe(12);
    expect(dureeEnMois("2026-01-05", termeApresDuree("2026-01-05", 7))).toBe(7);
    expect(dureeEnMois("2026-01-05", "2026-02-20")).toBeNull();
  });

  it("se lit en mois, en années, ou en jours hors mois entiers", () => {
    expect(libelleDuree("2026-01-05", "2026-07-04")).toBe("6 mois");
    expect(libelleDuree("2026-01-05", "2027-01-04")).toBe("1 an");
    expect(libelleDuree("2026-01-05", "2028-01-04")).toBe("2 ans");
    expect(libelleDuree("2026-01-05", "2026-01-20")).toBe("16 jours");
    expect(libelleDuree("2026-01-05", "2026-01-05")).toBe("1 jour");
  });
});

describe("identité à l'embauche", () => {
  it("écrit le nom puis les prénoms, espaces superflus retirés", () => {
    expect(nomComplet("KOUASSI", " Yao   Bernard ")).toBe("KOUASSI Yao Bernard");
    expect(nomComplet(" Traoré ", "")).toBe("Traoré");
    expect(nomComplet("Koné", null)).toBe("Koné");
  });

  it("déduit le sexe de la civilité", () => {
    expect(sexeDeCivilite("M")).toBe("M");
    expect(sexeDeCivilite("Mme")).toBe("F");
    expect(sexeDeCivilite("Mlle")).toBe("F");
    expect(sexeDeCivilite("")).toBeNull();
  });
});

describe("photo portrait", () => {
  it("recadre au format 3 × 4, visage en haut du cadre", async () => {
    const { cadrePortrait } = await import("@/components/personnes/photo");
    // Paysage 4000 × 3000 : rogné sur les côtés, centré.
    expect(cadrePortrait(4000, 3000)).toEqual({ x: 875, y: 0, l: 2250, h: 3000 });
    // Portrait très haut 1000 × 2000 : rogné surtout en bas.
    expect(cadrePortrait(1000, 2000)).toEqual({ x: 0, y: 167, l: 1000, h: 1333 });
    // Déjà au format : intact.
    expect(cadrePortrait(300, 400)).toEqual({ x: 0, y: 0, l: 300, h: 400 });
  });
});
