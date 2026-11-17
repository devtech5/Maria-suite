import { describe, expect, it } from "vitest";

import { calculerBilan, type SoldeCompte } from "@/lib/comptabilite/etats";
import { capaciteAutofinancement } from "@/lib/comptabilite/flux";
import { calculerNotesAnnexes, type DonneesNotes, type NoteAnnexe } from "@/lib/comptabilite/notes";

/**
 * Notes annexes calculées depuis les comptes (lot 1).
 *
 * Une note détaille un poste : son total doit retomber sur le poste du bilan
 * ou du compte de résultat qu'elle explique. C'est ce que le comptable
 * vérifie en premier, et ce que ces tests vérifient d'abord.
 */

const s = (compte: string, debit: number, credit: number): SoldeCompte => ({ compte, libelle: `Compte ${compte}`, debit, credit });

const VIDE: DonneesNotes = { bilanN: [], bilanN1: [], mouvementsN: [], mouvementsN1: [] };

const note = (notes: NoteAnnexe[], numero: string) => {
  const trouvee = notes.find((n) => n.numero === numero);
  if (!trouvee) throw new Error(`Note ${numero} absente`);
  return trouvee;
};
/** La ligne de total d'une note, ou d'une rubrique par son libellé. */
const total = (n: NoteAnnexe, libelle?: string) => {
  const l = libelle ? n.lignes.find((x) => x.niveau === "rubrique" && x.libelle === libelle) : n.lignes.find((x) => x.niveau === "total");
  if (!l) throw new Error(`Total ${libelle ?? ""} absent de la note ${n.numero}`);
  return l.valeurs;
};
const detail = (n: NoteAnnexe, compte: string) => n.lignes.find((l) => l.compte === compte)?.valeurs;

/** Une entreprise ordinaire, au 31/12/2026 et au 31/12/2025. */
const BILAN_N: SoldeCompte[] = [
  s("101", 0, 10_000_000),
  s("111", 0, 400_000),
  s("1411", 0, 540_000),
  s("162", 0, 4_000_000),
  s("2441", 2_300_000, 0),
  s("2845", 0, 400_000),
  s("2751", 150_000, 0),
  s("311", 1_200_000, 0),
  s("391", 0, 100_000),
  s("4011", 0, 900_000),
  s("4091", 70_000, 0),
  s("4111", 900_000, 0),
  s("4116", 100_000, 0),
  s("4191", 0, 50_000),
  s("491", 0, 60_000),
  s("4211", 0, 120_000),
  s("4311", 0, 80_000),
  s("4441", 0, 210_000),
  s("4494", 200_000, 0),
  s("4812", 0, 500_000),
  s("4851", 400_000, 0),
  s("4711", 30_000, 0),
  s("5211", 11_300_000, 0),
  s("5711", 250_000, 0),
  s("701", 0, 6_000_000),
  s("601", 3_000_000, 0),
  s("6031", 0, 150_000),
  s("661", 1_200_000, 0),
  s("6813", 400_000, 0),
  s("812", 800_000, 0),
  s("822", 0, 900_000),
  s("6712", 300_000, 0),
  s("6594", 60_000, 0),
  s("6593", 100_000, 0),
  s("799", 0, 60_000),
];

const BILAN_N1: SoldeCompte[] = [
  s("101", 0, 7_000_000),
  s("2441", 1_000_000, 0),
  s("2844", 0, 200_000),
  s("311", 1_050_000, 0),
  s("4011", 0, 600_000),
  s("4111", 600_000, 0),
  s("5211", 5_150_000, 0),
];

/** Mouvements 2026 : ce qui fait passer de BILAN_N1 à BILAN_N (sans la clôture). */
const MOUVEMENTS_N: SoldeCompte[] = [
  s("2441", 0, 1_000_000),
  s("2451", 2_300_000, 0),
  s("2844", 200_000, 0),
  s("2845", 0, 400_000),
  s("491", 0, 60_000),
  s("391", 0, 100_000),
  s("601", 3_000_000, 0),
  s("6031", 0, 150_000),
  s("701", 0, 6_000_000),
  s("6813", 400_000, 0),
  s("812", 800_000, 0),
  s("822", 0, 900_000),
  s("6712", 300_000, 0),
  s("771", 0, 50_000),
  s("661", 1_200_000, 0),
  s("6594", 60_000, 0),
  s("6593", 100_000, 0),
  s("799", 0, 60_000),
  s("465", 300_000, 300_000),
];

const DONNEES: DonneesNotes = { bilanN: BILAN_N, bilanN1: BILAN_N1, mouvementsN: MOUVEMENTS_N, mouvementsN1: [] };

