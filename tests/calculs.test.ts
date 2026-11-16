import { describe, expect, it } from "vitest";

import {
  REGLAGES_DEFAUT,
  calculerBeton,
  calculerCarrelage,
  calculerEquerre,
  calculerEscalier,
  calculerMaconnerie,
  calculerPente,
  centimetresEnMm,
  formatEchelle,
  lireDecimal,
  metresEnMm,
  normaliserReglages,
  racineArrondie,
  verifierReglages,
} from "@/modules/calculs/regles";

const R = REGLAGES_DEFAUT;

function tousEntiers(o: object) {
  for (const [k, v] of Object.entries(o)) {
    if (v === null || typeof v === "string") continue;
    expect(Number.isSafeInteger(v), `${k} = ${v}`).toBe(true);
  }
}

describe("saisie sans flottant", () => {
  it("lit les mètres et les centimètres en millimètres", () => {
    expect(metresEnMm("3,25")).toBe(3250);
    expect(metresEnMm("3.25")).toBe(3250);
    expect(metresEnMm("12")).toBe(12000);
    expect(metresEnMm("0,005")).toBe(5);
    expect(centimetresEnMm("60")).toBe(600);
    expect(centimetresEnMm("2,5")).toBe(25);
    expect(lireDecimal("1,5", 2)).toBe(150);
  });

  it("refuse ce qui n'est pas un nombre positif à la bonne précision", () => {
    expect(metresEnMm("1,2345")).toBeNull();
    expect(metresEnMm("-1")).toBeNull();
    expect(metresEnMm("abc")).toBeNull();
    expect(metresEnMm("")).toBeNull();
    expect(centimetresEnMm("2,55")).toBeNull();
  });

  it("affiche un entier mis à l'échelle sans dériver", () => {
    expect(formatEchelle(3250, 3)).toBe("3,25");
    expect(formatEchelle(5000, 3)).toBe("5");
    expect(formatEchelle(150, 2)).toBe("1,5");
    expect(formatEchelle(-1005, 3)).toBe("-1,005");
  });

  it("tire la racine entière au plus proche", () => {
    expect([BigInt(0), BigInt(1), BigInt(2), BigInt(3), BigInt(6), BigInt(8), BigInt(25)].map(racineArrondie)).toEqual([BigInt(0), BigInt(1), BigInt(1), BigInt(2), BigInt(2), BigInt(3), BigInt(5)]);
    expect(racineArrondie(BigInt(25_000_000) + BigInt(10_000))).toBe(BigInt(5001));
  });
});

describe("béton", () => {
  it("dalle de 5 × 4 m sur 12 cm : ciment en sacs de 50 kg, granulats et fer", () => {
    const r = calculerBeton({ ouvrage: "dalle", longueurMm: 5000, largeurMm: 4000, hauteurMm: 120, nombre: 1, diametreFer: 10 }, R);
    // 2,4 m³ ; 2,52 m³ avec 5 % de pertes.
    expect(r.volumeL).toBe(2400);
    expect(r.volumeCommandeL).toBe(2520);
    // 2,52 × 350 = 882 kg, soit 17,64 sacs : 18.
    expect(r.cimentKg).toBe(882);
    expect(r.sacsCiment).toBe(18);
    expect(r.sableL).toBe(1008);
    expect(r.gravierL).toBe(2016);
    expect(r.eauL).toBe(441);
    // Fer sur le volume théorique : 2,4 × 90 = 216 kg ; 216 000 / 617 = 350,08 m ; 29,2 barres de 12 m.
    expect(r.ferKg).toBe(216);
    expect(r.barresFer).toBe(30);
    tousEntiers(r);
  });

  it("multiplie par le nombre d'éléments identiques", () => {
    const un = calculerBeton({ ouvrage: "poteau_poutre", longueurMm: 200, largeurMm: 200, hauteurMm: 3000, nombre: 1 }, R);
    const douze = calculerBeton({ ouvrage: "poteau_poutre", longueurMm: 200, largeurMm: 200, hauteurMm: 3000, nombre: 12 }, R);
    expect(un.volumeL).toBe(120);
    expect(douze.volumeL).toBe(1440);
    expect(douze.barresFer).toBeNull();
    // 1,44 × 120 = 172,8 kg : 173.
    expect(douze.ferKg).toBe(173);
  });

  it("arrondit toujours au-dessus ce qui s'achète", () => {
    // 0,1 m³ de propreté, 105 L avec pertes : 15,75 kg de ciment, 1 sac.
    const r = calculerBeton({ ouvrage: "proprete", longueurMm: 1000, largeurMm: 1000, hauteurMm: 100, nombre: 1 }, R);
    expect(r.cimentKg).toBe(16);
    expect(r.sacsCiment).toBe(1);
    expect(r.ferKg).toBe(0);
  });

  it("reste exact sur un très grand volume", () => {
    const r = calculerBeton({ ouvrage: "dalle", longueurMm: 10_000_000, largeurMm: 10_000_000, hauteurMm: 1000, nombre: 1 }, R);
    expect(r.volumeL).toBe(100_000_000_000);
    expect(r.cimentKg).toBe(36_750_000_000);
    tousEntiers(r);
  });

  it("refuse une dimension nulle ou absurde", () => {
    expect(() => calculerBeton({ ouvrage: "dalle", longueurMm: 0, largeurMm: 1000, hauteurMm: 100, nombre: 1 }, R)).toThrow(/Longueur/);
    expect(() => calculerBeton({ ouvrage: "dalle", longueurMm: 1000, largeurMm: 1000, hauteurMm: 100, nombre: 0 }, R)).toThrow(/Nombre/);
    expect(() => calculerBeton({ ouvrage: "dalle", longueurMm: 20_000_000, largeurMm: 1000, hauteurMm: 100, nombre: 1 }, R)).toThrow(/10 km/);
  });
});

