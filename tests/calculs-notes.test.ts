import { describe, expect, it } from "vitest";

import {
  calculerNote,
  chiffrer,
  cleCarreau,
  libelleCle,
  lignesResultat,
  materiauxDe,
  montantMateriau,
  quantiteLisible,
  refusArticle,
  uniteCle,
  type ArticleChiffrage,
} from "@/modules/calculs/notes";
import { REGLAGES_DEFAUT } from "@/modules/calculs/regles";

const R = REGLAGES_DEFAUT;
const dalle = { ouvrage: "dalle", longueurMm: 5000, largeurMm: 4000, hauteurMm: 120, nombre: 1, diametreFer: 10 };

describe("relecture de la saisie", () => {
  it("refait le calcul depuis la saisie, sans croire un résultat envoyé", () => {
    const c = calculerNote("beton", { ...dalle, resultat: { sacsCiment: 1 } }, R);
    expect(c.type).toBe("beton");
    if (c.type === "beton") expect(c.resultat.sacsCiment).toBe(18);
    expect(c.saisie).not.toHaveProperty("resultat");
  });

  it("refuse une saisie incomplète, un flottant ou un choix inconnu", () => {
    expect(() => calculerNote("beton", { ...dalle, longueurMm: undefined }, R)).toThrow(/Longueur/);
    expect(() => calculerNote("beton", { ...dalle, longueurMm: 5000.5 }, R)).toThrow(/Longueur/);
    expect(() => calculerNote("beton", { ...dalle, ouvrage: "piscine" }, R)).toThrow(/Ouvrage/);
    expect(() => calculerNote("beton", { ...dalle, diametreFer: 11 }, R)).toThrow(/Diamètre/);
    expect(() => calculerNote("carrelage", { pose: "plots" }, R)).toThrow();
    expect(() => calculerNote("inconnu" as never, {}, R)).toThrow(/inconnu/);
  });

  it("relit les calculs sans matériaux", () => {
    expect(calculerNote("pente", { longueurMm: 5000, hauteurMm: 100, penteCentiemes: null }, R).resultat).toMatchObject({ penteCentiemes: 200 });
    expect(calculerNote("escalier", { hauteurMm: 2800, marcheVoulueMm: null, reculementMm: null }, R).resultat).toMatchObject({ marches: 16 });
    expect(calculerNote("equerre", { aMm: 3000, bMm: 4000, diagonaleMesureeMm: null }, R).resultat).toMatchObject({ diagonaleMm: 5000 });
  });
});

describe("matériaux à acheter", () => {
  it("dalle : sacs de ciment, m³ de sable et de gravier, barres de fer", () => {
    const m = materiauxDe(calculerNote("beton", dalle, R), R);
    expect(m.map((x) => [x.cle, x.quantite, x.unite])).toEqual([
      ["ciment", 18_000, "piece"],
      ["sable", 1_008, "m3"],
      ["gravier", 2_016, "m3"],
      ["fer_ha10", 30_000, "piece"],
    ]);
  });

  it("sans diamètre, le fer se commande en kg ; sans fer, il n'apparaît pas", () => {
    const sansDiametre = materiauxDe(calculerNote("beton", { ...dalle, diametreFer: null }, R), R);
    expect(sansDiametre.at(-1)).toEqual({ cle: "fer", designation: "Fer à béton", quantite: 216_000, unite: "kg" });
    const proprete = materiauxDe(calculerNote("beton", { ...dalle, ouvrage: "proprete" }, R), R);
    expect(proprete.map((x) => x.cle)).toEqual(["ciment", "sable", "gravier"]);
  });

  it("mur d'agglos et carrelage", () => {
    const mur = materiauxDe(calculerNote("maconnerie", { agglo: "creux_15", longueurMm: 10_000, hauteurMm: 2_800, ouvertures: [] }, R), R);
    expect(mur.map((x) => [x.cle, x.quantite])).toEqual([
      ["agglo_creux_15", 368_000],
      ["ciment", 4_000],
      ["sable", 504],
    ]);
    const sol = materiauxDe(
      calculerNote("carrelage", { longueurMm: 4000, largeurMm: 3500, carreauLongueurMm: 600, carreauLargeurMm: 600, parCarton: 4, pose: "colle", plinthes: false }, R),
      R,
    );
    expect(sol.map((x) => [x.cle, x.quantite])).toEqual([
      ["carreau_600x600", 11_000],
      ["colle", 3_000],
    ]);
  });

  it("aucun matériau pour la géométrie", () => {
    expect(materiauxDe(calculerNote("pente", { longueurMm: 5000, hauteurMm: 100, penteCentiemes: null }, R), R)).toEqual([]);
  });

  it("nomme et range chaque clé dans son unité d'achat", () => {
    expect(libelleCle("fer_ha12")).toBe("Fer HA12 (barre)");
    expect(libelleCle(cleCarreau(600, 300))).toBe("Carreau 30 × 60 cm (carton)");
    expect(uniteCle("sable")).toBe("m3");
    expect(uniteCle("fer")).toBe("kg");
    expect(uniteCle("agglo_creux_20")).toBe("piece");
  });
});

