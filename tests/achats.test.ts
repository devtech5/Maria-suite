import { describe, expect, it } from "vitest";

import { estEquilibree } from "@/lib/comptabilite/ecritures";
import { presetRole, resoudreDroits } from "@/lib/droits/catalogue";
import { categorieAction, moduleAction } from "@/lib/journal";
import { alertes } from "@/lib/tableau-de-bord";
import {
  echeanceParDefaut,
  ecartsFacture,
  ecritureFactureFournisseur,
  ecritureReglementFournisseur,
  etatDette,
  montantHt,
  refusReception,
  refusReglement,
  resteARecevoir,
  statutApresReception,
  totaux,
  type LigneAchat,
} from "@/modules/achats/calcul";

const ciment: LigneAchat = { designation: "Ciment CPJ 45", quantite: 20_000, prixUnitaireHt: 4_500, tauxTva: 1800, compteAchat: "601" };
const transport: LigneAchat = { designation: "Transport", quantite: 1_000, prixUnitaireHt: 15_000, tauxTva: 0, compteAchat: "611" };
const ligne = (e: { lignes: { compte: string; debit: number; credit: number }[] }, compte: string) => e.lignes.find((l) => l.compte === compte);

describe("montants d'achat", () => {
  it("calcule le HT d'une ligne en millièmes", () => {
    expect(montantHt(ciment)).toBe(90_000);
    expect(montantHt({ quantite: 2_500, prixUnitaireHt: 1_000 })).toBe(2_500);
  });

  it("lit les totaux dans l'écriture, TVA par taux", () => {
    expect(totaux([ciment, transport])).toEqual({ totalHt: 105_000, totalTva: 16_200, totalTtc: 121_200 });
    expect(totaux([])).toEqual({ totalHt: 0, totalTva: 0, totalTtc: 0 });
  });
});

describe("écritures fournisseur", () => {
  it("passe la facture en 6xx et TVA au débit, 401 au crédit", () => {
    const e = ecritureFactureFournisseur({ numero: "FF-2026-00001", date: "2026-10-04", fournisseur: "Cimaf", compteAuxiliaire: "401CIM", lignes: [ciment, transport] });
    expect(estEquilibree(e)).toBe(true);
    expect(e.journal).toBe("AC");
    expect(ligne(e, "601")?.debit).toBe(90_000);
    expect(ligne(e, "611")?.debit).toBe(15_000);
    expect(ligne(e, "4451")?.debit).toBe(16_200);
    expect(ligne(e, "401")?.credit).toBe(121_200);
    expect(e.lignes.find((l) => l.compte === "401")?.auxiliaire).toBe("401CIM");
  });

  it("refuse une facture sans ligne", () => {
    expect(() => ecritureFactureFournisseur({ numero: "F", date: "2026-10-04", fournisseur: "x", compteAuxiliaire: "401X", lignes: [] })).toThrow();
  });

  it("règle depuis le compte de trésorerie choisi", () => {
    const e = ecritureReglementFournisseur({
      numero: "RGF-2026-00001",
      date: "2026-10-05",
      fournisseur: "Cimaf",
      compteAuxiliaire: "401CIM",
      facture: "FA-1187",
      montant: 50_000,
      tresorerie: { numero: "5211", libelle: "SGBCI", journal: "BQ" },
    });
    expect(estEquilibree(e)).toBe(true);
    expect(e.journal).toBe("BQ");
    expect(ligne(e, "401")?.debit).toBe(50_000);
    expect(ligne(e, "5211")?.credit).toBe(50_000);
  });
});

describe("réception", () => {
  const lignes = [
    { id: "a", quantite: 20_000, recue: 5_000 },
    { id: "b", quantite: 1_000, recue: 0 },
  ];

  it("compte ce qui reste à recevoir", () => {
    expect(resteARecevoir(lignes[0])).toBe(15_000);
    expect(resteARecevoir({ id: "x", quantite: 1_000, recue: 1_500 })).toBe(0);
  });

  it("refuse une réception vide, inconnue ou au-delà du commandé", () => {
    expect(refusReception(lignes, {})).toMatch(/au moins une/);
    expect(refusReception(lignes, { z: 1_000 })).toMatch(/inconnue/);
    expect(refusReception(lignes, { a: 15_001 })).toMatch(/dépasse/);
    expect(refusReception(lignes, { a: -1 })).toMatch(/invalide/);
    expect(refusReception(lignes, { a: 15_000, b: 1_000 })).toBeNull();
  });

  it("passe la commande en reçue quand plus rien ne manque", () => {
    expect(statutApresReception([{ id: "a", quantite: 1_000, recue: 1_000 }])).toBe("recue");
    expect(statutApresReception([{ id: "a", quantite: 1_000, recue: 400 }])).toBe("partielle");
  });
});