describe("maçonnerie d'agglos", () => {
  it("mur de 10 × 2,80 m en agglos de 15, une porte et deux fenêtres", () => {
    const r = calculerMaconnerie(
      {
        agglo: "creux_15",
        longueurMm: 10_000,
        hauteurMm: 2_800,
        ouvertures: [
          { largeurMm: 900, hauteurMm: 2100, nombre: 1 },
          { largeurMm: 1200, hauteurMm: 1000, nombre: 2 },
        ],
      },
      R,
    );
    expect(r.surfaceBruteMm2).toBe(28_000_000);
    expect(r.surfaceOuverturesMm2).toBe(4_290_000);
    expect(r.surfaceNetteMm2).toBe(23_710_000);
    // 23,71 × 12,5 = 296,375 ; avec 5 % : 311,19.
    expect(r.blocsTheoriques).toBe(297);
    expect(r.blocs).toBe(312);
    // 23,71 × 18 L = 426,78 L de mortier dosé à 300 kg.
    expect(r.mortierL).toBe(427);
    expect(r.cimentKg).toBe(129);
    expect(r.sacsCiment).toBe(3);
    expect(r.sableL).toBe(427);
    expect(r.eauL).toBe(86);
    tousEntiers(r);
  });

  it("refuse des ouvertures plus grandes que le mur", () => {
    expect(() =>
      calculerMaconnerie({ agglo: "creux_10", longueurMm: 1000, hauteurMm: 1000, ouvertures: [{ largeurMm: 1000, hauteurMm: 1000, nombre: 1 }] }, R),
    ).toThrow(/ouvertures/);
  });
});

describe("carrelage", () => {
  const base = { longueurMm: 4000, largeurMm: 3500, carreauLongueurMm: 600, carreauLargeurMm: 600, parCarton: 4, portesMm: 900, plinthes: true };

  it("pièce de 14 m² en 60 × 60 collé, plinthes comprises", () => {
    const r = calculerCarrelage({ ...base, pose: "colle" }, R);
    // 14 × 1,10 / 0,36 = 42,78 carreaux ; 11 cartons de 4.
    expect(r.carreaux).toBe(43);
    expect(r.cartons).toBe(11);
    expect(r.surfaceAcheteeMm2).toBe(15_840_000);
    expect(r.colleKg).toBe(70);
    expect(r.sacsColle).toBe(3);
    expect(r.mortierL).toBeNull();
    // Périmètre 15 m moins la porte : 14,1 m ; avec 10 % : 25,85 longueurs de 60 cm.
    expect(r.plinthesMm).toBe(14_100);
    expect(r.plinthesPieces).toBe(26);
    tousEntiers(r);
  });

  it("au mortier : lit de 3 cm dosé à 300 kg", () => {
    const r = calculerCarrelage({ ...base, pose: "mortier", plinthes: false }, R);
    expect(r.mortierL).toBe(420);
    expect(r.cimentKg).toBe(126);
    expect(r.sacsCiment).toBe(3);
    expect(r.sableL).toBe(420);
    expect(r.colleKg).toBeNull();
    expect(r.plinthesMm).toBeNull();
  });
});

