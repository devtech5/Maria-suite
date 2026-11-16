/**
 * Calculs chantier : règles pures, sans base ni React — testées sans base,
 * exécutées dans le navigateur. Un chef de chantier sans réseau calcule
 * quand même : l'écran n'a besoin du serveur que pour charger les ratios.
 *
 * Tout est ENTIER. Longueurs en millimètres, surfaces en mm², volumes en
 * litres, masses en kilogrammes, pourcentages en entiers, pentes en
 * centièmes de pour cent, angles en centièmes de degré. Les produits
 * intermédiaires passent par `BigInt` : 100 m × 100 m × 1 m font 10¹³ mm³,
 * et multipliés par un dosage ils sortent des entiers exacts de JavaScript.
 *
 * Une quantité à acheter s'arrondit TOUJOURS au-dessus : un sac de ciment
 * qui manque arrête le coulage, un sac de trop reste en stock.
 *
 * Les ratios (dosages, pertes, conditionnements) sont ceux de la
 * Côte d'Ivoire — ciment en sacs de 50 kg, agglos de 40 × 20 cm, fer en
 * barres de 12 m — mais restent des réglages de l'entreprise, « à vérifier »
 * tant qu'un responsable ne les a pas attestés, comme le barème de paie. Les
 * grandeurs physiques (poids du fer, formule de Blondel) ne se règlent pas.
 */

// ------------------------------------------------------------- arithmétique

/** Division entière arrondie au-dessus, pour des quantités positives. */
export function diviserAuDessus(a: bigint, b: bigint): bigint {
  if (b <= BigInt(0)) throw new Error("Diviseur nul ou négatif.");
  if (a <= BigInt(0)) return BigInt(0);
  return (a + b - BigInt(1)) / b;
}

/** Division entière arrondie au plus proche (la moitié monte), pour des quantités positives. */
export function diviserArrondi(a: bigint, b: bigint): bigint {
  if (b <= BigInt(0)) throw new Error("Diviseur nul ou négatif.");
  return (BigInt(2) * a + b) / (BigInt(2) * b);
}

/** Racine carrée entière arrondie au plus proche, exacte quelle que soit la taille. */
export function racineArrondie(n: bigint): bigint {
  if (n < BigInt(0)) throw new Error("Racine d'un nombre négatif.");
  if (n < BigInt(2)) return n;
  // L'estimation flottante tombe à une unité près pour les tailles d'ici
  // (moins de 10¹⁵) ; les deux boucles la rendent exacte.
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x -= BigInt(1);
  while ((x + BigInt(1)) * (x + BigInt(1)) <= n) x += BigInt(1);
  // ⌊√n⌋ = x ; on monte si n dépasse (x + ½)² = x² + x + ¼.
  return n - x * x > x ? x + BigInt(1) : x;
}

const n = (b: bigint): number => Number(b);

// ------------------------------------------------------------------ saisie

/**
 * Lit un nombre décimal saisi à la française (« 3,25 », « 3.25 », « 12 »)
 * et le rend en entier multiplié par 10^decimales, SANS passer par un
 * flottant. `null` si la saisie n'est pas un nombre positif, ou porte plus
 * de décimales que l'unité n'en admet.
 *
 *   lireDecimal("3,25", 3) -> 3250     (mètres en millimètres)
 *   lireDecimal("2,5", 2)  -> 250      (pour cent en centièmes)
 */
export function lireDecimal(texte: string, decimales: number): number | null {
  const t = texte.trim().replace(/\s/g, "").replace(",", ".");
  const m = /^(\d{1,9})(?:\.(\d*))?$/.exec(t);
  if (!m) return null;
  const fraction = m[2] ?? "";
  if (fraction.length > decimales) return null;
  return Number(m[1]) * 10 ** decimales + Number((fraction + "0".repeat(decimales)).slice(0, decimales) || "0");
}

/** Mètres saisis, en millimètres. */
export const metresEnMm = (texte: string) => lireDecimal(texte, 3);
/** Centimètres saisis, en millimètres. */
export const centimetresEnMm = (texte: string) => lireDecimal(texte, 1);

/** Plus grande longueur admise : 10 km. Au-delà, c'est une faute de frappe. */
export const LONGUEUR_MAX_MM = 10_000_000;

function longueur(mm: number, quoi: string): bigint {
  if (!Number.isSafeInteger(mm) || mm <= 0) throw new Error(`${quoi} : saisissez une longueur positive.`);
  if (mm > LONGUEUR_MAX_MM) throw new Error(`${quoi} : plus de 10 km, vérifiez la saisie.`);
  return BigInt(mm);
}

