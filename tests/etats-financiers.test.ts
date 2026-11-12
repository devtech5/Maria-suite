import { describe, expect, it } from "vitest";

import { ecritureSaisieGuidee } from "@/lib/comptabilite/ecritures";
import { tresorerie } from "@/lib/tableau-de-bord";
import {
  calculerSIG,
  elementsResultat,
  positionComptable,
  type SoldeCompte,
} from "@/lib/comptabilite/etats";

/**
 * Compte de résultat SYSCOHADA.
 *
 * Testé au même titre que l'argent : une cascade fausse ne se voit pas. Elle
 * affiche un résultat plausible, l'exploitant s'y fie pour décider d'un
 * investissement, et l'erreur se découvre à la liasse — un an plus tard, chez
 * l'expert-comptable.
 */

function solde(compte: string, debit: number, credit: number): SoldeCompte {
  return { compte, libelle: compte, debit, credit };
}

/** Une boutique ordinaire : elle achète, elle revend, elle paie deux collaborateurs. */
const BOUTIQUE: SoldeCompte[] = [
  solde("701", 0, 74_200_000),
  solde("706", 0, 3_100_000),
  solde("601", 48_600_000, 0),
  solde("6031", 1_240_000, 0),
  solde("622", 4_180_000, 0),
  solde("641", 1_450_000, 0),
  solde("661", 9_840_000, 0),
  solde("658", 620_000, 0),
  solde("681", 2_310_000, 0),
  solde("771", 0, 180_000),
  solde("671", 940_000, 0),
  solde("891", 1_260_000, 0),
];

function sig(soldes: SoldeCompte[]) {
  const cascade = calculerSIG(elementsResultat(soldes));
  return (code: string) => cascade.find((ligne) => ligne.code === code)!.montant;
}

describe("ventilation des comptes", () => {
  it("range chaque compte dans son poste", () => {
    const e = elementsResultat(BOUTIQUE);

    expect(e.ventesMarchandises).toBe(74_200_000);
    expect(e.ventesServices).toBe(3_100_000);
    expect(e.achatsMarchandises).toBe(48_600_000);
    expect(e.servicesExterieurs).toBe(4_180_000);
    expect(e.chargesPersonnel).toBe(9_840_000);
  });

  it("range un sous-compte ouvert par l'entreprise", () => {
    // Une entreprise ouvre ses propres subdivisions. « 7011 Ventes boutique »
    // doit tomber dans les ventes de marchandises sans qu'on l'ait déclaré.
    const e = elementsResultat([solde("7011", 0, 500_000), solde("6011", 200_000, 0)]);

    expect(e.ventesMarchandises).toBe(500_000);
    expect(e.achatsMarchandises).toBe(200_000);
  });

  it("ne confond pas la variation de stock de marchandises et celle des matières", () => {
    // 6031 et 6032 ne diffèrent que d'un chiffre et ne vont pas au même poste :
    // l'un entre dans la marge commerciale, l'autre dans la valeur ajoutée.
    const e = elementsResultat([solde("6031", 100_000, 0), solde("6032", 70_000, 0)]);

    expect(e.variationStocksMarchandises).toBe(100_000);
    expect(e.achatsMatieres).toBe(70_000);
  });

  it("retranche un avoir du produit qu'il annule", () => {
    // Un avoir client se passe au débit du 701. Le chiffre d'affaires est le
    // solde du compte, pas le cumul de ses crédits.
    const e = elementsResultat([solde("701", 4_000_000, 30_000_000)]);
    expect(e.ventesMarchandises).toBe(26_000_000);
  });
});