describe("chiffrage", () => {
  const ciment: ArticleChiffrage = { id: "a1", designation: "Ciment CPJ 42,5", unite: "piece", prixVente: 5_500, prixAchat: 4_900 };
  const sableKg: ArticleChiffrage = { id: "a2", designation: "Sable lagunaire", unite: "kg", prixVente: 10, prixAchat: 8 };
  const sable: ArticleChiffrage = { id: "a3", designation: "Sable lagunaire", unite: "m3", prixVente: 12_000, prixAchat: 9_000 };

  it("quantité en millièmes × prix, arrondi au franc", () => {
    expect(montantMateriau(18_000, 5_500)).toBe(99_000);
    expect(montantMateriau(1_008, 12_000)).toBe(12_096);
    expect(montantMateriau(1_001, 333)).toBe(333);
  });

  it("refuse un article absent ou d'une autre unité", () => {
    const m = { cle: "sable", designation: "Sable", quantite: 1_008, unite: "m3" as const };
    expect(refusArticle(m, null)).toMatch(/Aucun article/);
    expect(refusArticle(m, sableKg)).toMatch(/se compte en kg/);
    expect(refusArticle(m, sable)).toBeNull();
  });

  it("chiffre au prix de vente ou d'achat ; une ligne refusée vaut zéro", () => {
    const m = materiauxDe(calculerNote("beton", { ...dalle, diametreFer: null }, R), R);
    const parCle: Record<string, ArticleChiffrage> = { ciment, sable: sableKg };
    const vente = chiffrer(m, (cle) => parCle[cle] ?? null, "vente");
    expect(vente.lignes.map((l) => l.montant)).toEqual([99_000, 0, 0, 0]);
    expect(vente.lignes[1].refus).toMatch(/kg/);
    expect(vente.total).toBe(99_000);
    expect(chiffrer(m, (cle) => (cle === "ciment" ? ciment : null), "achat").total).toBe(88_200);
  });

  it("affiche une quantité dans son unité", () => {
    expect(quantiteLisible({ quantite: 18_000, unite: "piece" })).toBe("18");
    expect(quantiteLisible({ quantite: 1_008, unite: "m3" })).toBe("1,008 m³");
    expect(quantiteLisible({ quantite: 2_500, unite: "kg" })).toBe("2,5 kg");
  });
});

describe("affichage", () => {
  it("les lignes du résultat sont celles de l'écran", () => {
    const l = lignesResultat(calculerNote("beton", dalle, R), R);
    expect(l.find((x) => x.libelle === "Ciment")?.valeur).toBe("18 sacs de 50 kg");
    expect(l.find((x) => x.libelle === "Barres HA10")?.valeur).toBe("30 barres de 12 m");
  });
});
