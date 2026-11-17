import { describe, expect, it } from "vitest";

import type { SoldeCompte } from "@/lib/comptabilite/etats";
import type { NoteAnnexe } from "@/lib/comptabilite/notes";
import {
  effectifMoyen,
  groupeNationalite,
  noteCapital,
  noteCinqExercices,
  noteEffectifs,
  type Collaborateur,
} from "@/lib/comptabilite/notes-personnel";

/**
 * Notes annexes tirées du personnel et de l'historique (lot 2) : 13 capital,
 * 27B effectifs et masse salariale, 31 cinq derniers exercices.
 */

const s = (compte: string, debit: number, credit: number): SoldeCompte => ({ compte, libelle: compte, debit, credit });
const ligne = (n: NoteAnnexe, libelle: string) => n.lignes.find((l) => l.libelle === libelle)?.valeurs;

const collaborateur = (c: Partial<Collaborateur> & { id: string }): Collaborateur => ({
  debut: "2020-01-01",
  fin: null,
  sexe: null,
  nationalite: null,
  categorie: null,
  ...c,
});

describe("nationalité", () => {
  it("range la nationalité saisie en nationaux, autres États OHADA, hors OHADA", () => {
    expect(groupeNationalite("Ivoirienne", "CI")).toBe("national");
    expect(groupeNationalite("  ivoirien ", "CI")).toBe("national");
    expect(groupeNationalite("Côte d'Ivoire", "CI")).toBe("national");
    expect(groupeNationalite("Malien", "CI")).toBe("ohada");
    expect(groupeNationalite("Burkinabè", "CI")).toBe("ohada");
    expect(groupeNationalite("Congolaise", "CI")).toBe("ohada");
    expect(groupeNationalite("Nigérienne", "CI")).toBe("ohada");
    expect(groupeNationalite("Nigériane", "CI")).toBe("hors_ohada");
    expect(groupeNationalite("Française", "CI")).toBe("hors_ohada");
    expect(groupeNationalite(null, "CI")).toBe("inconnu");
    expect(groupeNationalite("", "CI")).toBe("inconnu");
  });

  it("suit le pays de l'entreprise : au Sénégal, un Ivoirien est d'un autre État OHADA", () => {
    expect(groupeNationalite("Sénégalaise", "SN")).toBe("national");
    expect(groupeNationalite("Ivoirienne", "SN")).toBe("ohada");
  });
});

describe("effectif moyen", () => {
  it("moyenne des douze fins de mois, en entier", () => {
    const equipe = [
      collaborateur({ id: "a" }),
      collaborateur({ id: "b" }),
      collaborateur({ id: "c", fin: "2026-03-31" }),
      collaborateur({ id: "d", debut: "2027-01-01" }),
    ];
    // 12 + 12 + 3 = 27 fins de mois en poste, soit 2,25.
    expect(effectifMoyen(equipe, "2026")).toBe(2);
    expect(effectifMoyen([], "2026")).toBe(0);
  });
});