describe("notes annexes", () => {
  it("produit les notes du lot 1, une fois chacune, dans l'ordre de la liasse", () => {
    const notes = calculerNotesAnnexes(VIDE, "2026");
    expect(notes.map((n) => n.numero)).toEqual([
      "3A", "3C", "3D", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "15A", "16A",
      "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27A", "28", "29", "30", "34",
    ]);
  });

  it("sans écriture, toutes les notes sont vides et ne portent ni NaN ni zéro négatif", () => {
    const notes = calculerNotesAnnexes(VIDE, "2026");
    for (const n of notes) {
      expect(n.vide).toBe(true);
      for (const l of n.lignes) for (const v of l.valeurs) expect(v === null || (Number.isInteger(v) && !Object.is(v, -0))).toBe(true);
    }
  });

  it("note 7 : les clients compte par compte, dépréciation déduite, client créditeur ailleurs", () => {
    const n7 = note(calculerNotesAnnexes(DONNEES, "2026"), "7");
    expect(n7.colonnes.map((c) => c.titre)).toEqual(["2026", "2025", "Variation", "Variation %"]);
    expect(detail(n7, "4111")).toEqual([900_000, 600_000, 300_000, 5_000]);
    expect(detail(n7, "491")).toEqual([-60_000, 0, -60_000, null]);
    expect(detail(n7, "4191")).toBeUndefined();
    expect(total(n7)).toEqual([940_000, 600_000, 340_000, 5_667]);
  });

  it("chaque note de bilan retombe sur le poste qu'elle détaille", () => {
    const notes = calculerNotesAnnexes(DONNEES, "2026");
    const b = calculerBilan(BILAN_N);
    const actif = (code: string) => b.actif.find((p) => p.code === code)?.montant ?? 0;
    const passif = (code: string) => b.passif.find((p) => p.code === code)?.montant ?? 0;
    const n = (numero: string) => total(note(notes, numero))[0] ?? Number.NaN;

    expect(n("4")).toBe(actif("AQ"));
    expect(n("6")).toBe(actif("BB"));
    expect(n("7")).toBe(actif("BI"));
    expect(n("5") + n("8")).toBe(actif("BH") + actif("BJ"));
    expect(n("9") + n("10") + n("11")).toBe(actif("BT"));
    expect(n("15A")).toBe(passif("CL"));
    expect(n("16A")).toBe(passif("DA") + passif("DC"));
    expect(n("17")).toBe(passif("DJ"));
    expect(n("18")).toBe(passif("DK"));
    expect(n("19")).toBe(passif("DI") + passif("DM"));
    expect(n("20")).toBe(passif("DT"));
  });

  it("note 22 : les achats, variation de stock comprise et du bon côté", () => {
    const n22 = note(calculerNotesAnnexes(DONNEES, "2026"), "22");
    expect(detail(n22, "601")?.[0]).toBe(3_000_000);
    expect(detail(n22, "6031")?.[0]).toBe(-150_000);
    expect(total(n22)[0]).toBe(2_850_000);
  });

  it("note 3A : les immobilisations brutes, de l'ouverture à la clôture", () => {
    const n3a = note(calculerNotesAnnexes(DONNEES, "2026"), "3A");
    expect(n3a.colonnes.map((c) => c.titre)).toEqual(["Ouverture", "Augmentations", "Diminutions", "Clôture"]);
    expect(total(n3a, "Immobilisations corporelles")).toEqual([1_000_000, 2_300_000, 1_000_000, 2_300_000]);
    expect(detail(n3a, "2451")).toEqual([0, 2_300_000, 0, 2_300_000]);
    // La clôture de la note est le brut du bilan.
    expect(total(n3a, "Immobilisations corporelles")[3]).toBe(2_300_000);
  });

  it("note 3C : les amortissements, dotations et sorties", () => {
    const n3c = note(calculerNotesAnnexes(DONNEES, "2026"), "3C");
    expect(total(n3c, "Amortissements des immobilisations corporelles")).toEqual([200_000, 400_000, 200_000, 400_000]);
  });

  it("note 3D : plus ou moins-value de cession, par nature d'immobilisation", () => {
    const n3d = note(calculerNotesAnnexes(DONNEES, "2026"), "3D");
    expect(n3d.colonnes.map((c) => c.titre)).toEqual(["Valeur comptable cédée", "Prix de cession", "Plus ou moins-value"]);
    const corporelles = n3d.lignes.find((l) => l.libelle === "Immobilisations corporelles")?.valeurs;
    expect(corporelles).toEqual([800_000, 900_000, 100_000]);
    expect(total(n3d)).toEqual([800_000, 900_000, 100_000]);
  });

  it("note 28 : les dépréciations dotées dans l'exercice", () => {
    const n28 = note(calculerNotesAnnexes(DONNEES, "2026"), "28");
    expect(total(n28)).toEqual([0, 160_000, 0, 160_000]);
  });

  it("note 29 : charges et revenus financiers, et leur solde", () => {
    const n29 = note(calculerNotesAnnexes(DONNEES, "2026"), "29");
    expect(total(n29, "Revenus financiers")[0]).toBe(50_000);
    expect(total(n29, "Frais financiers")[0]).toBe(300_000);
    expect(total(n29)[0]).toBe(-250_000);
  });

  it("note 34 : la fiche de synthèse reprend la CAFG du tableau des flux", () => {
    const n34 = note(calculerNotesAnnexes(DONNEES, "2026"), "34");
    const ligne = (libelle: string) => n34.lignes.find((l) => l.libelle === libelle)?.valeurs[0];
    expect(ligne("Chiffre d'affaires")).toBe(6_000_000);
    expect(ligne("Capacité d'autofinancement globale (CAFG)")).toBe(capaciteAutofinancement(MOUVEMENTS_N));
    expect(ligne("Dividendes distribués")).toBe(300_000);
    expect(ligne("Autofinancement")).toBe(capaciteAutofinancement(MOUVEMENTS_N) - 300_000);
    const rentabilite = n34.lignes.find((l) => l.libelle === "Rentabilité financière (résultat net / capitaux propres)");
    expect(rentabilite?.format).toBe("taux");
    expect(Number.isInteger(rentabilite?.valeurs[0])).toBe(true);
  });
});
