/**
 * Notes annexes du SYSCOHADA révisé calculées depuis les comptes (lot 1).
 *
 * Une note détaille un poste du bilan ou du compte de résultat, compte par
 * compte, comparé à l'exercice précédent ; d'autres retracent les mouvements
 * de l'exercice (immobilisations, amortissements, dépréciations). Leurs totaux
 * retombent sur les postes qu'elles détaillent : elles lisent les mêmes soldes,
 * rangés de la même façon (`calculerBilan`).
 *
 * Restent hors de ce fichier les notes qui demandent une saisie — sûretés,
 * méthodes, engagements, effectifs, informations sociales — ou des données
 * d'autres modules.
 *
 * Ce fichier ne dépend ni de la base ni de React.
 */

import { divideMoney } from "@/lib/money";

import { calculerBilan, calculerSIG, elementsResultat, type SoldeCompte } from "./etats";
import { capaciteAutofinancement } from "./flux";
import { DEFINITIONS_NOTES, type DefinitionNote, type Rubrique, type Sens } from "./notes-definitions";

export interface DonneesNotes {
  /** Soldes cumulés au 31 décembre de l'exercice. */
  bilanN: readonly SoldeCompte[];
  /** Soldes cumulés au 31 décembre précédent : l'ouverture de l'exercice. */
  bilanN1: readonly SoldeCompte[];
  /** Débits et crédits de l'exercice, écriture de clôture exclue. */
  mouvementsN: readonly SoldeCompte[];
  /** Les mêmes, pour l'exercice précédent. */
  mouvementsN1: readonly SoldeCompte[];
}

export type Format = "montant" | "taux";

export interface ColonneNote {
  titre: string;
  /** Une colonne de taux (en points de base) l'est pour toutes ses lignes. */
  format: Format;
}

export interface LigneNote {
  compte?: string;
  libelle: string;
  /** `null` : sans objet, comme une variation en % depuis zéro. */
  valeurs: (number | null)[];
  niveau: "detail" | "rubrique" | "total";
  /** Les ratios de la fiche de synthèse sont des taux en points de base. */
  format?: Format;
}

export interface NoteAnnexe {
  numero: string;
  titre: string;
  colonnes: ColonneNote[];
  lignes: LigneNote[];
  /** Aucun montant : la note se signale « néant » plutôt que de s'imprimer à zéro. */
  vide: boolean;
  /** Ce que le comptable doit savoir pour la reporter : écart, donnée manquante. */
  remarques?: string[];
  /** Note rédigée : son texte, paragraphe par paragraphe. */
  texte?: string[];
  /** Note rédigée attendue mais pas encore écrite. */
  aRediger?: boolean;
}

/** Ordre des notes dans la liasse du système normal. */
export const ORDRE_LIASSE = [
  "1", "2", "3A", "3B", "3C", "3D", "3E", "3F", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15A", "15B",
  "16A", "16B", "16C", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27A", "27B", "28", "29", "30", "31",
  "32", "33", "34", "35",
];

/** Range des notes dans l'ordre de la liasse. */
export const dansLOrdre = (notes: readonly NoteAnnexe[]) => [...notes].sort((a, b) => ORDRE_LIASSE.indexOf(a.numero) - ORDRE_LIASSE.indexOf(b.numero));

/** Une ligne de titre de section dans une note : pas de valeur, elle couvre toute la largeur. */
export const intertitre = (libelle: string): LigneNote => ({ libelle, niveau: "rubrique", valeurs: [] });

const propre = (v: number) => (v === 0 ? 0 : v);
const correspond = (compte: string, prefixes: readonly string[]) => prefixes.some((p) => compte.startsWith(p));
const retenu = (r: Rubrique, compte: string) => correspond(compte, r.prefixes) && !correspond(compte, r.sauf ?? []);
const valeur = (s: SoldeCompte, sens: Sens) => (sens === "debit" ? s.debit - s.credit : s.credit - s.debit);

/** Variation en points de base, sans objet quand on part de zéro. */
const variationBp = (n: number, n1: number): number | null => (n1 === 0 ? null : propre(divideMoney((n - n1) * 10_000, Math.abs(n1))));

/** Valeur d'un compte dans une rubrique, ou zéro s'il n'y entre pas (côté du solde compris). */
function montantDans(r: Rubrique, sens: Sens, s: SoldeCompte | undefined): number {
  if (!s || !retenu(r, s.compte)) return 0;
  const v = valeur(s, sens);
  if (r.cote && valeur(s, r.cote) <= 0) return 0;
  return propre(v);
}

/** Les comptes d'une rubrique présents dans l'une des listes, triés. */
function comptesDe(r: Rubrique, ...listes: (readonly SoldeCompte[])[]): Map<string, string> {
  const comptes = new Map<string, string>();
  for (const liste of listes) for (const s of liste) if (retenu(r, s.compte) && !comptes.has(s.compte)) comptes.set(s.compte, s.libelle);
  return new Map([...comptes].sort(([a], [b]) => a.localeCompare(b)));
}

