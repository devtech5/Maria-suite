import { describe, expect, it } from "vitest";

import { finEssai, formaterMatricule, lienUrgenceConnu, lireMatricule } from "@/modules/personnes/calcul";

describe("matricule du personnel", () => {
  it("porte l'année et le mois d'entrée, puis le rang sur trois chiffres", () => {
    expect(formaterMatricule("2026-01-05", 7)).toBe("MG-2601-007");
    expect(formaterMatricule("2025-12-31", 42)).toBe("MG-2512-042");
  });

  it("allonge le rang au-delà de 999 sans le tronquer", () => {
    expect(formaterMatricule("2030-06-01", 1234)).toBe("MG-3006-1234");
  });

  it("refuse une date ou un rang illisible", () => {
    expect(() => formaterMatricule("05/01/2026", 1)).toThrow();
    expect(() => formaterMatricule("2026-01-05", 0)).toThrow();
    expect(() => formaterMatricule("2026-01-05", 1.5)).toThrow();
  });

  it("se relit : entrée et rang", () => {
    expect(lireMatricule("MG-2601-007")).toEqual({ annee: 2026, mois: 1, rang: 7 });
    expect(lireMatricule("MG-3006-1234")).toEqual({ annee: 2030, mois: 6, rang: 1234 });
    expect(lireMatricule("S0001")).toBeNull();
    expect(lireMatricule("MG-2613-001")).toBeNull();
  });
});

describe("période d'essai de trois mois", () => {
  it("finit la veille du même quantième, trois mois plus tard", () => {
    expect(finEssai("2026-01-05")).toBe("2026-04-04");
    expect(finEssai("2026-03-01")).toBe("2026-05-31");
  });

  it("passe l'année", () => {
    expect(finEssai("2026-11-15")).toBe("2027-02-14");
  });

  it("court jusqu'à la fin du mois quand le quantième n'existe pas", () => {
    expect(finEssai("2026-01-31")).toBe("2026-04-30");
    expect(finEssai("2026-11-30")).toBe("2027-02-28");
    expect(finEssai("2027-11-30")).toBe("2028-02-29");
  });

  it("accepte une autre durée", () => {
    expect(finEssai("2026-01-05", 1)).toBe("2026-02-04");
  });
});

describe("personne à prévenir", () => {
  it("n'accepte qu'un lien de la liste", () => {
    expect(lienUrgenceConnu("epouse")).toBe(true);
    expect(lienUrgenceConnu("soeur")).toBe(true);
    expect(lienUrgenceConnu("voisin")).toBe(false);
  });
});
