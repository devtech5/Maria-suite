import { describe, expect, it } from "vitest";

import { estEquilibree } from "@/lib/comptabilite/ecritures";
import { presetRole, resoudreDroits } from "@/lib/droits/catalogue";
import { alertes } from "@/lib/tableau-de-bord";
import {
  BAREME_PAR_DEFAUT,
  absencesDuMois,
  calculerBulletinPaie,
  echeanceDeclarations,
  ecriturePaie,
  ecriturePaiementSalaire,
  ecritureVersement,
  finDeMois,
  impotProgressif,
  libelleMois,
  moisValide,
  refusBareme,
  retenueAbsence,
  totaliser,
  type BaremePaie,
  type ContexteAbsences,
} from "@/modules/paie/calcul";

const bareme: BaremePaie = {
  cnpsRetraiteSalarieBp: 630,
  cnpsRetraitePatronalBp: 770,
  cnpsPlafondMensuel: 1_000_000,
  prestationsFamilialesBp: 575,
  accidentTravailBp: 200,
  tranchesImpot: [
    { seuil: 75_000, tauxBp: 150 },
    { seuil: 240_000, tauxBp: 500 },
  ],
};
const ligne = (e: { lignes: { compte: string; debit: number; credit: number }[] }, compte: string) => e.lignes.find((l) => l.compte === compte);

describe("impôt progressif", () => {
  it("ne taxe chaque tranche que pour sa part", () => {
    expect(impotProgressif(50_000, bareme.tranchesImpot)).toBe(0);
    expect(impotProgressif(175_000, bareme.tranchesImpot)).toBe(1_500); // 100 000 × 1,5 %
    expect(impotProgressif(340_000, bareme.tranchesImpot)).toBe(2_475 + 5_000); // 165 000 × 1,5 % + 100 000 × 5 %
  });

  it("ne dépend pas de l'ordre de saisie des tranches", () => {
    expect(impotProgressif(340_000, [...bareme.tranchesImpot].reverse())).toBe(7_475);
  });
});

describe("bulletin", () => {
  it("suit la cascade brut, CNPS, impôt, indemnités, retenues", () => {
    const b = calculerBulletinPaie({ salaireBase: 200_000, primesImposables: 50_000, indemnitesNonImposables: 25_000, retenuesDiverses: 10_000 }, bareme);
    expect(b.brut).toBe(250_000);
    expect(b.cnpsSalarie).toBe(15_750);
    expect(b.baseImposable).toBe(234_250);
    expect(b.impot).toBe(impotProgressif(234_250, bareme.tranchesImpot));
    expect(b.net).toBe(250_000 - 15_750 - b.impot + 25_000 - 10_000);
    expect(b.cnpsPatronal).toBe(19_250);
    expect(b.prestationsFamiliales).toBe(14_375);
    expect(b.accidentTravail).toBe(5_000);
    expect(b.coutTotal).toBe(250_000 + 25_000 + 19_250 + 14_375 + 5_000);
  });

  it("plafonne la retraite, pas les prestations familiales", () => {
    const b = calculerBulletinPaie({ salaireBase: 2_000_000, primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0 }, bareme);
    expect(b.assietteCnps).toBe(1_000_000);
    expect(b.cnpsSalarie).toBe(63_000);
    expect(b.prestationsFamiliales).toBe(115_000);
  });

  it("refuse un net négatif et des montants faux", () => {
    expect(() => calculerBulletinPaie({ salaireBase: 60_000, primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 80_000 }, bareme)).toThrow(/négatif/);
    expect(() => calculerBulletinPaie({ salaireBase: 60_000.5, primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0 }, bareme)).toThrow();
  });
});