describe("note 27B : effectifs et masse salariale", () => {
  const equipe: Collaborateur[] = [
    collaborateur({ id: "a", sexe: "M", nationalite: "Ivoirien", categorie: "cadre_superieur" }),
    collaborateur({ id: "b", sexe: "F", nationalite: "Ivoirienne", categorie: "employe" }),
    collaborateur({ id: "c", sexe: "M", nationalite: "Malien", categorie: "maitrise" }),
    collaborateur({ id: "d", sexe: "F", nationalite: "Française", categorie: "employe", fin: "2026-06-30" }),
    collaborateur({ id: "e" }),
  ];
  const note = noteEffectifs({
    exercice: "2026",
    paysEntreprise: "CI",
    collaborateurs: equipe,
    masses: new Map([
      ["a", 6_000_000],
      ["b", 1_200_000],
      ["d", 900_000],
    ]),
    mouvements: [s("661", 7_000_000, 0), s("662", 1_100_000, 0), s("664", 900_000, 0), s("667", 400_000, 0)],
  });

  it("compte les collaborateurs en poste au 31 décembre, par catégorie, nationalité et sexe", () => {
    expect(note.colonnes.map((c) => c.titre)).toEqual([
      "Nationaux H", "Nationaux F", "Autres OHADA H", "Autres OHADA F", "Hors OHADA H", "Hors OHADA F", "Non renseigné", "Total",
    ]);
    expect(ligne(note, "Cadres supérieurs")).toEqual([1, 0, 0, 0, 0, 0, 0, 1]);
    expect(ligne(note, "Techniciens, agents de maîtrise et ouvriers qualifiés")).toEqual([0, 0, 1, 0, 0, 0, 0, 1]);
    expect(ligne(note, "Catégorie non renseignée")).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
    expect(ligne(note, "Effectif au 31 décembre")).toEqual([1, 1, 1, 0, 0, 0, 1, 4]);
  });

  it("répartit la masse salariale de la paie, départs de l'année compris", () => {
    expect(ligne(note, "Masse salariale brute")).toEqual([6_000_000, 1_200_000, 0, 0, 0, 900_000, 0, 8_100_000]);
  });

  it("rapproche la paie des rémunérations comptabilisées", () => {
    expect(ligne(note, "Rémunérations comptabilisées (661 à 663)")?.at(-1)).toBe(8_100_000);
    expect(ligne(note, "Charges sociales (664, 668)")?.at(-1)).toBe(900_000);
    expect(ligne(note, "Personnel extérieur facturé (667)")?.at(-1)).toBe(400_000);
    expect(note.remarques?.some((r) => r.includes("1 collaborateur"))).toBe(true);
  });
});

describe("note 13 : capital", () => {
  it("donne le nombre de parts à partir du capital et de la valeur nominale", () => {
    const n = noteCapital({ exercice: "2026", capitalDeclare: 10_000_000, valeurNominale: 10_000, bilanN: [s("101", 0, 10_000_000)], bilanN1: [s("101", 0, 10_000_000)] });
    expect(ligne(n, "Capital au bilan (comptes 101 à 104)")).toEqual([10_000_000, 10_000_000]);
    expect(ligne(n, "Nombre de parts")?.[0]).toBe(1_000);
    expect(n.remarques ?? []).toEqual([]);
  });

  it("signale un capital déclaré qui diffère du capital comptabilisé, et une valeur nominale manquante", () => {
    const n = noteCapital({ exercice: "2026", capitalDeclare: 5_000_000, valeurNominale: null, bilanN: [s("101", 0, 10_000_000)], bilanN1: [] });
    expect(ligne(n, "Nombre de parts")?.[0]).toBeNull();
    expect(n.remarques?.length).toBe(2);
  });
});

describe("note 31 : cinq derniers exercices", () => {
  it("une colonne par exercice, du plus récent au plus ancien, vides compris", () => {
    const n = noteCinqExercices([
      { exercice: "2026", mouvements: [s("701", 0, 9_000_000), s("601", 5_000_000, 0), s("891", 500_000, 0)], bilan: [s("101", 0, 10_000_000)], dividendes: 0, effectifMoyen: 4 },
      { exercice: "2025", mouvements: [s("701", 0, 6_000_000), s("601", 4_000_000, 0)], bilan: [s("101", 0, 10_000_000)], dividendes: 300_000, effectifMoyen: 3 },
      { exercice: "2024", mouvements: [], bilan: [], dividendes: 0, effectifMoyen: 0 },
      { exercice: "2023", mouvements: [], bilan: [], dividendes: 0, effectifMoyen: 0 },
      { exercice: "2022", mouvements: [], bilan: [], dividendes: 0, effectifMoyen: 0 },
    ]);
    expect(n.colonnes.map((c) => c.titre)).toEqual(["2026", "2025", "2024", "2023", "2022"]);
    expect(ligne(n, "Chiffre d'affaires hors taxes")).toEqual([9_000_000, 6_000_000, 0, 0, 0]);
    expect(ligne(n, "Impôt sur le résultat")).toEqual([500_000, 0, 0, 0, 0]);
    expect(ligne(n, "Résultat net")).toEqual([3_500_000, 2_000_000, 0, 0, 0]);
    expect(ligne(n, "Résultat distribué")).toEqual([0, 300_000, 0, 0, 0]);
    expect(ligne(n, "Effectif moyen des collaborateurs")).toEqual([4, 3, 0, 0, 0]);
    expect(ligne(n, "Capital social")).toEqual([10_000_000, 10_000_000, 0, 0, 0]);
  });
});