describe("pente", () => {
  it("déduit la pente de la longueur et de la hauteur", () => {
    expect(calculerPente({ longueurMm: 5000, hauteurMm: 100, penteCentiemes: null })).toEqual({
      longueurMm: 5000,
      hauteurMm: 100,
      penteCentiemes: 200,
      angleCentiemes: 115,
      rampantMm: 5001,
    });
  });

  it("déduit la hauteur, puis la longueur", () => {
    expect(calculerPente({ longueurMm: 4000, hauteurMm: null, penteCentiemes: 150 }).hauteurMm).toBe(60);
    expect(calculerPente({ longueurMm: null, hauteurMm: 50, penteCentiemes: 200 }).longueurMm).toBe(2500);
  });

  it("exige deux valeurs sur trois", () => {
    expect(() => calculerPente({ longueurMm: 1000, hauteurMm: null, penteCentiemes: null })).toThrow(/deux valeurs/);
    expect(() => calculerPente({ longueurMm: null, hauteurMm: 50, penteCentiemes: 0 })).toThrow(/nulle/);
  });
});

describe("escalier", () => {
  it("2,80 m à franchir : 16 marches de 17,5 cm, giron de Blondel", () => {
    const r = calculerEscalier({ hauteurMm: 2800, marcheVoulueMm: null, reculementMm: null });
    expect(r).toEqual({
      marches: 16,
      hauteurMarcheMm: 175,
      marchesPlusHautes: 0,
      gironMm: 280,
      reculementMm: 4200,
      blondelMm: 630,
      angleCentiemes: 3369,
      confort: "confortable",
    });
  });

  it("répartit le reste au millimètre pour tomber juste", () => {
    const r = calculerEscalier({ hauteurMm: 2750, marcheVoulueMm: null, reculementMm: null });
    expect(r.marches).toBe(16);
    expect(r.hauteurMarcheMm).toBe(171);
    // 16 × 171 + 14 = 2 750 : 14 marches de 172 mm, 2 de 171.
    expect(r.marchesPlusHautes).toBe(14);
    expect(r.hauteurMarcheMm * r.marches + r.marchesPlusHautes).toBe(2750);
    expect(r.gironMm).toBe(286);
  });

  it("un reculement trop court donne un escalier non conforme", () => {
    const r = calculerEscalier({ hauteurMm: 2800, marcheVoulueMm: 175, reculementMm: 3000 });
    expect(r.gironMm).toBe(200);
    expect(r.blondelMm).toBe(550);
    expect(r.confort).toBe("non_conforme");
  });
});

describe("angle droit", () => {
  it("3-4-5 et verdict sur la diagonale mesurée", () => {
    expect(calculerEquerre(3000, 4000, null)).toEqual({ diagonaleMm: 5000, ecartMm: null, verdict: null });
    expect(calculerEquerre(3000, 4000, 5004).verdict).toBe("droit");
    expect(calculerEquerre(3000, 4000, 5010)).toEqual({ diagonaleMm: 5000, ecartMm: 10, verdict: "ouvert" });
    expect(calculerEquerre(3000, 4000, 4990).verdict).toBe("ferme");
  });
});

describe("réglages", () => {
  it("complète des réglages partiels et écarte une valeur hors bornes", () => {
    const r = normaliserReglages({ sacCimentKg: 1000, beton: { dalle: { ferKg: 100 } } });
    expect(r.sacCimentKg).toBe(50);
    expect(r.beton.dalle.ferKg).toBe(100);
    expect(r.beton.dalle.cimentKg).toBe(350);
    expect(normaliserReglages(null)).toEqual(REGLAGES_DEFAUT);
  });

  it("refuse une saisie hors bornes avec son libellé", () => {
    expect(verifierReglages(REGLAGES_DEFAUT)).toEqual({ ok: true, valeurs: REGLAGES_DEFAUT });
    const refus = verifierReglages({ ...REGLAGES_DEFAUT, sacCimentKg: 5 });
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.message).toMatch(/Sac de ciment/);
    expect(verifierReglages({ ...REGLAGES_DEFAUT, pertesBetonPct: 2.5 }).ok).toBe(false);
  });

  it("suit les réglages de l'entreprise : sacs de 25 kg", () => {
    const r = calculerBeton({ ouvrage: "dalle", longueurMm: 5000, largeurMm: 4000, hauteurMm: 120, nombre: 1 }, { ...R, sacCimentKg: 25 });
    expect(r.sacsCiment).toBe(36);
  });
});
