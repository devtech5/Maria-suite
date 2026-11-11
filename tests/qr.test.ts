import { describe, expect, it } from "vitest";

import { encoderQr, qrEnSvg } from "@/lib/qr";

/**
 * Encodeur QR. Vérifié à son écriture contre un décodeur indépendant
 * (OpenCV) sur des textes de 5 à 640 octets, accents compris ; ces tests
 * figent ce qu'un décodeur exige d'abord : la structure.
 */

function repere(m: boolean[][], x0: number, y0: number): boolean {
  // Un motif de position : anneau sombre de 7, anneau clair, carré sombre de 3.
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const bord = x === 0 || y === 0 || x === 6 || y === 6;
      const centre = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (m[y0 + y][x0 + x] !== (bord || centre)) return false;
    }
  return true;
}

describe("encoderQr", () => {
  it("choisit la plus petite version qui contient le texte", () => {
    expect(encoderQr("HELLO").version).toBe(1);
    expect(encoderQr("https://maria-suite.cloud/visiteurs/badge/AbC123xyz").version).toBe(4);
    expect(encoderQr("x".repeat(140)).version).toBe(8);
  });

  it("dessine une matrice carrée de 4 × version + 17 modules", () => {
    for (const texte of ["a", "x".repeat(100), "é".repeat(200)]) {
      const qr = encoderQr(texte);
      expect(qr.taille).toBe(qr.version * 4 + 17);
      expect(qr.modules).toHaveLength(qr.taille);
      for (const ligne of qr.modules) expect(ligne).toHaveLength(qr.taille);
    }
  });

  it("pose les trois motifs de position et la ligne de synchronisation", () => {
    const { modules: m, taille } = encoderQr("V-2026-00042");
    expect(repere(m, 0, 0)).toBe(true);
    expect(repere(m, taille - 7, 0)).toBe(true);
    expect(repere(m, 0, taille - 7)).toBe(true);
    for (let i = 8; i < taille - 8; i++) expect(m[6][i]).toBe(i % 2 === 0);
    // Le module toujours sombre, sous le repère du bas.
    expect(m[taille - 8][8]).toBe(true);
  });

  it("encode en UTF-8, et un même texte donne toujours le même dessin", () => {
    expect(encoderQr("Siège Cocody").modules).toEqual(encoderQr("Siège Cocody").modules);
    expect(encoderQr("Siège").modules).not.toEqual(encoderQr("Siege").modules);
  });

  it("refuse un texte trop long pour un QR", () => {
    expect(() => encoderQr("x".repeat(3000), "H")).toThrow(/trop long/);
  });

  it("rend un SVG avec sa zone de silence", () => {
    const svg = qrEnSvg("HELLO");
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 29 29"/);
    expect(svg).toContain('fill="#fff"');
  });
});
