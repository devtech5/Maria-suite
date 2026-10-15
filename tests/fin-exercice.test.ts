import { describe, expect, it } from "vitest";

import { estEquilibree } from "@/lib/comptabilite/ecritures";
import { calculerBilan, type SoldeCompte } from "@/lib/comptabilite/etats";
import { refusCloture } from "@/modules/fiscalite/calcul";
import {
  contrepassation,
  determinerImpot,
  ecritureAffectation,
  ecritureFractionImpot,
  ecritureImpot,
  fractionsImpot,
  refusAffectation,
  refusRegleImpot,
  refusReouverture,
  regleImpotDuPays,
  reserveLegaleSuggeree,
  type RegleImpotBenefices,
} from "@/modules/fiscalite/resultat";

const s = (compte: string, debit: number, credit: number): SoldeCompte => ({ compte, libelle: compte, debit, credit });
const poste = (postes: { code: string; montant: number }[], code: string) => postes.find((p) => p.code === code)?.montant;

describe("bilan", () => {
  // Capital apporté en banque, matériel acheté, stock, ventes à crédit, fournisseur, résultat non clôturé.
  const soldes = [
    s("101", 0, 1_000_000),
    s("5211", 1_000_000 + 400_000, 300_000 + 150_000),
    s("2441", 300_000, 0),
    s("2844", 0, 60_000),
    s("311", 80_000, 0),
    s("411", 500_000, 400_000),
    s("401", 0, 220_000),
    s("4091", 20_000, 0),
    s("701", 0, 500_000),
    s("601", 270_000, 0),
    s("681", 60_000, 0),
  ];

  it("tombe juste, résultat non clôturé compris", () => {
    const b = calculerBilan(soldes);
    expect(b.totalActif).toBe(b.totalPassif);
    expect(b.resultatEnInstance).toBe(500_000 - 270_000 - 60_000);
    expect(poste(b.passif, "CJ")).toBe(170_000);
  });

  it("présente les immobilisations nettes et range les tiers selon leur sens", () => {
    const b = calculerBilan(soldes);
    expect(poste(b.actif, "AI")).toBe(240_000);
    expect(poste(b.actif, "BI")).toBe(100_000);
    expect(poste(b.actif, "BH")).toBe(20_000);
    expect(poste(b.passif, "DJ")).toBe(220_000);
    expect(poste(b.actif, "BT")).toBe(950_000);
  });

  it("met une banque à découvert au passif", () => {
    const b = calculerBilan([s("101", 0, 100_000), s("5211", 0, 50_000), s("2441", 150_000, 0)]);
    expect(poste(b.passif, "DT")).toBe(50_000);
    expect(poste(b.actif, "BT")).toBe(0);
    expect(b.totalActif).toBe(b.totalPassif);
  });

  it("après clôture, le résultat est en 13 et plus en instance", () => {
    const clos = [s("101", 0, 1_000), s("5211", 1_200, 0), s("701", 300, 300), s("601", 100, 100), s("131", 0, 200)];
    const b = calculerBilan(clos);
    expect(b.resultatEnInstance).toBe(0);
    expect(poste(b.passif, "CJ")).toBe(200);
    expect(b.totalActif).toBe(b.totalPassif);
  });
});

