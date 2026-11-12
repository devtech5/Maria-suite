import { describe, expect, it } from "vitest";

import {
  ecritureBonPaiement,
  estEquilibree,
  totalDebit,
} from "@/lib/comptabilite/ecritures";
import { montantLigne, versQuantite } from "@/lib/quantite";
import {
  BAREME_CI,
  calculerBulletin,
  impotSurSalaire,
  joursAvantTerme,
} from "@/modules/personnes/paie";

const salarie = (salaireBase: number) => ({
  id: "e1",
  matricule: "S0001",
  nom: "Koffi Bernard",
  salaireBase,
});

describe("bulletin de paie", () => {
  /**
   * Le seul test qui compte vraiment. La capture marketing du concurrent
   * affiche un net SUPÉRIEUR au brut sur chacune de ses lignes : 120 000 de
   * brut, 13 420 de retenues, 132 000 de net.
   */
  it("le net est toujours inférieur au brut", () => {
    for (const brut of [75_000, 120_000, 165_000, 450_000, 3_000_000, 5_000_000]) {
      const bulletin = calculerBulletin(salarie(brut));
      expect(bulletin.net).toBeLessThan(bulletin.brut);
      expect(bulletin.net).toBeGreaterThan(0);
    }
  });

  it("la cascade retombe exactement sur le net", () => {
    const bulletin = calculerBulletin(salarie(450_000));
    expect(bulletin.brut - bulletin.cotisationsSalariales - bulletin.impot).toBe(
      bulletin.net,
    );
  });

  it("le coût employeur est le brut augmenté des charges patronales", () => {
    const bulletin = calculerBulletin(salarie(320_000));
    expect(bulletin.coutTotal).toBe(bulletin.brut + bulletin.chargesPatronales);
    expect(bulletin.coutTotal).toBeGreaterThan(bulletin.brut);
  });

  it("toutes les composantes sont des entiers", () => {
    for (const brut of [75_001, 123_457, 249_999, 801_111]) {
      const bulletin = calculerBulletin(salarie(brut));
      for (const valeur of [
        bulletin.cotisationsSalariales,
        bulletin.impot,
        bulletin.net,
        bulletin.chargesPatronales,
        bulletin.coutTotal,
      ]) {
        expect(Number.isInteger(valeur)).toBe(true);
      }
    }
  });

  /**
   * Le plafond porte sur la retraite, PAS sur les prestations familiales ni
   * sur l'accident du travail. L'appliquer partout sous-déclarerait les
   * charges patronales des hauts salaires, et l'écart ne se verrait qu'au
   * contrôle.
   */
  it("la retraite est plafonnée, les autres charges ne le sont pas", () => {
    const auPlafond = calculerBulletin(salarie(BAREME_CI.cnpsPlafondMensuel));
    const auDessus = calculerBulletin(salarie(BAREME_CI.cnpsPlafondMensuel * 2));

    expect(auDessus.cotisationsSalariales).toBe(auPlafond.cotisationsSalariales);
    expect(auDessus.chargesPatronales).toBeGreaterThan(auPlafond.chargesPatronales);
  });

  it("un salaire nul ne produit ni retenue ni impôt", () => {
    const bulletin = calculerBulletin(salarie(0));
    expect(bulletin.cotisationsSalariales).toBe(0);
    expect(bulletin.impot).toBe(0);
    expect(bulletin.net).toBe(0);
  });
});

describe("impôt sur les salaires", () => {
  it("exonère jusqu'au premier seuil", () => {
    expect(impotSurSalaire(0)).toBe(0);
    expect(impotSurSalaire(75_000)).toBe(0);
  });

  it("est continu au passage de chaque tranche", () => {
    // Un barème par tranches qui saute à la frontière ferait perdre de l'argent
    // à un collaborateur augmenté d'un franc.
    for (const seuil of [75_000, 240_000, 800_000]) {
      const avant = impotSurSalaire(seuil);
      const apres = impotSurSalaire(seuil + 1);
      expect(apres - avant).toBeLessThanOrEqual(1);
      expect(apres).toBeGreaterThanOrEqual(avant);
    }
  });

  it("croît avec la base imposable", () => {
    let precedent = 0;
    for (let base = 0; base <= 1_200_000; base += 25_000) {
      const impot = impotSurSalaire(base);
      expect(impot).toBeGreaterThanOrEqual(precedent);
      precedent = impot;
    }
  });
});

