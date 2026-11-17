import { describe, expect, it } from "vitest";

import { calculerNotesAnnexes, ORDRE_LIASSE } from "@/lib/comptabilite/notes";
import { aReprendre, LONGUEUR_MAX_NOTE, NOTES_A_REDIGER, noteRedigee, verifierRedaction } from "@/lib/comptabilite/notes-redigees";

/**
 * Notes annexes rédigées par le comptable (lot 3) : ce que les écritures ne
 * portent pas — sûretés, méthodes, engagements, informations sociales.
 */

const VIDE = { bilanN: [], bilanN1: [], mouvementsN: [], mouvementsN1: [] };
const LOT_2 = ["13", "27B", "31"];

describe("notes rédigées", () => {
  it("les trois lots couvrent toute la liasse, chaque note une seule fois", () => {
    const numeros = [...calculerNotesAnnexes(VIDE, "2026").map((n) => n.numero), ...LOT_2, ...NOTES_A_REDIGER.map((n) => n.numero)];
    expect(new Set(numeros).size).toBe(numeros.length);
    expect([...numeros].sort()).toEqual([...ORDRE_LIASSE].sort());
  });

  it("exige un texte, ou « néant » sans texte", () => {
    expect(verifierRedaction({ numero: "1", texte: "Hypothèque sur le terrain de Yopougon au profit de la SGCI.", neant: false })).toBeNull();
    expect(verifierRedaction({ numero: "1", texte: "", neant: true })).toBeNull();
    expect(verifierRedaction({ numero: "1", texte: "   ", neant: false })).toMatch(/texte/i);
    expect(verifierRedaction({ numero: "1", texte: "Un texte", neant: true })).toMatch(/néant/i);
    expect(verifierRedaction({ numero: "7", texte: "Clients", neant: false })).toMatch(/note/i);
    expect(verifierRedaction({ numero: "2", texte: "x".repeat(LONGUEUR_MAX_NOTE + 1), neant: false })).toMatch(/long/i);
  });

  it("imprime le texte paragraphe par paragraphe", () => {
    const n = noteRedigee("2", { numero: "2", texte: "Conformité au SYSCOHADA révisé.\n\n\n  Stocks évalués au coût moyen pondéré.  \n", neant: false });
    expect(n.titre).toBe("Informations obligatoires");
    expect(n.texte).toEqual(["Conformité au SYSCOHADA révisé.", "Stocks évalués au coût moyen pondéré."]);
    expect(n.vide).toBe(false);
    expect(n.aRediger).toBe(false);
  });

  it("une note déclarée néant s'imprime « néant », une note absente est signalée à rédiger", () => {
    expect(noteRedigee("1", { numero: "1", texte: "", neant: true }).vide).toBe(true);
    const absente = noteRedigee("35", undefined);
    expect(absente.aRediger).toBe(true);
    expect(absente.texte).toEqual([]);
  });

  it("reprend de l'exercice précédent les seules notes pas encore rédigées", () => {
    const precedentes = [
      { numero: "2", texte: "Méthodes 2025", neant: false },
      { numero: "1", texte: "", neant: true },
      { numero: "35", texte: "RSE 2025", neant: false },
    ];
    const actuelles = [{ numero: "35", texte: "RSE 2026", neant: false }];
    expect(aReprendre(precedentes, actuelles).map((r) => r.numero)).toEqual(["1", "2"]);
  });
});
