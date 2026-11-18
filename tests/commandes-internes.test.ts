import { describe, expect, it } from "vitest";

import { lireLignes, montantLigne, regrouperParRubrique, totalCommande, type LigneCommandeInterne } from "@/modules/tresorerie/commandes-internes";

/** Le budget d'équipement de novembre 2026 : 1 410 000 F. */
const BUDGET: LigneCommandeInterne[] = [
  { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Technicien", quantite: 1, prixUnitaire: 300_000 },
  { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Assistant", quantite: 1, prixUnitaire: 300_000 },
  { rubrique: "Achat de téléphones", designation: "Téléphone — poste Commercial", quantite: 1, prixUnitaire: 50_000 },
  { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Commercial", quantite: 1, prixUnitaire: 300_000 },
  { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Informaticien", quantite: 1, prixUnitaire: 300_000 },
  { rubrique: "Achat de téléphones", designation: "Téléphone — poste Assistant", quantite: 1, prixUnitaire: 50_000 },
  { rubrique: "Abonnement flotte Orange", designation: "Numéros Orange — 2 mois d'avance", quantite: 11, prixUnitaire: 10_000 },
];

describe("bon de commande interne : calcul", () => {
  it("multiplie quantité et prix unitaire", () => {
    expect(montantLigne({ quantite: 11, prixUnitaire: 10_000 })).toBe(110_000);
  });

  it("totalise le budget d'équipement à 1 410 000 F", () => {
    expect(totalCommande(BUDGET)).toBe(1_410_000);
  });

  it("regroupe par rubrique dans l'ordre d'apparition, sous-totaux exacts", () => {
    const groupes = regrouperParRubrique(BUDGET);
    expect(groupes.map((g) => [g.rubrique, g.lignes.length, g.sousTotal])).toEqual([
      ["Achat d'ordinateurs", 4, 1_200_000],
      ["Achat de téléphones", 2, 100_000],
      ["Abonnement flotte Orange", 1, 110_000],
    ]);
    expect(groupes.reduce((s, g) => s + g.sousTotal, 0)).toBe(totalCommande(BUDGET));
  });

  it("refuse un montant de ligne hors des entiers sûrs", () => {
    expect(() => montantLigne({ quantite: 1_000_000, prixUnitaire: Number.MAX_SAFE_INTEGER })).toThrow();
  });
});

describe("bon de commande interne : lecture de la saisie", () => {
  it("accepte les nombres saisis avec espaces et ignore les lignes vides", () => {
    const r = lireLignes([
      { rubrique: " Achat de téléphones ", designation: "Téléphone", quantite: "2", prixUnitaire: "50 000" },
      { rubrique: "", designation: "", quantite: "", prixUnitaire: "" },
    ]);
    expect(r).toEqual([{ rubrique: "Achat de téléphones", designation: "Téléphone", quantite: 2, prixUnitaire: 50_000 }]);
  });

  it("refuse une quantité décimale ou nulle", () => {
    expect(lireLignes([{ designation: "Rame", quantite: "1,5", prixUnitaire: "3000" }])).toMatch(/Ligne 1 : quantité/);
    expect(lireLignes([{ designation: "Rame", quantite: "0", prixUnitaire: "3000" }])).toMatch(/Ligne 1 : quantité/);
  });

  it("refuse un prix décimal", () => {
    expect(lireLignes([{ designation: "Stylo", quantite: "1", prixUnitaire: "150.5" }])).toMatch(/prix unitaire/);
  });

  it("exige une désignation quand la ligne est entamée", () => {
    expect(lireLignes([{ designation: "", quantite: "3", prixUnitaire: "100" }])).toMatch(/désignation manquante/);
  });

  it("refuse un bon vide ou à zéro franc", () => {
    expect(lireLignes([])).toMatch(/au moins une ligne/);
    expect(lireLignes([{ designation: "Don", quantite: "1", prixUnitaire: "0" }])).toMatch(/zéro franc/);
  });

  it("refuse ce qui n'est pas une liste", () => {
    expect(lireLignes("n'importe quoi")).toBe("Lignes illisibles.");
  });
});
