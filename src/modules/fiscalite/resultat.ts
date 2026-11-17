import type { CodeJournal, Ecriture, LigneEcriture } from "@/lib/comptabilite/ecritures";
import { allocate, rateOf } from "@/lib/money";

/**
 * Fin d'exercice : impôt sur les bénéfices, affectation du résultat,
 * contrepassation. Règles pures, sans base ni React.
 *
 * Même principe que le barème de paie : la règle d'impôt vient du pays, elle
 * est préremplie et reste « à vérifier » tant qu'un responsable ne l'a pas
 * attestée. Taux en points de base, montants en francs entiers.
 */

// ----------------------------------------------------------------- règle

export interface RegleImpotBenefices {
  /** Taux de l'impôt sur le résultat fiscal : 2500 = 25 %. */
  tauxBp: number;
  /** Impôt minimum forfaitaire, en points de base du chiffre d'affaires. 0 : pas de minimum. */
  imfTauxBp: number;
  imfMinimum: number;
  imfMaximum: number;
  /** Échéances des fractions, dans l'année qui suit l'exercice : « 04-20 ». */
  echeances: string[];
  /** D'où vient la règle, pour qui la vérifie. */
  source: string;
}

const REGLES: Record<string, RegleImpotBenefices> = {
  CI: {
    tauxBp: 2_500,
    imfTauxBp: 50,
    imfMinimum: 3_000_000,
    imfMaximum: 35_000_000,
    echeances: ["04-20", "06-20", "09-20"],
    source:
      "Code général des impôts ivoirien : impôt sur les bénéfices à 25 %, impôt minimum forfaitaire de 0,5 % du chiffre d'affaires " +
      "(3 à 35 millions), payé en trois fractions. Taux, base du minimum et dates à confirmer auprès de la DGI pour votre régime.",
  },
};

export const REGLE_IMPOT_INCONNUE: RegleImpotBenefices = {
  tauxBp: 0,
  imfTauxBp: 0,
  imfMinimum: 0,
  imfMaximum: 0,
  echeances: ["04-30"],
  source: "Règle du pays non renseignée : à régler et faire vérifier.",
};

export function regleImpotDuPays(pays: string | null | undefined): RegleImpotBenefices {
  return (pays && REGLES[pays.toUpperCase()]) || REGLE_IMPOT_INCONNUE;
}

const ECHEANCE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Contrôle d'une règle saisie : le motif du refus, ou `null`. */
export function refusRegleImpot(r: RegleImpotBenefices): string | null {
  for (const t of [r.tauxBp, r.imfTauxBp]) if (!Number.isInteger(t) || t < 0 || t > 6_000) return "Un taux doit être compris entre 0 et 60 %.";
  for (const m of [r.imfMinimum, r.imfMaximum]) if (!Number.isInteger(m) || m < 0) return "Les bornes du minimum sont des montants entiers positifs.";
  if (r.imfMaximum > 0 && r.imfMinimum > r.imfMaximum) return "Le minimum de l'impôt forfaitaire dépasse son maximum.";
  if (r.echeances.length === 0 || r.echeances.length > 12) return "Prévoyez de une à douze échéances.";
  if (r.echeances.some((e) => !ECHEANCE.test(e))) return "Une échéance s'écrit MM-JJ : 04-20 pour le 20 avril.";
  if (new Set(r.echeances).size !== r.echeances.length) return "Deux échéances tombent le même jour.";
  return null;
}

// ----------------------------------------------------------------- impôt

export interface ElementsImpot {
  /** Résultat comptable avant impôt : classes 6 à 8, hors 89. */
  resultatComptable: number;
  /** Charges non déductibles réintégrées (amendes, excédents d'amortissement…). */
  reintegrations: number;
  /** Produits non imposables ou déficits reportés, déduits. */
  deductions: number;
  /** Base de l'impôt minimum. */
  chiffreAffaires: number;
}

export interface DeterminationImpot extends ElementsImpot {
  resultatFiscal: number;
  /** Impôt au taux sur le résultat fiscal, nul s'il est déficitaire. */
  impotTheorique: number;
  /** Impôt minimum forfaitaire, borné. */
  imf: number;
  /** Le plus élevé des deux : ce qui est dû. */
  impotDu: number;
}