describe("cascade des soldes intermédiaires", () => {
  it("déduit chaque solde du précédent", () => {
    const de = sig(BOUTIQUE);

    // 74 200 000 − 48 600 000 − 1 240 000
    expect(de("XA")).toBe(24_360_000);
    // marge + services vendus − services extérieurs
    expect(de("XC")).toBe(24_360_000 + 3_100_000 - 4_180_000);
    // valeur ajoutée − impôts − personnel
    expect(de("XD")).toBe(23_280_000 - 1_450_000 - 9_840_000);
    // EBE − autres charges − dotations
    expect(de("XE")).toBe(11_990_000 - 620_000 - 2_310_000);
    expect(de("XF")).toBe(180_000 - 940_000);
    expect(de("XG")).toBe(9_060_000 - 760_000);
    expect(de("XI")).toBe(8_300_000 - 1_260_000);
  });

  it("ne donne pas deux soldes égaux là où il y a des salaires et un impôt", () => {
    // Le défaut exact du concurrent : valeur ajoutée égale à l'excédent brut,
    // résultat d'exploitation égal au résultat net. Impossible ici.
    const de = sig(BOUTIQUE);

    expect(de("XC")).not.toBe(de("XD"));
    expect(de("XE")).not.toBe(de("XI"));
  });

  it("compte le chiffre d'affaires marchandises et services ensemble", () => {
    expect(sig(BOUTIQUE)("XB")).toBe(74_200_000 + 3_100_000);
  });

  it("rend un résultat nul sur une comptabilité vide", () => {
    // Le premier jour d'un exploitant : aucun écran ne doit afficher NaN.
    const de = sig([]);
    expect(de("XI")).toBe(0);
    expect(de("XA")).toBe(0);
  });

  it("porte une perte en négatif, sans la masquer", () => {
    const de = sig([solde("701", 0, 1_000_000), solde("601", 1_800_000, 0)]);
    expect(de("XA")).toBe(-800_000);
    expect(de("XI")).toBe(-800_000);
  });

  it("tient l'exercice hors activités ordinaires à l'écart du résultat courant", () => {
    // Une cession d'immobilisation ne doit pas gonfler le résultat
    // d'exploitation : elle ne se reproduira pas l'an prochain.
    const soldes = [...BOUTIQUE, solde("821", 0, 5_000_000)];
    const de = sig(soldes);

    expect(de("XE")).toBe(9_060_000);
    expect(de("XH")).toBe(5_000_000);
    expect(de("XI")).toBe(7_040_000 + 5_000_000);
  });

  it("n'affiche pas de zéro négatif sur un poste vide", () => {
    // `-0` existe en JavaScript et s'affiche « -0 » : sur une comptabilité qui
    // ne compte encore que des ventes, toute la colonne des charges en serait
    // couverte.
    for (const ligne of calculerSIG(elementsResultat([solde("701", 0, 100_000)]))) {
      expect(Object.is(ligne.montant, -0), ligne.code).toBe(false);
    }
  });

  it("garde des entiers de francs, sans décimale", () => {
    for (const ligne of calculerSIG(elementsResultat(BOUTIQUE))) {
      expect(Number.isInteger(ligne.montant), ligne.code).toBe(true);
    }
  });
});

describe("position comptable", () => {
  it("additionne la banque, la caisse et le mobile money", () => {
    const position = positionComptable([
      solde("521", 12_000_000, 3_000_000),
      solde("571", 900_000, 250_000),
      solde("5711", 400_000, 0),
    ]);

    expect(position.tresorerie).toBe(10_050_000);
  });

  it("ne prend pas les placements pour de la trésorerie disponible", () => {
    // 50 : valeurs mobilières de placement. Elles ne paient pas un fournisseur
    // demain matin.
    const position = positionComptable([solde("501", 8_000_000, 0)]);
    expect(position.tresorerie).toBe(0);
  });

  it("rend la TVA due, facturée moins récupérable", () => {
    const position = positionComptable([
      solde("4431", 0, 1_971_000),
      solde("4451", 594_000, 0),
    ]);

    expect(position.tvaDue).toBe(1_377_000);
  });

  it("sépare la créance client de la dette fournisseur", () => {
    const position = positionComptable([
      solde("411", 5_090_000, 74_000),
      solde("401", 0, 3_200_000),
    ]);

    expect(position.creancesClients).toBe(5_016_000);
    expect(position.dettesFournisseurs).toBe(3_200_000);
  });
});