function entierPositif(v: number, quoi: string, max = 100_000): bigint {
  if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`${quoi} : saisissez un nombre entier positif.`);
  if (v > max) throw new Error(`${quoi} : plus de ${max}, vérifiez la saisie.`);
  return BigInt(v);
}

// ---------------------------------------------------------------- réglages

export const OUVRAGES_BETON = {
  proprete: "Béton de propreté",
  fondation: "Semelles et fondations",
  longrine: "Longrines et chaînages",
  poteau_poutre: "Poteaux et poutres",
  dalle: "Dalle pleine",
  dallage: "Dallage sur terre-plein",
} as const;
export type OuvrageBeton = keyof typeof OUVRAGES_BETON;
export const CLES_OUVRAGES = Object.keys(OUVRAGES_BETON) as OuvrageBeton[];

/** Composition d'un mètre cube de béton en place. */
export interface DosageBeton {
  cimentKg: number;
  sableL: number;
  gravierL: number;
  eauL: number;
  /** Ratio d'armatures : kilogrammes d'acier par m³ de béton. */
  ferKg: number;
}

export const AGGLOS = {
  creux_10: "Agglo creux de 10 (40 × 20 × 10)",
  creux_15: "Agglo creux de 15 (40 × 20 × 15)",
  creux_20: "Agglo creux de 20 (40 × 20 × 20)",
  plein_15: "Agglo plein de 15 (40 × 20 × 15)",
} as const;
export type Agglo = keyof typeof AGGLOS;
export const CLES_AGGLOS = Object.keys(AGGLOS) as Agglo[];

export interface RatioAgglo {
  /** Blocs par m² de mur, en CENTIÈMES : 1250 = 12,5 blocs. */
  centiemesParM2: number;
  /** Mortier de pose, en litres par m² de mur. */
  mortierLParM2: number;
}

/** Composition d'un mètre cube de mortier (pose, chape, carrelage). */
export interface DosageMortier {
  cimentKg: number;
  sableL: number;
  eauL: number;
}

export interface ReglagesCalculs {
  /** Poids d'un sac de ciment. 50 kg en Côte d'Ivoire. */
  sacCimentKg: number;
  /** Longueur commerciale d'une barre de fer. */
  barreFerMm: number;
  beton: Record<OuvrageBeton, DosageBeton>;
  /** Pertes au coulage : débordements, fond de toupie, surépaisseurs. */
  pertesBetonPct: number;
  agglos: Record<Agglo, RatioAgglo>;
  /** Casse et coupes des agglos. */
  pertesAgglosPct: number;
  mortier: DosageMortier;
  /** Coupes et casse du carrelage. */
  pertesCarrelagePct: number;
  colleKgParM2: number;
  sacColleKg: number;
  /** Épaisseur du lit de mortier d'un carrelage posé au mortier. */
  mortierCarrelageMm: number;
}

/**
 * Ratios de départ, pratique courante des chantiers ivoiriens. À attester
 * par un conducteur de travaux avant tout usage engageant : un ratio
 * d'armatures se tire du plan de ferraillage, pas d'une moyenne.
 */
export const REGLAGES_DEFAUT: ReglagesCalculs = {
  sacCimentKg: 50,
  barreFerMm: 12_000,
  beton: {
    proprete: { cimentKg: 150, sableL: 400, gravierL: 800, eauL: 100, ferKg: 0 },
    fondation: { cimentKg: 350, sableL: 400, gravierL: 800, eauL: 175, ferKg: 50 },
    longrine: { cimentKg: 350, sableL: 400, gravierL: 800, eauL: 175, ferKg: 90 },
    poteau_poutre: { cimentKg: 350, sableL: 400, gravierL: 800, eauL: 175, ferKg: 120 },
    dalle: { cimentKg: 350, sableL: 400, gravierL: 800, eauL: 175, ferKg: 90 },
    dallage: { cimentKg: 300, sableL: 400, gravierL: 800, eauL: 170, ferKg: 0 },
  },
  pertesBetonPct: 5,
  agglos: {
    creux_10: { centiemesParM2: 1250, mortierLParM2: 12 },
    creux_15: { centiemesParM2: 1250, mortierLParM2: 18 },
    creux_20: { centiemesParM2: 1250, mortierLParM2: 22 },
    plein_15: { centiemesParM2: 1250, mortierLParM2: 20 },
  },
  pertesAgglosPct: 5,
  mortier: { cimentKg: 300, sableL: 1000, eauL: 200 },
  pertesCarrelagePct: 10,
  colleKgParM2: 5,
  sacColleKg: 25,
  mortierCarrelageMm: 30,
};