export function determinerImpot(e: ElementsImpot, r: RegleImpotBenefices): DeterminationImpot {
  for (const v of [e.reintegrations, e.deductions, e.chiffreAffaires]) {
    if (!Number.isInteger(v) || v < 0) throw new Error("Réintégrations, déductions et chiffre d'affaires sont des montants entiers positifs.");
  }
  if (!Number.isInteger(e.resultatComptable)) throw new Error("Résultat comptable invalide.");
  const resultatFiscal = e.resultatComptable + e.reintegrations - e.deductions;
  const impotTheorique = resultatFiscal > 0 ? rateOf(resultatFiscal, r.tauxBp) : 0;
  let imf = r.imfTauxBp > 0 ? rateOf(e.chiffreAffaires, r.imfTauxBp) : 0;
  if (r.imfTauxBp > 0) {
    imf = Math.max(imf, r.imfMinimum);
    if (r.imfMaximum > 0) imf = Math.min(imf, r.imfMaximum);
  }
  return { ...e, resultatFiscal, impotTheorique, imf, impotDu: Math.max(impotTheorique, imf) };
}

export interface Fraction {
  rang: number;
  echeance: string;
  montant: number;
}

/**
 * L'impôt d'un exercice se paie l'année suivante, en fractions égales aux
 * échéances de la règle. La somme des fractions retombe sur l'impôt au franc
 * près : le reste de la division va aux premières.
 */
export function fractionsImpot(exercice: string, impotDu: number, echeances: readonly string[]): Fraction[] {
  if (impotDu <= 0) return [];
  const suivante = Number(exercice) + 1;
  const dates = [...echeances].sort();
  return allocate(impotDu, dates.length).map((montant, i) => ({ rang: i + 1, echeance: `${suivante}-${dates[i]}`, montant }));
}

const ligne = (compte: string, libelleCompte: string, debit: number, credit: number): LigneEcriture => ({ compte, libelleCompte, debit, credit });

export const COMPTE_IMPOT_CHARGE = { numero: "891", libelle: "Impôts sur les bénéfices de l'exercice" } as const;
export const COMPTE_IMPOT_ETAT = { numero: "441", libelle: "État, impôt sur les bénéfices" } as const;

/** Constatation au 31 décembre : la charge d'impôt et la dette envers l'État. */
export function ecritureImpot(p: { exercice: string; piece: string; impotDu: number }): Ecriture {
  if (!Number.isInteger(p.impotDu) || p.impotDu <= 0) throw new Error("Aucun impôt à constater.");
  return {
    journal: "OD",
    date: `${p.exercice}-12-31`,
    piece: p.piece,
    libelle: `Impôt sur les bénéfices de l'exercice ${p.exercice}`,
    lignes: [ligne(COMPTE_IMPOT_CHARGE.numero, COMPTE_IMPOT_CHARGE.libelle, p.impotDu, 0), ligne(COMPTE_IMPOT_ETAT.numero, COMPTE_IMPOT_ETAT.libelle, 0, p.impotDu)],
  };
}

/** Paiement d'une fraction : la dette envers l'État s'éteint d'autant. */
export function ecritureFractionImpot(p: {
  exercice: string;
  rang: number;
  piece: string;
  date: string;
  montant: number;
  tresorerie: { numero: string; libelle: string; journal: CodeJournal };
}): Ecriture {
  if (!Number.isInteger(p.montant) || p.montant <= 0) throw new Error("Rien à payer.");
  return {
    journal: p.tresorerie.journal,
    date: p.date,
    piece: p.piece,
    libelle: `Impôt sur les bénéfices ${p.exercice}, fraction ${p.rang}`,
    lignes: [ligne(COMPTE_IMPOT_ETAT.numero, COMPTE_IMPOT_ETAT.libelle, p.montant, 0), ligne(p.tresorerie.numero, p.tresorerie.libelle, 0, p.montant)],
  };
}

// ------------------------------------------------------------ affectation

/**
 * Ce que l'assemblée décide du résultat d'un exercice clos.
 *
 * Bénéfice : réserve légale, autres réserves, dividendes et report à nouveau
 * se partagent tout le bénéfice. Perte : elle s'impute sur les réserves ou
 * reste en report à nouveau débiteur.
 */
export interface Affectation {
  reserveLegale: number;
  autresReserves: number;
  dividendes: number;
  /** Report à nouveau : créditeur (121) pour un bénéfice, débiteur (129) pour une perte. */
  reportANouveau: number;
}

export const COMPTES_AFFECTATION = {
  benefice: { numero: "131", libelle: "Résultat net : bénéfice" },
  perte: { numero: "139", libelle: "Résultat net : perte" },
  reserveLegale: { numero: "111", libelle: "Réserve légale" },
  autresReserves: { numero: "118", libelle: "Autres réserves" },
  dividendes: { numero: "465", libelle: "Associés, dividendes à payer" },
  reportCrediteur: { numero: "121", libelle: "Report à nouveau créditeur" },
  reportDebiteur: { numero: "129", libelle: "Report à nouveau débiteur" },
} as const;