describe("saisie guidée", () => {
  it("déduit la contrepartie du journal et le sens du compte", () => {
    const ecriture = ecritureSaisieGuidee({
      journal: "CA",
      date: "2026-08-26",
      piece: "OD-00001",
      libelle: "Loyer du magasin",
      compte: "6221",
      libelleCompte: "Locations",
      sens: "charge",
      montant: 150_000,
    });

    expect(ecriture.lignes).toEqual([
      { compte: "6221", libelleCompte: "Locations", debit: 150_000, credit: 0 },
      { compte: "571", libelleCompte: "Caisse", debit: 0, credit: 150_000 },
    ]);
  });

  it("crédite le compte et débite la contrepartie pour un produit", () => {
    const ecriture = ecritureSaisieGuidee({
      journal: "BQ",
      date: "2026-08-26",
      piece: "REC-12",
      libelle: "Commission reçue",
      compte: "706",
      libelleCompte: "Services vendus",
      sens: "produit",
      montant: 40_000,
    });

    expect(ecriture.lignes[0]).toMatchObject({ compte: "706", credit: 40_000, debit: 0 });
    expect(ecriture.lignes[1]).toMatchObject({ compte: "521", debit: 40_000, credit: 0 });
  });

  it("isole la TVA récupérable d'un achat", () => {
    // 118 000 TTC à 18 % : 100 000 de charge, 18 000 de TVA.
    const ecriture = ecritureSaisieGuidee({
      journal: "AC",
      date: "2026-08-26",
      piece: "F-2026-88",
      libelle: "Achat de marchandises",
      compte: "601",
      libelleCompte: "Achats de marchandises",
      sens: "charge",
      montant: 118_000,
      tauxTvaBp: 1800,
    });

    expect(ecriture.lignes).toEqual([
      { compte: "601", libelleCompte: "Achats de marchandises", debit: 100_000, credit: 0 },
      { compte: "4451", libelleCompte: "TVA récupérable sur achats", debit: 18_000, credit: 0 },
      { compte: "401", libelleCompte: "Fournisseurs", debit: 0, credit: 118_000 },
    ]);
  });

  it("retombe exactement sur le montant de la pièce, même sur un TTC indivisible", () => {
    // 2 900 FCFA à 18 % ne se décompose pas en francs entiers. La TVA se déduit
    // du HT plutôt qu'elle ne se recalcule, sinon l'écriture perd un franc et
    // la balance ne tombe plus juste.
    const ecriture = ecritureSaisieGuidee({
      journal: "AC",
      date: "2026-08-26",
      piece: "F-2026-89",
      libelle: "Petite fourniture",
      compte: "605",
      libelleCompte: "Autres achats",
      sens: "charge",
      montant: 2_900,
      tauxTvaBp: 1800,
    });

    const debit = ecriture.lignes.reduce((somme, l) => somme + l.debit, 0);
    expect(debit).toBe(2_900);
  });

  it("refuse un journal sans contrepartie déduite", () => {
    // Sur OD se passent la paie et les amortissements : leur imputer la caisse
    // par défaut serait le plus sûr moyen de fausser la trésorerie.
    expect(() =>
      ecritureSaisieGuidee({
        journal: "OD",
        date: "2026-08-26",
        piece: "OD-1",
        libelle: "Salaires",
        compte: "661",
        libelleCompte: "Rémunérations",
        sens: "charge",
        montant: 500_000,
      }),
    ).toThrow(/contrepartie/);
  });

  it("refuse un montant nul", () => {
    expect(() =>
      ecritureSaisieGuidee({
        journal: "CA",
        date: "2026-08-26",
        piece: "OD-2",
        libelle: "Rien",
        compte: "605",
        libelleCompte: "Autres achats",
        sens: "charge",
        montant: 0,
      }),
    ).toThrow();
  });
});

/**
 * Trésorerie du tableau de bord.
 *
 * Le même argent est affiché à deux endroits : en tête du tableau de bord, et
 * dans la position comptable. Les deux doivent tomber sur le même franc. Un
 * écart n'apparaîtrait pas comme une erreur — il apparaîtrait comme deux
 * chiffres, et l'exploitant cesserait de croire les deux.
 */
describe("trésorerie du tableau de bord", () => {
  const COMPTES: SoldeCompte[] = [
    solde("521", 4_500_000, 1_200_000),
    solde("531", 800_000, 250_000),
    solde("571", 2_000_000, 1_750_000),
    // Valeurs mobilières de placement : classe 5 mais pas de la trésorerie
    // disponible. Ni l'un ni l'autre écran ne doit les compter.
    solde("501", 3_000_000, 0),
    solde("411", 1_400_000, 0),
  ];

  it("totalise exactement ce que compte la position comptable", () => {
    const total = tresorerie(COMPTES).reduce((s, ligne) => s + ligne.montant, 0);
    expect(total).toBe(positionComptable(COMPTES).tresorerie);
  });

  it("garde le signe d'un solde créditeur au lieu de le masquer", () => {
    // Une caisse créditrice est une erreur de saisie, pas un découvert. La
    // ramener à zéro ferait disparaître le seul indice qu'il y a un problème.
    const [, , caisse] = tresorerie([solde("571", 0, 150_000)]);
    expect(caisse.montant).toBe(-150_000);
  });

  it("range le mobile money du 5711 avec le mobile money, pas dans le tiroir", () => {
    const comptes = [solde("571", 100_000, 0), solde("5711", 20_000, 0)];
    const [, mobile, caisse] = tresorerie(comptes);
    expect(mobile.montant).toBe(20_000);
    expect(caisse.montant).toBe(100_000);
    // Rien ne se perd ni ne se compte deux fois.
    expect(mobile.montant + caisse.montant).toBe(positionComptable(comptes).tresorerie);
  });

  it("range le float du guichet (5712) avec le mobile money", () => {
    const comptes = [solde("571", 100_000, 0), solde("5711", 20_000, 0), solde("5712", 1_000_000, 0)];
    const [, mobile, caisse] = tresorerie(comptes);
    expect(mobile.montant).toBe(1_020_000);
    expect(caisse.montant).toBe(100_000);
  });
});