describe("contrôle facture, commande, réception", () => {
  it("signale le plus facturé que reçu et le plus cher que commandé", () => {
    const ecarts = ecartsFacture([
      { designation: "Ciment", quantiteRecue: 20_000, prixCommande: 4_500, quantiteFacturee: 22_000, prixFacture: 4_500 },
      { designation: "Fer", quantiteRecue: 10_000, prixCommande: 6_000, quantiteFacturee: 10_000, prixFacture: 6_200 },
      { designation: "Sable", quantiteRecue: 5_000, prixCommande: 3_000, quantiteFacturee: 5_000, prixFacture: 2_900 },
    ]);
    expect(ecarts).toEqual([
      { designation: "Ciment", nature: "quantite", commande: 20_000, facture: 22_000 },
      { designation: "Fer", nature: "prix", commande: 6_000, facture: 6_200 },
    ]);
  });
});

describe("dettes", () => {
  it("place l'échéance par défaut à trente jours", () => {
    expect(echeanceParDefaut("2026-10-04")).toBe("2026-11-03");
    expect(echeanceParDefaut("2026-12-15", 45)).toBe("2027-01-29");
  });

  it("dit l'état d'une dette au jour donné", () => {
    expect(etatDette(0, "2026-10-01", "2026-10-04")).toBe("soldee");
    expect(etatDette(10_000, "2026-10-01", "2026-10-04")).toBe("echue");
    expect(etatDette(10_000, "2026-10-10", "2026-10-04")).toBe("bientot");
    expect(etatDette(10_000, "2026-11-10", "2026-10-04")).toBe("a_payer");
  });

  it("refuse un règlement qui dépasse le reste dû", () => {
    expect(refusReglement(10_000, 10_001)).toMatch(/dépasse/);
    expect(refusReglement(10_000, 0)).toBe("Montant invalide.");
    expect(refusReglement(10_000, 10_000)).toBeNull();
  });
});

describe("branchements", () => {
  it("lève les alertes d'achats au tableau de bord", () => {
    const liste = alertes(
      { enRetard: 0, montantEnRetard: 0 },
      { ruptures: 0, aCommanderVite: 0, valeur: 0 },
      { echeancesDepassees: 0, indisponibles: 0 },
      { enRetard: 0, echouees: 0 },
      undefined,
      undefined,
      undefined,
      { facturesEchues: 2, montantEchu: 150_000, aPayerSous7Jours: 1, livraisonsEnRetard: 3 },
    );
    expect(liste.find((a) => a.id === "fournisseurs-echus")?.gravite).toBe("critique");
    expect(liste.find((a) => a.id === "fournisseurs-semaine")?.nombre).toBe(1);
    expect(liste.find((a) => a.id === "livraisons-retard")?.nombre).toBe(3);
  });

  it("range les gestes d'achat au journal", () => {
    expect(moduleAction("facture_fournisseur.regler")).toBe("Achats");
    expect(categorieAction("reception_achat.recevoir")).toBe("creation");
    expect(categorieAction("commande_achat.annuler")).toBe("suppression");
  });

  it("donne la réception au magasinier, la facture et le règlement au comptable", () => {
    const magasinier = resoudreDroits({ cleRole: "magasinier", estProprietaire: false });
    expect(magasinier.has("achats.reception.saisir")).toBe(true);
    expect(magasinier.has("achats.reglement.payer")).toBe(false);
    const comptable = resoudreDroits({ cleRole: "comptable", estProprietaire: false });
    expect(comptable.has("achats.facture.saisir")).toBe(true);
    expect(comptable.has("achats.commande.gerer")).toBe(false);
    expect(presetRole("gerant")?.droits).toContain("achats.commande.gerer");
  });
});