describe("échéance de contrat", () => {
  const aujourdhui = new Date("2026-08-26T09:00:00Z");

  it("un contrat sans terme n'a pas d'échéance", () => {
    expect(joursAvantTerme(null, aujourdhui)).toBeNull();
  });

  it("compte les jours restants, et le retard en négatif", () => {
    expect(joursAvantTerme("2026-08-31", aujourdhui)).toBe(5);
    expect(joursAvantTerme("2026-08-26", aujourdhui)).toBe(0);
    expect(joursAvantTerme("2026-07-31", aujourdhui)).toBe(-26);
  });

  /** L'heure de la journée ne doit pas déplacer une échéance d'un jour. */
  it("ne dépend pas de l'heure du jour", () => {
    expect(joursAvantTerme("2026-09-30", new Date("2026-08-26T23:30:00Z"))).toBe(
      joursAvantTerme("2026-09-30", new Date("2026-08-26T00:10:00Z")),
    );
  });
});

describe("pointage d'un intervenant", () => {
  /**
   * Le taux est en francs par unité entière, la quantité en millièmes : la
   * division par mille se fait UNE fois, à la fin.
   */
  it("chiffre une quantité pointée sans dériver", () => {
    expect(montantLigne(8_000, versQuantite(18))).toBe(144_000);
    expect(montantLigne(3_500, versQuantite(62))).toBe(217_000);
    expect(montantLigne(1_200, versQuantite(210))).toBe(252_000);
  });

  it("un demi-jour pointé se paie la moitié", () => {
    expect(montantLigne(9_000, versQuantite(0.5))).toBe(4_500);
  });

  /** Une correction annule exactement le pointage qu'elle reprend. */
  it("un pointage négatif défait le précédent au franc près", () => {
    const quantite = versQuantite(7);
    expect(montantLigne(5_000, quantite) + montantLigne(5_000, -quantite)).toBe(0);
  });
});

describe("bon de paiement", () => {
  const bon = {
    numero: "BP-00001",
    date: "2026-08-26",
    intervenant: "I0001 Ouattara Ibrahim",
    montant: 96_000,
  };

  it("débite le personnel extérieur et crédite la trésorerie", () => {
    const ecriture = ecritureBonPaiement({ ...bon, moyen: "especes" });

    expect(estEquilibree(ecriture)).toBe(true);
    expect(totalDebit(ecriture)).toBe(96_000);
    expect(ecriture.lignes[0].compte).toBe("637");
    expect(ecriture.lignes[1].compte).toBe("571");
    expect(ecriture.journal).toBe("CA");
  });

  /**
   * La charge d'un intervenant ne se ventile PAS comme un salaire : la classe
   * 66 est celle du personnel déclaré, et l'y mêler gonflerait la masse
   * salariale de gens absents de toute déclaration CNPS.
   */
  it("n'impute jamais un intervenant en charges de personnel collaborateur", () => {
    const ecriture = ecritureBonPaiement({ ...bon, moyen: "mobile_money" });
    for (const ligne of ecriture.lignes) {
      expect(ligne.compte.startsWith("66")).toBe(false);
    }
  });

  it("le mobile money sort de son propre compte de trésorerie", () => {
    const ecriture = ecritureBonPaiement({ ...bon, moyen: "mobile_money" });
    expect(ecriture.lignes[1].compte).toBe("5711");
    expect(ecriture.journal).toBe("CA");
  });

  it("un virement passe par le journal de banque", () => {
    const ecriture = ecritureBonPaiement({ ...bon, moyen: "banque" });
    expect(ecriture.lignes[1].compte).toBe("521");
    expect(ecriture.journal).toBe("BQ");
  });

  it("refuse un versement sans montant", () => {
    expect(() => ecritureBonPaiement({ ...bon, montant: 0, moyen: "especes" })).toThrow();
    expect(() =>
      ecritureBonPaiement({ ...bon, montant: -5_000, moyen: "especes" }),
    ).toThrow();
  });
});