describe("impôt sur les bénéfices", () => {
  const regle: RegleImpotBenefices = { tauxBp: 2_500, imfTauxBp: 50, imfMinimum: 3_000_000, imfMaximum: 35_000_000, echeances: ["04-20", "06-20", "09-20"], source: "" };

  it("retient le plus élevé de l'impôt au taux et du minimum forfaitaire", () => {
    const fort = determinerImpot({ resultatComptable: 100_000_000, reintegrations: 2_000_000, deductions: 0, chiffreAffaires: 800_000_000 }, regle);
    expect(fort.resultatFiscal).toBe(102_000_000);
    expect(fort.impotTheorique).toBe(25_500_000);
    expect(fort.imf).toBe(4_000_000);
    expect(fort.impotDu).toBe(25_500_000);

    const deficit = determinerImpot({ resultatComptable: -5_000_000, reintegrations: 0, deductions: 0, chiffreAffaires: 200_000_000 }, regle);
    expect(deficit.impotTheorique).toBe(0);
    expect(deficit.impotDu).toBe(3_000_000); // 1 000 000 relevé au plancher

    const plafonne = determinerImpot({ resultatComptable: 0, reintegrations: 0, deductions: 0, chiffreAffaires: 10_000_000_000 }, regle);
    expect(plafonne.imf).toBe(35_000_000);
  });

  it("sans minimum forfaitaire, un déficit ne doit rien", () => {
    const r = determinerImpot({ resultatComptable: -1, reintegrations: 0, deductions: 0, chiffreAffaires: 1_000 }, { ...regle, imfTauxBp: 0 });
    expect(r.impotDu).toBe(0);
  });

  it("partage l'impôt en fractions qui retombent sur le total", () => {
    const f = fractionsImpot("2026", 1_000_000, ["06-20", "04-20", "09-20"]);
    expect(f.map((x) => x.echeance)).toEqual(["2027-04-20", "2027-06-20", "2027-09-20"]);
    expect(f.map((x) => x.montant)).toEqual([333_334, 333_333, 333_333]);
    expect(fractionsImpot("2026", 0, ["04-20"])).toEqual([]);
  });

  it("passe des écritures équilibrées", () => {
    const constat = ecritureImpot({ exercice: "2026", piece: "IS-2026", impotDu: 450_000 });
    expect(estEquilibree(constat)).toBe(true);
    expect(constat.date).toBe("2026-12-31");
    expect(constat.lignes.map((l) => l.compte)).toEqual(["891", "441"]);
    const paiement = ecritureFractionImpot({ exercice: "2026", rang: 1, piece: "IS-2026-F1", date: "2027-04-18", montant: 150_000, tresorerie: { numero: "5211", libelle: "Banque", journal: "BQ" } });
    expect(estEquilibree(paiement)).toBe(true);
    expect(paiement.lignes[0]).toMatchObject({ compte: "441", debit: 150_000 });
  });

  it("contrôle la règle saisie et part de celle du pays", () => {
    expect(regleImpotDuPays("ci").tauxBp).toBe(2_500);
    expect(regleImpotDuPays("XX").tauxBp).toBe(0);
    expect(refusRegleImpot(regle)).toBeNull();
    expect(refusRegleImpot({ ...regle, echeances: ["4-20"] })).toMatch(/MM-JJ/);
    expect(refusRegleImpot({ ...regle, imfMinimum: 40_000_000 })).toMatch(/dépasse/);
    expect(refusRegleImpot({ ...regle, tauxBp: 7_000 })).toMatch(/60 %/);
  });

  it("bloque la clôture tant que l'impôt n'est pas constaté", () => {
    expect(refusCloture("2025", "2026-02-01", false, { impotNonConstate: true })).toMatch(/impôt sur les bénéfices/);
    expect(refusCloture("2025", "2026-02-01", false, { impotNonConstate: false })).toBeNull();
  });
});

describe("affectation du résultat", () => {
  it("répartit tout le bénéfice", () => {
    const a = { reserveLegale: 100_000, autresReserves: 200_000, dividendes: 500_000, reportANouveau: 200_000 };
    expect(refusAffectation(1_000_000, a)).toBeNull();
    expect(refusAffectation(1_000_001, a)).toMatch(/en entier/);
    const e = ecritureAffectation({ exercice: "2026", piece: "AFF-2026", date: "2027-05-15", resultat: 1_000_000, affectation: a });
    expect(estEquilibree(e)).toBe(true);
    expect(e.lignes.map((l) => l.compte)).toEqual(["131", "111", "118", "465", "121"]);
    expect(reserveLegaleSuggeree(1_000_005)).toBe(100_000);
    expect(reserveLegaleSuggeree(-5)).toBe(0);
  });

  it("impute une perte sans rien distribuer", () => {
    expect(refusAffectation(-300_000, { reserveLegale: 0, autresReserves: 0, dividendes: 100, reportANouveau: 299_900 })).toMatch(/ne distribue rien/);
    const e = ecritureAffectation({ exercice: "2026", piece: "AFF-2026", date: "2027-05-15", resultat: -300_000, affectation: { reserveLegale: 0, autresReserves: 100_000, dividendes: 0, reportANouveau: 200_000 } });
    expect(estEquilibree(e)).toBe(true);
    expect(e.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["118", 100_000, 0],
      ["129", 200_000, 0],
      ["139", 0, 300_000],
    ]);
    expect(refusAffectation(0, { reserveLegale: 0, autresReserves: 0, dividendes: 0, reportANouveau: 0 })).toMatch(/nul/);
  });
});

describe("réouverture", () => {
  it("contrepasse ligne à ligne", () => {
    const e = ecritureImpot({ exercice: "2026", piece: "IS-2026", impotDu: 450_000 });
    const c = contrepassation(e, { piece: "IS-2026-ANN", date: "2026-12-31", motif: "Erreur de base" });
    expect(estEquilibree(c)).toBe(true);
    expect(c.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["891", 0, 450_000],
      ["441", 450_000, 0],
    ]);
    expect(c.libelle).toMatch(/Annulation — .*Erreur de base/);
  });

  it("se fait du plus récent au plus ancien, motif à l'appui", () => {
    expect(refusReouverture({ exercice: "2025", clos: true, suivantClos: false, motif: "Facture oubliée" })).toBeNull();
    expect(refusReouverture({ exercice: "2025", clos: false, suivantClos: false, motif: "Facture oubliée" })).toMatch(/n'est pas clôturé/);
    expect(refusReouverture({ exercice: "2025", clos: true, suivantClos: true, motif: "Facture oubliée" })).toMatch(/2026 est clôturé/);
    expect(refusReouverture({ exercice: "2025", clos: true, suivantClos: false, motif: "  " })).toMatch(/pourquoi/);
  });
});