const parCompte = (liste: readonly SoldeCompte[]) => new Map(liste.map((s) => [s.compte, s]));
const estVide = (lignes: LigneNote[]) => lignes.every((l) => l.valeurs.every((v) => v === null || v === 0));

// ------------------------------------------------------------ notes de soldes

function noteSoldes(def: Extract<DefinitionNote, { genre: "soldes" }>, d: DonneesNotes, exercice: string): NoteAnnexe {
  const [n, n1] = def.source === "bilan" ? [d.bilanN, d.bilanN1] : [d.mouvementsN, d.mouvementsN1];
  const an = parCompte(n);
  const an1 = parCompte(n1);
  const lignes: LigneNote[] = [];
  let totalN = 0;
  let totalN1 = 0;

  for (const r of def.rubriques) {
    const sens = r.sens ?? def.sens;
    const signe = sens === def.sens ? 1 : -1;
    const details: LigneNote[] = [];
    let rn = 0;
    let rn1 = 0;
    for (const [compte, libelle] of comptesDe(r, n, n1)) {
      const vn = montantDans(r, sens, an.get(compte));
      const vn1 = montantDans(r, sens, an1.get(compte));
      if (vn === 0 && vn1 === 0) continue;
      details.push({ compte, libelle, niveau: "detail", valeurs: [vn, vn1, propre(vn - vn1), variationBp(vn, vn1)] });
      rn += vn;
      rn1 += vn1;
    }
    if (def.rubriques.length === 1) lignes.push(...details);
    else if (details.length > 0) lignes.push({ libelle: r.libelle, niveau: "rubrique", valeurs: [propre(rn), propre(rn1), propre(rn - rn1), variationBp(rn, rn1)] }, ...details);
    totalN += signe * rn;
    totalN1 += signe * rn1;
  }

  lignes.push({ libelle: def.libelleTotal ?? "Total", niveau: "total", valeurs: [propre(totalN), propre(totalN1), propre(totalN - totalN1), variationBp(totalN, totalN1)] });
  const colonnes: ColonneNote[] = [
    { titre: exercice, format: "montant" },
    { titre: String(Number(exercice) - 1), format: "montant" },
    { titre: "Variation", format: "montant" },
    { titre: "Variation %", format: "taux" },
  ];
  return { numero: def.numero, titre: def.titre, colonnes, lignes, vide: estVide(lignes) };
}

// ------------------------------------------------------- notes de mouvements

function noteMouvements(def: Extract<DefinitionNote, { genre: "mouvements" }>, d: DonneesNotes): NoteAnnexe {
  const ouverture = parCompte(d.bilanN1);
  const mouvements = parCompte(d.mouvementsN);
  const lignes: LigneNote[] = [];
  const totaux = [0, 0, 0, 0];

  for (const r of def.rubriques) {
    const details: LigneNote[] = [];
    const sous = [0, 0, 0, 0];
    for (const [compte, libelle] of comptesDe(r, d.bilanN1, d.mouvementsN)) {
      const o = montantDans(r, def.sens, ouverture.get(compte));
      const m = mouvements.get(compte);
      const augmente = m ? (def.sens === "debit" ? m.debit : m.credit) : 0;
      const diminue = m ? (def.sens === "debit" ? m.credit : m.debit) : 0;
      const valeurs = [o, augmente, diminue, o + augmente - diminue].map(propre);
      if (valeurs.every((v) => v === 0)) continue;
      details.push({ compte, libelle, niveau: "detail", valeurs });
      valeurs.forEach((v, i) => (sous[i] += v));
    }
    if (details.length > 0) lignes.push({ libelle: r.libelle, niveau: "rubrique", valeurs: sous.map(propre) }, ...details);
    sous.forEach((v, i) => (totaux[i] += v));
  }

  lignes.push({ libelle: "Total", niveau: "total", valeurs: totaux.map(propre) });
  const colonnes: ColonneNote[] = ["Ouverture", def.augmentations ?? "Augmentations", def.diminutions ?? "Diminutions", "Clôture"].map((titre) => ({ titre, format: "montant" }));
  return { numero: def.numero, titre: def.titre, colonnes, lignes, vide: estVide(lignes) };
}

// ------------------------------------------------- note 3D : cessions

const CESSIONS = [
  { libelle: "Immobilisations incorporelles", valeur: ["811"], prix: ["821"] },
  { libelle: "Immobilisations corporelles", valeur: ["812"], prix: ["822"] },
  { libelle: "Immobilisations financières", valeur: ["816"], prix: ["826"] },
  { libelle: "Cessions courantes d'immobilisations", valeur: ["654"], prix: ["754"] },
] as const;