/** Dotation indicative de la réserve légale : un dixième du bénéfice (AUSCGIE), tant qu'elle n'atteint pas le cinquième du capital. */
export function reserveLegaleSuggeree(resultat: number): number {
  return resultat > 0 ? Math.floor(resultat / 10) : 0;
}

export function refusAffectation(resultat: number, a: Affectation): string | null {
  const parts = [a.reserveLegale, a.autresReserves, a.dividendes, a.reportANouveau];
  if (parts.some((v) => !Number.isInteger(v) || v < 0)) return "Chaque part est un montant entier positif.";
  const total = parts.reduce((t, v) => t + v, 0);
  if (resultat === 0) return "Le résultat est nul : rien à affecter.";
  if (resultat < 0) {
    if (a.reserveLegale || a.dividendes) return "Une perte ne dote aucune réserve et ne distribue rien : imputez-la sur les réserves ou en report à nouveau.";
    if (total !== -resultat) return `La perte de ${(-resultat).toLocaleString("fr-FR")} F doit être imputée en entier.`;
    return null;
  }
  if (total !== resultat) return `Le bénéfice de ${resultat.toLocaleString("fr-FR")} F doit être affecté en entier : ${total.toLocaleString("fr-FR")} F répartis.`;
  return null;
}

/** L'écriture d'affectation, à la date de la décision. */
export function ecritureAffectation(p: { exercice: string; piece: string; date: string; resultat: number; affectation: Affectation }): Ecriture {
  const refus = refusAffectation(p.resultat, p.affectation);
  if (refus) throw new Error(refus);
  const a = p.affectation;
  const C = COMPTES_AFFECTATION;
  const lignes: LigneEcriture[] = [];
  if (p.resultat > 0) {
    lignes.push(ligne(C.benefice.numero, C.benefice.libelle, p.resultat, 0));
    if (a.reserveLegale) lignes.push(ligne(C.reserveLegale.numero, C.reserveLegale.libelle, 0, a.reserveLegale));
    if (a.autresReserves) lignes.push(ligne(C.autresReserves.numero, C.autresReserves.libelle, 0, a.autresReserves));
    if (a.dividendes) lignes.push(ligne(C.dividendes.numero, C.dividendes.libelle, 0, a.dividendes));
    if (a.reportANouveau) lignes.push(ligne(C.reportCrediteur.numero, C.reportCrediteur.libelle, 0, a.reportANouveau));
  } else {
    if (a.autresReserves) lignes.push(ligne(C.autresReserves.numero, C.autresReserves.libelle, a.autresReserves, 0));
    if (a.reportANouveau) lignes.push(ligne(C.reportDebiteur.numero, C.reportDebiteur.libelle, a.reportANouveau, 0));
    lignes.push(ligne(C.perte.numero, C.perte.libelle, 0, -p.resultat));
  }
  return { journal: "OD", date: p.date, piece: p.piece, libelle: `Affectation du résultat de l'exercice ${p.exercice}`, lignes };
}

// -------------------------------------------------------- contrepassation

/**
 * L'écriture inverse d'une autre : chaque débit devient crédit. Une écriture
 * passée ne s'efface pas, elle s'annule par son contraire, et les deux restent
 * au journal.
 */
export function contrepassation(e: Pick<Ecriture, "journal" | "lignes" | "libelle">, p: { piece: string; date: string; motif: string }): Ecriture {
  return {
    journal: e.journal,
    date: p.date,
    piece: p.piece,
    libelle: `Annulation — ${e.libelle} (${p.motif})`.slice(0, 250),
    lignes: e.lignes.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
}

/** Raisons de refuser la réouverture d'un exercice clos. */
export function refusReouverture(p: { exercice: string; clos: boolean; suivantClos: boolean; motif: string }): string | null {
  if (!/^\d{4}$/.test(p.exercice)) return "Exercice invalide.";
  if (!p.clos) return `L'exercice ${p.exercice} n'est pas clôturé.`;
  if (p.suivantClos) return `L'exercice ${Number(p.exercice) + 1} est clôturé : rouvrez-le d'abord, les exercices se rouvrent du plus récent au plus ancien.`;
  if (p.motif.trim().length < 5) return "Dites pourquoi l'exercice est rouvert : la réouverture se trace.";
  return null;
}
