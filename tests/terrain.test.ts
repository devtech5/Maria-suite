import { describe, expect, it } from "vitest";

import {
  decisionPermise,
  lienCarte,
  lirePosition,
  lireAvancement,
  manqueAuReleve,
  peutExaminer,
  peutGererEquipe,
  peutReleverSur,
  peutSaisirPour,
  PREUVES_MAX,
  projetOuvertAuTerrain,
  type MembreRole,
} from "@/modules/projets/terrain-regles";

/**
 * Équipe d'un projet et collecte terrain. Ce qui compte : qui peut quoi
 * (le chef confie, le superviseur examine, l'agent relève), et qu'un relevé
 * ne vaille preuve qu'avec une vraie position et au moins une photo.
 */

const chef = { userId: "chef", gestionnaire: false };
const projet = { responsableUserId: "chef" };
const equipe: MembreRole[] = [
  { userId: "sup", role: "superviseur", actif: true },
  { userId: "agent", role: "agent", actif: true },
  { userId: null, role: "agent", actif: true },
  { userId: "parti", role: "agent", actif: false },
];

describe("droits sur l'équipe", () => {
  it("laisse le chef de projet et l'encadrement confier du personnel, pas les autres", () => {
    expect(peutGererEquipe(chef, projet)).toBe(true);
    expect(peutGererEquipe({ userId: "x", gestionnaire: true }, projet)).toBe(true);
    expect(peutGererEquipe({ userId: "sup", gestionnaire: false }, projet)).toBe(false);
    expect(peutGererEquipe({ userId: "x", gestionnaire: false }, { responsableUserId: null })).toBe(false);
  });

  it("laisse le superviseur, le chef et l'encadrement examiner, pas l'agent", () => {
    expect(peutExaminer({ userId: "sup", gestionnaire: false }, projet, equipe)).toBe(true);
    expect(peutExaminer(chef, projet, equipe)).toBe(true);
    expect(peutExaminer({ userId: "x", gestionnaire: true }, projet, equipe)).toBe(true);
    expect(peutExaminer({ userId: "agent", gestionnaire: false }, projet, equipe)).toBe(false);
  });

  it("ne laisse relever que les membres en poste", () => {
    expect(peutReleverSur({ userId: "agent", gestionnaire: false }, equipe)).toBe(true);
    expect(peutReleverSur({ userId: "sup", gestionnaire: false }, equipe)).toBe(true);
    expect(peutReleverSur({ userId: "parti", gestionnaire: false }, equipe)).toBe(false);
    expect(peutReleverSur(chef, equipe)).toBe(false);
  });

  it("fait saisir pour un externe par tout membre, pour un interne par lui-même ou l'encadrement", () => {
    const agent = { userId: "agent", gestionnaire: false };
    expect(peutSaisirPour(agent, projet, equipe, { userId: "agent", origine: "interne" })).toBe(true);
    expect(peutSaisirPour(agent, projet, equipe, { userId: null, origine: "externe" })).toBe(true);
    expect(peutSaisirPour(agent, projet, equipe, { userId: "sup", origine: "interne" })).toBe(false);
    expect(peutSaisirPour(chef, projet, equipe, { userId: "agent", origine: "interne" })).toBe(true);
    expect(peutSaisirPour({ userId: "intrus", gestionnaire: false }, projet, equipe, { userId: null, origine: "externe" })).toBe(false);
  });

  it("ferme le terrain aux projets clos", () => {
    expect(projetOuvertAuTerrain("en_cours")).toBe(true);
    expect(projetOuvertAuTerrain("preparation")).toBe(true);
    expect(projetOuvertAuTerrain("termine")).toBe(false);
    expect(projetOuvertAuTerrain("annule")).toBe(false);
  });
});

describe("preuves d'un relevé", () => {
  it("garde la position en millionièmes de degré, entière", () => {
    expect(lirePosition(5.345678, -4.024429, 12.4)).toEqual({ latitudeMicro: 5_345_678, longitudeMicro: -4_024_429, precisionM: 12 });
    expect(lirePosition("5.3", "-4.0")).toMatchObject({ latitudeMicro: 5_300_000, longitudeMicro: -4_000_000, precisionM: null });
  });

  it("refuse une position illisible, hors du globe, ou à (0, 0)", () => {
    expect(lirePosition("", "")).toHaveProperty("erreur");
    expect(lirePosition(91, 0)).toHaveProperty("erreur");
    expect(lirePosition(0, 181)).toHaveProperty("erreur");
    expect(lirePosition(0, 0)).toHaveProperty("erreur");
  });

  it("exige position et au moins une preuve, pas plus que le plafond", () => {
    expect(manqueAuReleve(1, true)).toBeNull();
    expect(manqueAuReleve(1, false)).toMatch(/GPS/);
    expect(manqueAuReleve(0, true)).toMatch(/photo/);
    expect(manqueAuReleve(PREUVES_MAX + 1, true)).toMatch(/au plus/);
  });

  it("lit l'avancement comme un pourcentage entier", () => {
    expect(lireAvancement("")).toBeNull();
    expect(lireAvancement("40")).toBe(40);
    expect(lireAvancement("0")).toBe(0);
    expect(lireAvancement("101")).toBe("invalide");
    expect(lireAvancement("12,5")).toBe("invalide");
  });

  it("donne un lien de carte à six décimales", () => {
    expect(lienCarte(5_345_678, -4_024_429)).toContain("mlat=5.345678&mlon=-4.024429");
  });

  it("exige un motif pour renvoyer un relevé, et ne le fait pas revenir à « à examiner »", () => {
    expect(decisionPermise("soumis", "valide", "")).toBeNull();
    expect(decisionPermise("soumis", "a_refaire", " ")).toMatch(/refaire/);
    expect(decisionPermise("soumis", "a_refaire", "Photo floue")).toBeNull();
    expect(decisionPermise("valide", "soumis", "")).toMatch(/examiné/);
    expect(decisionPermise("valide", "valide", "")).toMatch(/déjà/);
    expect(decisionPermise("a_refaire", "valide", "")).toBeNull();
  });
});