describe("écritures de paie", () => {
  const bulletins = [
    { ...calculerBulletinPaie({ salaireBase: 200_000, primesImposables: 50_000, indemnitesNonImposables: 25_000, retenuesDiverses: 10_000 }, bareme), indemnitesNonImposables: 25_000, retenuesDiverses: 10_000 },
    { ...calculerBulletinPaie({ salaireBase: 120_000, primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0 }, bareme), indemnitesNonImposables: 0, retenuesDiverses: 0 },
  ];
  const t = totaliser(bulletins);

  it("passe une écriture de paie équilibrée au journal OD", () => {
    const e = ecriturePaie({ mois: "2026-10", date: finDeMois("2026-10"), totaux: t, salaries: 2 });
    expect(estEquilibree(e)).toBe(true);
    expect(e.journal).toBe("OD");
    expect(e.date).toBe("2026-10-31");
    expect(ligne(e, "661")?.debit).toBe(370_000);
    expect(ligne(e, "663")?.debit).toBe(25_000);
    expect(ligne(e, "664")?.debit).toBe(t.chargesPatronales);
    expect(ligne(e, "431")?.credit).toBe(t.totalCnps);
    expect(ligne(e, "447")?.credit).toBe(t.impot);
    expect(ligne(e, "4251")?.credit).toBe(10_000);
    expect(ligne(e, "422")?.credit).toBe(t.net);
  });

  it("verse le net et les organismes depuis la trésorerie", () => {
    const tres = { numero: "5211", libelle: "SGBCI", journal: "BQ" as const };
    const p = ecriturePaiementSalaire({ piece: "BUL-1-P", date: "2026-11-02", salarie: "Koné", montant: 150_000, tresorerie: tres });
    expect(ligne(p, "422")?.debit).toBe(150_000);
    expect(ligne(p, "5211")?.credit).toBe(150_000);
    const v = ecritureVersement({ organisme: "cnps", piece: "CNPS-2026-10", date: "2026-11-10", mois: "2026-10", montant: t.totalCnps, tresorerie: tres });
    expect(ligne(v, "431")?.debit).toBe(t.totalCnps);
    const i = ecritureVersement({ organisme: "impot", piece: "ITS-2026-10", date: "2026-11-10", mois: "2026-10", montant: t.impot, tresorerie: tres });
    expect(ligne(i, "447")?.debit).toBe(t.impot);
    expect(() => ecritureVersement({ organisme: "impot", piece: "x", date: "2026-11-10", mois: "2026-10", montant: 0, tresorerie: tres })).toThrow();
  });
});

describe("barème et calendrier", () => {
  it("contrôle un barème saisi", () => {
    expect(refusBareme(BAREME_PAR_DEFAUT)).toBeNull();
    expect(refusBareme({ ...bareme, cnpsRetraiteSalarieBp: 6_000 })).toMatch(/entre 0 et 50/);
    expect(refusBareme({ ...bareme, cnpsPlafondMensuel: 0 })).toMatch(/plafond/);
    expect(refusBareme({ ...bareme, tranchesImpot: [{ seuil: 1, tauxBp: 100 }, { seuil: 1, tauxBp: 200 }] })).toMatch(/même seuil/);
  });

  it("calcule les dates de la période", () => {
    expect(moisValide("2026-10")).toBe(true);
    expect(moisValide("2026-13")).toBe(false);
    expect(libelleMois("2026-02")).toBe("février 2026");
    expect(finDeMois("2028-02")).toBe("2028-02-29");
    expect(echeanceDeclarations("2026-12")).toBe("2027-01-15");
  });
});

describe("branchements de la paie", () => {
  it("lève les alertes de paie", () => {
    const liste = alertes(
      { enRetard: 0, montantEnRetard: 0 },
      { ruptures: 0, aCommanderVite: 0, valeur: 0 },
      { echeancesDepassees: 0, indisponibles: 0 },
      { enRetard: 0, echouees: 0 },
      { locationsEnRetard: 0, abonnementsEpuises: 0 },
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      { salairesNonPayes: 3, montantNonPaye: 450_000, declarationsDues: 2, montantDeclarations: 120_000, declarationsEchues: 1 },
    );
    expect(liste.find((a) => a.id === "salaires-non-payes")?.gravite).toBe("critique");
    expect(liste.find((a) => a.id === "declarations-paie")?.gravite).toBe("critique");
  });

  it("réserve la validation au gérant, la préparation et le paiement au comptable", () => {
    const comptable = resoudreDroits({ cleRole: "comptable", estProprietaire: false });
    expect(comptable.has("personnes.paie.preparer")).toBe(true);
    expect(comptable.has("personnes.paie.payer")).toBe(true);
    expect(comptable.has("personnes.paie.valider")).toBe(false);
    expect(presetRole("gerant")?.droits).toContain("personnes.paie.valider");
  });
});