function noteCessions(d: DonneesNotes): NoteAnnexe {
  const somme = (prefixes: readonly string[], sens: Sens) => d.mouvementsN.filter((s) => correspond(s.compte, prefixes)).reduce((t, s) => t + valeur(s, sens), 0);
  const lignes: LigneNote[] = CESSIONS.map((c) => {
    const cedee = somme(c.valeur, "debit");
    const prix = somme(c.prix, "credit");
    return { libelle: c.libelle, niveau: "rubrique" as const, valeurs: [cedee, prix, prix - cedee].map(propre) };
  });
  const total = [0, 1, 2].map((i) => propre(lignes.reduce((t, l) => t + (l.valeurs[i] ?? 0), 0)));
  lignes.push({ libelle: "Total", niveau: "total", valeurs: total });
  const colonnes: ColonneNote[] = ["Valeur comptable cédée", "Prix de cession", "Plus ou moins-value"].map((titre) => ({ titre, format: "montant" }));
  return { numero: "3D", titre: "Immobilisations : plus-values et moins-values de cession", colonnes, lignes, vide: estVide(lignes) };
}

// --------------------------------------------- note 34 : fiche de synthèse

function indicateurs(mouvements: readonly SoldeCompte[], bilan: readonly SoldeCompte[]) {
  const sig = new Map(calculerSIG(elementsResultat(mouvements)).map((x) => [x.code, x.montant]));
  const passif = new Map(calculerBilan(bilan).passif.map((p) => [p.code, p.montant]));
  const poste = (code: string) => passif.get(code) ?? 0;
  const cafg = capaciteAutofinancement(mouvements);
  const dividendes = mouvements.filter((s) => s.compte.startsWith("465")).reduce((t, s) => t + s.credit, 0);
  const capitauxPropres = poste("CA") + poste("CD") + poste("CH") + poste("CJ") + poste("CL");
  const dettesFinancieres = poste("DA");
  const resultatNet = sig.get("XI") ?? 0;
  const taux = (num: number, den: number) => (den <= 0 ? null : propre(divideMoney(num * 10_000, den)));
  return {
    montants: [
      ["Chiffre d'affaires", sig.get("XB") ?? 0],
      ["Valeur ajoutée", sig.get("XC") ?? 0],
      ["Excédent brut d'exploitation", sig.get("XD") ?? 0],
      ["Résultat d'exploitation", sig.get("XE") ?? 0],
      ["Résultat financier", sig.get("XF") ?? 0],
      ["Résultat des activités ordinaires", sig.get("XG") ?? 0],
      ["Résultat hors activités ordinaires", sig.get("XH") ?? 0],
      ["Résultat net", resultatNet],
      ["Capacité d'autofinancement globale (CAFG)", cafg],
      ["Dividendes distribués", dividendes],
      ["Autofinancement", cafg - dividendes],
      ["Capitaux propres et ressources assimilées", capitauxPropres],
      ["Dettes financières", dettesFinancieres],
    ] as [string, number][],
    taux: [
      ["Rentabilité économique (résultat d'exploitation / capitaux engagés)", taux(sig.get("XE") ?? 0, capitauxPropres + dettesFinancieres)],
      ["Rentabilité financière (résultat net / capitaux propres)", taux(resultatNet, capitauxPropres)],
      ["Endettement (dettes financières / capitaux propres)", taux(dettesFinancieres, capitauxPropres)],
    ] as [string, number | null][],
  };
}

function ficheSynthese(d: DonneesNotes, exercice: string): NoteAnnexe {
  const n = indicateurs(d.mouvementsN, d.bilanN);
  const n1 = indicateurs(d.mouvementsN1, d.bilanN1);
  const lignes: LigneNote[] = [
    ...n.montants.map(([libelle, v], i): LigneNote => {
      const v1 = n1.montants[i][1];
      return { libelle, niveau: libelle === "Résultat net" || libelle === "Autofinancement" ? "rubrique" : "detail", valeurs: [propre(v), propre(v1), variationBp(v, v1)] };
    }),
    ...n.taux.map(([libelle, v], i): LigneNote => ({ libelle, niveau: "detail", format: "taux", valeurs: [v, n1.taux[i][1], null] })),
  ];
  const colonnes: ColonneNote[] = [
    { titre: exercice, format: "montant" },
    { titre: String(Number(exercice) - 1), format: "montant" },
    { titre: "Variation %", format: "taux" },
  ];
  return { numero: "34", titre: "Fiche de synthèse des principaux indicateurs financiers", colonnes, lignes, vide: estVide(lignes) };
}

/** Les notes du lot 1, dans l'ordre de la liasse. */
export function calculerNotesAnnexes(d: DonneesNotes, exercice: string): NoteAnnexe[] {
  return DEFINITIONS_NOTES.map((def) => {
    switch (def.genre) {
      case "soldes":
        return noteSoldes(def, d, exercice);
      case "mouvements":
        return noteMouvements(def, d);
      case "cessions":
        return noteCessions(d);
      case "synthese":
        return ficheSynthese(d, exercice);
    }
  });
}
