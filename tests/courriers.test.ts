import { describe, expect, it } from "vitest";

import {
  bornerTaille,
  dateEnLettres,
  estPoliceCourrier,
  lieuEtDate,
  lignesDe,
  paragraphesDe,
  POLICES_COURRIER,
  TAILLE_MAX,
  TAILLE_MIN,
  tailleLisible,
  taillesCourrier,
  tailleVoisine,
} from "@/modules/documents/courriers-calcul";

describe("corps d'un courrier", () => {
  it("fait d'une ligne non vide un paragraphe, quel que soit le nombre de sauts", () => {
    expect(paragraphesDe("Madame,\n\n\nNous avons l'honneur…\r\nVeuillez agréer…\n")).toEqual([
      "Madame,",
      "Nous avons l'honneur…",
      "Veuillez agréer…",
    ]);
  });

  it("resserre les espaces sans toucher au texte", () => {
    expect(paragraphesDe("  Un   texte\tlong  ")).toEqual(["Un texte long"]);
  });

  it("rend un corps blanc vide : il ne passera pas la validation", () => {
    expect(paragraphesDe(" \n\t\n")).toEqual([]);
  });

  it("garde une balise saisie comme du texte", () => {
    // Le découpage ne transforme rien : React échappe ensuite le morceau.
    expect(paragraphesDe("<script>alert(1)</script>")).toEqual(["<script>alert(1)</script>"]);
  });

  it("découpe le destinataire en lignes", () => {
    expect(lignesDe("Monsieur le Directeur\n\nSOCOCE\n Yopougon ")).toEqual(["Monsieur le Directeur", "SOCOCE", "Yopougon"]);
    expect(lignesDe(null)).toEqual([]);
  });
});

describe("date d'une lettre", () => {
  it("écrit le mois en lettres", () => {
    expect(dateEnLettres("2026-10-16")).toBe("16 octobre 2026");
    expect(dateEnLettres("2026-08-09")).toBe("9 août 2026");
  });

  it("écrit le premier du mois « 1er »", () => {
    expect(dateEnLettres("2027-01-01")).toBe("1er janvier 2027");
  });

  it("ne décale pas la date : pas d'objet Date, donc pas de fuseau", () => {
    expect(dateEnLettres("2026-12-31")).toBe("31 décembre 2026");
  });

  it("rend telle quelle une saisie illisible", () => {
    expect(dateEnLettres("16/10/2026")).toBe("16/10/2026");
    expect(dateEnLettres("2026-13-01")).toBe("2026-13-01");
  });

  it("compose la ligne de lieu et de date", () => {
    expect(lieuEtDate("Abidjan", "2026-10-16")).toBe("Abidjan, le 16 octobre 2026");
    expect(lieuEtDate(" ", "2026-10-16")).toBe("Le 16 octobre 2026");
  });
});

describe("police et taille d'un courrier", () => {
  it("ne reconnaît que les polices proposées", () => {
    expect(estPoliceCourrier("times")).toBe(true);
    expect(estPoliceCourrier("comic")).toBe(false);
    expect(estPoliceCourrier("toString")).toBe(false);
    expect(estPoliceCourrier(null)).toBe(false);
  });

  it("garde chaque taille conseillée dans les bornes", () => {
    for (const p of Object.values(POLICES_COURRIER)) {
      expect(p.tailleConseillee).toBeGreaterThanOrEqual(TAILLE_MIN);
      expect(p.tailleConseillee).toBeLessThanOrEqual(TAILLE_MAX);
    }
  });

  it("avance d'un demi-point, en se calant d'abord sur la grille", () => {
    expect(tailleVoisine(865, 1)).toBe(900);
    expect(tailleVoisine(865, -1)).toBe(850);
    expect(tailleVoisine(1000, 1)).toBe(1050);
    expect(tailleVoisine(1000, -1)).toBe(950);
  });

  it("ne sort jamais des bornes", () => {
    expect(tailleVoisine(TAILLE_MAX, 1)).toBe(TAILLE_MAX);
    expect(tailleVoisine(TAILLE_MIN, -1)).toBe(TAILLE_MIN);
    expect(bornerTaille(99_999)).toBe(TAILLE_MAX);
    expect(bornerTaille(Number.NaN)).toBe(865);
  });

  it("écrit la taille à la française", () => {
    expect(tailleLisible(865)).toBe("8,65 pt");
    expect(tailleLisible(850)).toBe("8,5 pt");
    expect(tailleLisible(1100)).toBe("11 pt");
  });

  it("dérive les tailles du modèle de celle du corps", () => {
    expect(taillesCourrier(865)).toEqual({ corps: "8.65pt", titre: "9pt", reference: "8pt" });
    expect(taillesCourrier(1100).corps).toBe("11pt");
  });
});