/** Bornes de chaque réglage : au-delà, c'est une faute de saisie. */
const BORNES = {
  sacCimentKg: [10, 100],
  barreFerMm: [1_000, 18_000],
  cimentKg: [0, 600],
  sableL: [0, 2_000],
  gravierL: [0, 2_000],
  eauL: [0, 400],
  ferKg: [0, 400],
  pertesPct: [0, 50],
  centiemesParM2: [100, 10_000],
  mortierLParM2: [0, 200],
  colleKgParM2: [1, 30],
  sacColleKg: [5, 50],
  mortierCarrelageMm: [5, 100],
} as const;

function borne(v: unknown, [min, max]: readonly [number, number]): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
}

function objet(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Lit des réglages stockés (JSON) en les complétant par les valeurs de
 * départ. Une valeur absente ou hors bornes reprend la valeur de départ :
 * un ratio ajouté au code après coup ne casse pas une base existante.
 */
export function normaliserReglages(brut: unknown): ReglagesCalculs {
  const r = objet(brut);
  const d = REGLAGES_DEFAUT;
  const pris = (v: unknown, b: readonly [number, number], defaut: number) => borne(v, b) ?? defaut;
  const beton = objet(r.beton);
  const agglos = objet(r.agglos);
  const mortier = objet(r.mortier);
  return {
    sacCimentKg: pris(r.sacCimentKg, BORNES.sacCimentKg, d.sacCimentKg),
    barreFerMm: pris(r.barreFerMm, BORNES.barreFerMm, d.barreFerMm),
    beton: Object.fromEntries(
      CLES_OUVRAGES.map((k) => {
        const o = objet(beton[k]);
        const od = d.beton[k];
        return [
          k,
          {
            cimentKg: pris(o.cimentKg, BORNES.cimentKg, od.cimentKg),
            sableL: pris(o.sableL, BORNES.sableL, od.sableL),
            gravierL: pris(o.gravierL, BORNES.gravierL, od.gravierL),
            eauL: pris(o.eauL, BORNES.eauL, od.eauL),
            ferKg: pris(o.ferKg, BORNES.ferKg, od.ferKg),
          },
        ];
      }),
    ) as Record<OuvrageBeton, DosageBeton>,
    pertesBetonPct: pris(r.pertesBetonPct, BORNES.pertesPct, d.pertesBetonPct),
    agglos: Object.fromEntries(
      CLES_AGGLOS.map((k) => {
        const a = objet(agglos[k]);
        const ad = d.agglos[k];
        return [
          k,
          {
            centiemesParM2: pris(a.centiemesParM2, BORNES.centiemesParM2, ad.centiemesParM2),
            mortierLParM2: pris(a.mortierLParM2, BORNES.mortierLParM2, ad.mortierLParM2),
          },
        ];
      }),
    ) as Record<Agglo, RatioAgglo>,
    pertesAgglosPct: pris(r.pertesAgglosPct, BORNES.pertesPct, d.pertesAgglosPct),
    mortier: {
      cimentKg: pris(mortier.cimentKg, BORNES.cimentKg, d.mortier.cimentKg),
      sableL: pris(mortier.sableL, BORNES.sableL, d.mortier.sableL),
      eauL: pris(mortier.eauL, BORNES.eauL, d.mortier.eauL),
    },
    pertesCarrelagePct: pris(r.pertesCarrelagePct, BORNES.pertesPct, d.pertesCarrelagePct),
    colleKgParM2: pris(r.colleKgParM2, BORNES.colleKgParM2, d.colleKgParM2),
    sacColleKg: pris(r.sacColleKg, BORNES.sacColleKg, d.sacColleKg),
    mortierCarrelageMm: pris(r.mortierCarrelageMm, BORNES.mortierCarrelageMm, d.mortierCarrelageMm),
  };
}

/**
 * Vérifie des réglages saisis : contrairement à `normaliserReglages`, une
 * valeur hors bornes est REFUSÉE avec son libellé, jamais remplacée en
 * silence — celui qui règle doit savoir que sa saisie n'est pas prise.
 */
export function verifierReglages(saisie: unknown): { ok: true; valeurs: ReglagesCalculs } | { ok: false, message: string } {
  const r = objet(saisie);
  const erreurs: string[] = [];
  const lire = (v: unknown, b: readonly [number, number], libelle: string): number => {
    const x = borne(v, b);
    if (x === null) erreurs.push(`${libelle} : entier entre ${b[0]} et ${b[1]}.`);
    return x ?? b[0];
  };
  const beton = objet(r.beton);
  const agglos = objet(r.agglos);
  const mortier = objet(r.mortier);
  const valeurs: ReglagesCalculs = {
    sacCimentKg: lire(r.sacCimentKg, BORNES.sacCimentKg, "Sac de ciment (kg)"),
    barreFerMm: lire(r.barreFerMm, BORNES.barreFerMm, "Barre de fer (mm)"),
    beton: Object.fromEntries(
      CLES_OUVRAGES.map((k) => {
        const o = objet(beton[k]);
        const nom = OUVRAGES_BETON[k];
        return [
          k,
          {
            cimentKg: lire(o.cimentKg, BORNES.cimentKg, `${nom}, ciment (kg/m³)`),
            sableL: lire(o.sableL, BORNES.sableL, `${nom}, sable (L/m³)`),
            gravierL: lire(o.gravierL, BORNES.gravierL, `${nom}, gravier (L/m³)`),
            eauL: lire(o.eauL, BORNES.eauL, `${nom}, eau (L/m³)`),
            ferKg: lire(o.ferKg, BORNES.ferKg, `${nom}, fer (kg/m³)`),
          },
        ];
      }),
    ) as Record<OuvrageBeton, DosageBeton>,
    pertesBetonPct: lire(r.pertesBetonPct, BORNES.pertesPct, "Pertes béton (%)"),
    agglos: Object.fromEntries(
      CLES_AGGLOS.map((k) => {
        const a = objet(agglos[k]);
        const nom = AGGLOS[k];
        return [
          k,
          {
            centiemesParM2: lire(a.centiemesParM2, BORNES.centiemesParM2, `${nom}, blocs par m² (centièmes)`),
            mortierLParM2: lire(a.mortierLParM2, BORNES.mortierLParM2, `${nom}, mortier (L/m²)`),
          },
        ];
      }),
    ) as Record<Agglo, RatioAgglo>,
    pertesAgglosPct: lire(r.pertesAgglosPct, BORNES.pertesPct, "Pertes agglos (%)"),
    mortier: {
      cimentKg: lire(mortier.cimentKg, BORNES.cimentKg, "Mortier, ciment (kg/m³)"),
      sableL: lire(mortier.sableL, BORNES.sableL, "Mortier, sable (L/m³)"),
      eauL: lire(mortier.eauL, BORNES.eauL, "Mortier, eau (L/m³)"),
    },
    pertesCarrelagePct: lire(r.pertesCarrelagePct, BORNES.pertesPct, "Pertes carrelage (%)"),
    colleKgParM2: lire(r.colleKgParM2, BORNES.colleKgParM2, "Colle (kg/m²)"),
    sacColleKg: lire(r.sacColleKg, BORNES.sacColleKg, "Sac de colle (kg)"),
    mortierCarrelageMm: lire(r.mortierCarrelageMm, BORNES.mortierCarrelageMm, "Lit de mortier du carrelage (mm)"),
  };
  return erreurs.length ? { ok: false, message: erreurs[0] } : { ok: true, valeurs };
}

// --------------------------------------------------------------------- fer

/**
 * Poids linéique des aciers haute adhérence, en grammes par mètre :
 * 7 850 kg/m³ × π d² / 4. Grandeur physique, pas un réglage.
 */
export const FER_GRAMMES_PAR_METRE = {
  6: 222,
  8: 395,
  10: 617,
  12: 888,
  14: 1208,
  16: 1578,
  20: 2466,
  25: 3853,
} as const;
export type DiametreFer = keyof typeof FER_GRAMMES_PAR_METRE;
export const DIAMETRES_FER = Object.keys(FER_GRAMMES_PAR_METRE).map(Number) as DiametreFer[];

// ------------------------------------------------------------------- béton

export interface SaisieBeton {
  ouvrage: OuvrageBeton;
  longueurMm: number;
  largeurMm: number;
  /** Épaisseur d'une dalle, hauteur d'un poteau ou d'une semelle. */
  hauteurMm: number;
  /** Éléments identiques : 12 poteaux, 8 semelles. */
  nombre: number;
  /** Diamètre principal, pour compter les barres ; sinon le fer reste en kg. */
  diametreFer?: DiametreFer | null;
}

export interface ResultatBeton {
  /** Volume théorique, en litres (1 m³ = 1 000 L). */
  volumeL: number;
  /** Volume à commander ou à gâcher, pertes comprises. */
  volumeCommandeL: number;
  cimentKg: number;
  sacsCiment: number;
  sableL: number;
  gravierL: number;
  eauL: number;
  ferKg: number;
  barresFer: number | null;
}

export function calculerBeton(s: SaisieBeton, r: ReglagesCalculs): ResultatBeton {
  const volMm3 =
    longueur(s.longueurMm, "Longueur") * longueur(s.largeurMm, "Largeur") * longueur(s.hauteurMm, "Épaisseur ou hauteur") * entierPositif(s.nombre, "Nombre d'éléments");
  const d = r.beton[s.ouvrage];
  if (!d) throw new Error("Ouvrage inconnu.");
  const pertes = BigInt(100 + r.pertesBetonPct);
  // Volume en m³ = mm³ / 10⁹ ; pertes comprises : × (100 + p) / 100.
  const avecPertes = volMm3 * pertes; // en mm³ × 100
  const M3_POURCENT = BigInt(100_000_000_000); // 10⁹ mm³ × 100
  const ferG = diviserAuDessus(volMm3 * BigInt(d.ferKg), BigInt(1_000_000)); // fer sur le volume théorique : le ratio inclut déjà recouvrements et chutes
  const poids = s.diametreFer ? FER_GRAMMES_PAR_METRE[s.diametreFer] : null;
  return {
    volumeL: n(diviserAuDessus(volMm3, BigInt(1_000_000))),
    volumeCommandeL: n(diviserAuDessus(avecPertes, BigInt(100_000_000))),
    cimentKg: n(diviserAuDessus(avecPertes * BigInt(d.cimentKg), M3_POURCENT)),
    sacsCiment: n(diviserAuDessus(avecPertes * BigInt(d.cimentKg), M3_POURCENT * BigInt(r.sacCimentKg))),
    sableL: n(diviserAuDessus(avecPertes * BigInt(d.sableL), M3_POURCENT)),
    gravierL: n(diviserAuDessus(avecPertes * BigInt(d.gravierL), M3_POURCENT)),
    eauL: n(diviserAuDessus(avecPertes * BigInt(d.eauL), M3_POURCENT)),
    ferKg: n(diviserAuDessus(ferG, BigInt(1000))),
    // Longueur de fer en mm = g / (g/m) × 1000 ; barres = longueur / barre.
    barresFer: poids === null ? null : n(diviserAuDessus(volMm3 * BigInt(d.ferKg) * BigInt(1000), BigInt(1_000_000) * BigInt(poids) * BigInt(r.barreFerMm))),
  };
}

// -------------------------------------------------------------- maçonnerie

export interface Ouverture {
  largeurMm: number;
  hauteurMm: number;
  nombre: number;
}

export interface SaisieMaconnerie {
  agglo: Agglo;
  longueurMm: number;
  hauteurMm: number;
  ouvertures: Ouverture[];
}

export interface ResultatMaconnerie {
  surfaceBruteMm2: number;
  surfaceOuverturesMm2: number;
  surfaceNetteMm2: number;
  /** Blocs à poser, sans les pertes. */
  blocsTheoriques: number;
  /** Blocs à commander, pertes comprises. */
  blocs: number;
  mortierL: number;
  cimentKg: number;
  sacsCiment: number;
  sableL: number;
  eauL: number;
}

export function calculerMaconnerie(s: SaisieMaconnerie, r: ReglagesCalculs): ResultatMaconnerie {
  const brute = longueur(s.longueurMm, "Longueur du mur") * longueur(s.hauteurMm, "Hauteur du mur");
  let ouvertures = BigInt(0);
  for (const [i, o] of s.ouvertures.entries()) {
    const quoi = `Ouverture ${i + 1}`;
    ouvertures += longueur(o.largeurMm, `${quoi}, largeur`) * longueur(o.hauteurMm, `${quoi}, hauteur`) * entierPositif(o.nombre, `${quoi}, nombre`);
  }
  const nette = brute - ouvertures;
  if (nette <= BigInt(0)) throw new Error("Les ouvertures couvrent tout le mur : vérifiez les dimensions.");
  const a = r.agglos[s.agglo];
  if (!a) throw new Error("Type d'agglo inconnu.");
  const M2 = BigInt(1_000_000); // mm² par m²
  // Mortier en litres ; mortier en m³ = L / 1000.
  const mortierMm2L = nette * BigInt(a.mortierLParM2); // ÷ 10⁶ = litres
  const dm = r.mortier;
  return {
    surfaceBruteMm2: n(brute),
    surfaceOuverturesMm2: n(ouvertures),
    surfaceNetteMm2: n(nette),
    blocsTheoriques: n(diviserAuDessus(nette * BigInt(a.centiemesParM2), M2 * BigInt(100))),
    blocs: n(diviserAuDessus(nette * BigInt(a.centiemesParM2) * BigInt(100 + r.pertesAgglosPct), M2 * BigInt(100) * BigInt(100))),
    mortierL: n(diviserAuDessus(mortierMm2L, M2)),
    cimentKg: n(diviserAuDessus(mortierMm2L * BigInt(dm.cimentKg), M2 * BigInt(1000))),
    sacsCiment: n(diviserAuDessus(mortierMm2L * BigInt(dm.cimentKg), M2 * BigInt(1000) * BigInt(r.sacCimentKg))),
    sableL: n(diviserAuDessus(mortierMm2L * BigInt(dm.sableL), M2 * BigInt(1000))),
    eauL: n(diviserAuDessus(mortierMm2L * BigInt(dm.eauL), M2 * BigInt(1000))),
  };
}

// --------------------------------------------------------------- carrelage

/**
 * Formats courants sur le marché ivoirien, et pièces par carton. Le carton
 * varie d'une marque à l'autre : il se corrige à chaque calcul.
 */
export const FORMATS_CARRELAGE = [
  { cle: "30x30", longueurMm: 300, largeurMm: 300, parCarton: 11 },
  { cle: "40x40", longueurMm: 400, largeurMm: 400, parCarton: 10 },
  { cle: "45x45", longueurMm: 450, largeurMm: 450, parCarton: 8 },
  { cle: "50x50", longueurMm: 500, largeurMm: 500, parCarton: 6 },
  { cle: "60x60", longueurMm: 600, largeurMm: 600, parCarton: 4 },
  { cle: "30x60", longueurMm: 600, largeurMm: 300, parCarton: 8 },
  { cle: "25x40", longueurMm: 400, largeurMm: 250, parCarton: 15 },
] as const;

export type PoseCarrelage = "colle" | "mortier";

export interface SaisieCarrelage {
  longueurMm: number;
  largeurMm: number;
  carreauLongueurMm: number;
  carreauLargeurMm: number;
  parCarton: number;
  pose: PoseCarrelage;
  /** Largeur totale des portes, retirée du linéaire de plinthes. Zéro sans plinthes à compter. */
  portesMm: number;
  plinthes: boolean;
}

export interface ResultatCarrelage {
  surfaceMm2: number;
  carreaux: number;
  cartons: number;
  /** Surface réellement achetée, cartons entiers. */
  surfaceAcheteeMm2: number;
  colleKg: number | null;
  sacsColle: number | null;
  mortierL: number | null;
  cimentKg: number | null;
  sacsCiment: number | null;
  sableL: number | null;
  plinthesMm: number | null;
  /** Plinthes découpées dans des carreaux de la longueur du format. */
  plinthesPieces: number | null;
}

export function calculerCarrelage(s: SaisieCarrelage, r: ReglagesCalculs): ResultatCarrelage {
  const L = longueur(s.longueurMm, "Longueur de la pièce");
  const l = longueur(s.largeurMm, "Largeur de la pièce");
  const cL = longueur(s.carreauLongueurMm, "Longueur du carreau");
  const cl = longueur(s.carreauLargeurMm, "Largeur du carreau");
  const parCarton = entierPositif(s.parCarton, "Carreaux par carton", 500);
  const surface = L * l;
  const carreaux = diviserAuDessus(surface * BigInt(100 + r.pertesCarrelagePct), cL * cl * BigInt(100));
  const cartons = diviserAuDessus(carreaux, parCarton);
  const M2 = BigInt(1_000_000);
  const colle = s.pose === "colle";
  const mortierMm3 = surface * BigInt(r.mortierCarrelageMm); // ÷ 10⁶ = litres
  const dm = r.mortier;
  let plinthesMm: bigint | null = null;
  if (s.plinthes) {
    const portes = BigInt(Math.max(0, Math.trunc(s.portesMm) || 0));
    const perimetre = BigInt(2) * (L + l);
    plinthesMm = perimetre > portes ? perimetre - portes : BigInt(0);
  }
  return {
    surfaceMm2: n(surface),
    carreaux: n(carreaux),
    cartons: n(cartons),
    surfaceAcheteeMm2: n(cartons * parCarton * cL * cl),
    colleKg: colle ? n(diviserAuDessus(surface * BigInt(r.colleKgParM2), M2)) : null,
    sacsColle: colle ? n(diviserAuDessus(surface * BigInt(r.colleKgParM2), M2 * BigInt(r.sacColleKg))) : null,
    mortierL: colle ? null : n(diviserAuDessus(mortierMm3, M2)),
    cimentKg: colle ? null : n(diviserAuDessus(mortierMm3 * BigInt(dm.cimentKg), M2 * BigInt(1000))),
    sacsCiment: colle ? null : n(diviserAuDessus(mortierMm3 * BigInt(dm.cimentKg), M2 * BigInt(1000) * BigInt(r.sacCimentKg))),
    sableL: colle ? null : n(diviserAuDessus(mortierMm3 * BigInt(dm.sableL), M2 * BigInt(1000))),
    plinthesMm: plinthesMm === null ? null : n(plinthesMm),
    plinthesPieces: plinthesMm === null ? null : n(diviserAuDessus(plinthesMm * BigInt(100 + r.pertesCarrelagePct), cL * BigInt(100))),
  };
}

// ------------------------------------------------------------------- pente

export interface SaisiePente {
  /** Deux des trois suffisent ; le troisième se déduit. */
  longueurMm: number | null;
  hauteurMm: number | null;
  /** Pente en centièmes de pour cent : 150 = 1,5 %. */
  penteCentiemes: number | null;
}

export interface ResultatPente {
  longueurMm: number;
  hauteurMm: number;
  penteCentiemes: number;
  /** Angle en centièmes de degré : 286 = 2,86°. */
  angleCentiemes: number;
  /** Longueur réelle, le long de la pente. */
  rampantMm: number;
}

/** Centièmes de degré d'un angle donné par sa tangente h / l. Trigonométrie : le seul flottant du module, arrondi aussitôt. */
function angleCentiemes(h: bigint, l: bigint): number {
  return Math.round((Math.atan2(Number(h), Number(l)) * 180 * 100) / Math.PI);
}

export function calculerPente(s: SaisiePente): ResultatPente {
  const connus = [s.longueurMm, s.hauteurMm, s.penteCentiemes].filter((v) => v !== null && v !== undefined).length;
  if (connus < 2) throw new Error("Renseignez deux valeurs sur trois.");
  let L: bigint;
  let H: bigint;
  if (s.longueurMm !== null && s.hauteurMm !== null) {
    L = longueur(s.longueurMm, "Longueur horizontale");
    if (!Number.isSafeInteger(s.hauteurMm) || s.hauteurMm < 0) throw new Error("Hauteur : saisissez une hauteur positive ou nulle.");
    H = BigInt(s.hauteurMm);
  } else if (s.longueurMm !== null) {
    L = longueur(s.longueurMm, "Longueur horizontale");
    H = diviserArrondi(L * BigInt(pente(s.penteCentiemes)), BigInt(10_000));
  } else {
    H = longueur(s.hauteurMm as number, "Hauteur");
    const p = pente(s.penteCentiemes);
    if (p === 0) throw new Error("Une pente nulle ne donne aucune longueur.");
    L = diviserArrondi(H * BigInt(10_000), BigInt(p));
  }
  if (L <= BigInt(0)) throw new Error("Longueur horizontale nulle.");
  return {
    longueurMm: n(L),
    hauteurMm: n(H),
    penteCentiemes: s.longueurMm !== null && s.hauteurMm !== null ? n(diviserArrondi(H * BigInt(10_000), L)) : pente(s.penteCentiemes),
    angleCentiemes: angleCentiemes(H, L),
    rampantMm: n(racineArrondie(L * L + H * H)),
  };
}

function pente(p: number | null): number {
  if (p === null || !Number.isSafeInteger(p) || p < 0) throw new Error("Pente : saisissez un pourcentage positif.");
  if (p > 100_000) throw new Error("Pente : plus de 1 000 %, vérifiez la saisie.");
  return p;
}

// ---------------------------------------------------------------- escalier

/** 2 H + G ≈ 630 mm : le pas moyen d'un adulte (formule de Blondel). */
export const BLONDEL_MM = 630;

export type ConfortEscalier = "confortable" | "acceptable" | "non_conforme";
export const LIBELLES_CONFORT: Record<ConfortEscalier, string> = {
  confortable: "Confortable",
  acceptable: "Acceptable, mais raide ou court",
  non_conforme: "Non conforme : inconfortable ou dangereux",
};

export interface SaisieEscalier {
  hauteurMm: number;
  /** Hauteur de marche visée ; 170 mm à défaut. */
  marcheVoulueMm: number | null;
  /** Longueur au sol disponible (reculement) ; sinon le giron suit Blondel. */
  reculementMm: number | null;
}

export interface ResultatEscalier {
  /** Nombre de marches, c'est-à-dire de hauteurs à franchir. */
  marches: number;
  /** Hauteur de marche, au millimètre inférieur. */
  hauteurMarcheMm: number;
  /** Marches d'un millimètre de plus, pour tomber juste sur la hauteur totale. */
  marchesPlusHautes: number;
  /** Profondeur de marche. Il y a un giron de moins que de marches : la dernière arrive au palier. */
  gironMm: number;
  reculementMm: number;
  blondelMm: number;
  angleCentiemes: number;
  confort: ConfortEscalier;
}

export function calculerEscalier(s: SaisieEscalier): ResultatEscalier {
  const H = longueur(s.hauteurMm, "Hauteur à franchir");
  if (H > BigInt(20_000)) throw new Error("Hauteur à franchir : plus de 20 m, vérifiez la saisie.");
  const voulue = s.marcheVoulueMm === null ? BigInt(170) : longueur(s.marcheVoulueMm, "Hauteur de marche");
  if (voulue < BigInt(100) || voulue > BigInt(250)) throw new Error("Hauteur de marche : entre 10 et 25 cm.");
  const marches = diviserArrondi(H, voulue) || BigInt(1);
  const h = H / marches;
  const reste = H - h * marches;
  const girons = marches - BigInt(1);
  let g: bigint;
  if (s.reculementMm !== null) {
    const recul = longueur(s.reculementMm, "Reculement");
    g = girons > BigInt(0) ? recul / girons : recul;
  } else {
    // Blondel sur la hauteur moyenne, arrondie : 2 H + G = 630.
    const hMoyen = diviserArrondi(H, marches);
    g = BigInt(BLONDEL_MM) - BigInt(2) * hMoyen;
    if (g < BigInt(0)) g = BigInt(0);
  }
  const recul = g * girons;
  const blondel = BigInt(2) * diviserArrondi(H, marches) + g;
  const hm = n(diviserArrondi(H, marches));
  const gm = n(g);
  const bm = n(blondel);
  let confort: ConfortEscalier;
  if (hm >= 150 && hm <= 180 && gm >= 240 && gm <= 300 && bm >= 600 && bm <= 650) confort = "confortable";
  else if (hm > 200 || gm < 220 || bm < 580 || bm > 680) confort = "non_conforme";
  else confort = "acceptable";
  return {
    marches: n(marches),
    hauteurMarcheMm: n(h),
    marchesPlusHautes: n(reste),
    gironMm: gm,
    reculementMm: n(recul),
    blondelMm: bm,
    angleCentiemes: recul > BigInt(0) ? angleCentiemes(H, recul) : 9000,
    confort,
  };
}

// ------------------------------------------------------------- angle droit

/** Écart toléré sur la diagonale d'un tracé d'implantation. */
export const TOLERANCE_EQUERRE_MM = 5;

export interface ResultatEquerre {
  diagonaleMm: number;
  /** Diagonale mesurée moins diagonale théorique ; `null` sans mesure. */
  ecartMm: number | null;
  verdict: "droit" | "ouvert" | "ferme" | null;
}

/**
 * Pythagore : la diagonale d'un angle droit de côtés A et B vaut √(A² + B²).
 * Mesurée plus longue, l'angle est ouvert (plus de 90°) ; plus courte, fermé.
 */
export function calculerEquerre(aMm: number, bMm: number, diagonaleMesureeMm: number | null): ResultatEquerre {
  const a = longueur(aMm, "Côté A");
  const b = longueur(bMm, "Côté B");
  const d = n(racineArrondie(a * a + b * b));
  if (diagonaleMesureeMm === null) return { diagonaleMm: d, ecartMm: null, verdict: null };
  const m = n(longueur(diagonaleMesureeMm, "Diagonale mesurée"));
  const ecart = m - d;
  return {
    diagonaleMm: d,
    ecartMm: ecart,
    verdict: Math.abs(ecart) <= TOLERANCE_EQUERRE_MM ? "droit" : ecart > 0 ? "ouvert" : "ferme",
  };
}

// --------------------------------------------------------------- affichage

const fr = new Intl.NumberFormat("fr-FR");

/** Un entier mis à l'échelle (3250 avec 3 décimales) en texte français (« 3,25 »), sans flottant. */
export function formatEchelle(valeur: number, decimales: number, maxDecimales = decimales): string {
  const signe = valeur < 0 ? "-" : "";
  const abs = Math.abs(valeur);
  const base = 10 ** decimales;
  const entier = Math.floor(abs / base);
  let fraction = String(abs % base).padStart(decimales, "0").slice(0, maxDecimales);
  fraction = fraction.replace(/0+$/, "");
  return `${signe}${fr.format(entier)}${fraction ? `,${fraction}` : ""}`;
}

/** Millimètres en mètres lisibles : 3250 -> « 3,25 m ». */
export const mmEnM = (mm: number) => `${formatEchelle(mm, 3)} m`;
/** Litres en mètres cubes : 4725 -> « 4,725 m³ ». */
export const litresEnM3 = (l: number) => `${formatEchelle(l, 3)} m³`;
/** mm² en m², deux décimales tronquées : 12_345_678 -> « 12,34 m² ». */
export const mm2EnM2 = (mm2: number) => `${formatEchelle(Math.floor(mm2 / 10_000), 2)} m²`;
/** Centièmes en texte : 150 -> « 1,5 ». */
export const centiemes = (c: number) => formatEchelle(c, 2);
export const entier = (v: number) => fr.format(v);