describe("absences dans la paie", () => {
  // Octobre 2026 : 31 jours, 4 dimanches, aucun férié — 27 jours ouvrables.
  const ctx = (conges: ContexteAbsences["conges"] = [], feries: string[] = []): ContexteAbsences => ({
    options: { decompte: "ouvrables", joursTravailles: [1, 2, 3, 4, 5], feries: new Set(feries) },
    conges,
    soldes: new Map([["s1", 1_320]]),
  });
  const salarie = { id: "s1", debut: "2025-01-06", fin: null };
  const conge = (nature: "paye" | "sans_solde", debut: string, fin: string, demi: { debut?: boolean; fin?: boolean } = {}) => ({
    employeeId: "s1",
    nature,
    debut,
    fin,
    debutDemi: demi.debut ?? false,
    finDemi: demi.fin ?? false,
  });

  it("compte les jours du mois selon le décompte des congés", () => {
    expect(absencesDuMois("2026-10", salarie, ctx())).toEqual({ joursMois: 2_700, joursHorsContrat: 0, joursSansSolde: 0, congesPris: 0, soldeConges: 1_320 });
    // Le 1er novembre, Toussaint, tombe un dimanche ; un férié en semaine sort du mois.
    expect(absencesDuMois("2026-10", salarie, ctx([], ["2026-10-07"])).joursMois).toBe(2_600);
  });

  it("ne paie pas les jours avant l'embauche ni après le terme", () => {
    // Entré le jeudi 15 : du 1er au 14, 12 jours ouvrables.
    expect(absencesDuMois("2026-10", { id: "s1", debut: "2026-10-15", fin: null }, ctx()).joursHorsContrat).toBe(1_200);
    // CDD terminé le samedi 24 : du 26 au 31, 6 jours ouvrables.
    expect(absencesDuMois("2026-10", { id: "s1", debut: "2026-01-05", fin: "2026-10-24" }, ctx()).joursHorsContrat).toBe(600);
  });

  it("retient le sans solde accordé, et seulement la part du mois", () => {
    const a = absencesDuMois("2026-10", salarie, ctx([conge("sans_solde", "2026-10-19", "2026-10-20")]));
    expect(a.joursSansSolde).toBe(200);
    // Du jeudi 29 (parti l'après-midi) au mardi 3 novembre (rentré l'après-midi).
    const aCheval = [conge("sans_solde", "2026-10-29", "2026-11-03", { debut: true, fin: true })];
    expect(absencesDuMois("2026-10", salarie, ctx(aCheval)).joursSansSolde).toBe(250);
    expect(absencesDuMois("2026-11", salarie, ctx(aCheval)).joursSansSolde).toBe(150);
  });

  it("ne compte pas deux fois un congé tombé avant l'embauche", () => {
    const a = absencesDuMois("2026-10", { id: "s1", debut: "2026-10-15", fin: null }, ctx([conge("sans_solde", "2026-10-12", "2026-10-16")]));
    expect(a.joursHorsContrat).toBe(1_200);
    expect(a.joursSansSolde).toBe(200); // jeudi 15 et vendredi 16
  });

  it("imprime les congés payés sans rien retenir", () => {
    const a = absencesDuMois("2026-10", salarie, ctx([conge("paye", "2026-10-05", "2026-10-10"), conge("paye", "2026-10-31", "2026-11-14")]));
    expect(a.congesPris).toBe(700);
    expect(a.joursSansSolde).toBe(0);
    expect(absencesDuMois("2026-10", { id: "autre", debut: "2026-01-05", fin: null }, ctx([conge("paye", "2026-10-05", "2026-10-10")])).soldeConges).toBeNull();
  });

  it("retient au prorata, en francs entiers, et tout le salaire pour tout le mois", () => {
    expect(retenueAbsence(270_000, 1_200, 2_700)).toBe(120_000);
    expect(retenueAbsence(250_000, 150, 2_700)).toBe(13_889); // 13 888,89
    expect(retenueAbsence(250_000, 2_700, 2_700)).toBe(250_000);
    expect(retenueAbsence(250_000, 3_000, 2_700)).toBe(250_000);
    expect(retenueAbsence(250_000, 0, 2_700)).toBe(0);
    expect(retenueAbsence(250_000, 100, 0)).toBe(0);
  });

  it("calcule le bulletin sur le salaire dû", () => {
    const b = calculerBulletinPaie({ salaireBase: 270_000, retenueAbsence: 120_000, primesImposables: 10_000, indemnitesNonImposables: 0, retenuesDiverses: 0 }, bareme);
    expect(b.brut).toBe(160_000);
    expect(b.cnpsSalarie).toBe(10_080);
    expect(() => calculerBulletinPaie({ salaireBase: 100_000, retenueAbsence: 100_001, primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0 }, bareme)).toThrow(/dépasse/);
  });
});
