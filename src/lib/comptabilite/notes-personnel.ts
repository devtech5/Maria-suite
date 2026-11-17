/**
 * Notes annexes tirées du personnel et de l'historique (lot 2) :
 * 13 capital, 27B effectifs et masse salariale, 31 cinq derniers exercices.
 *
 * Les effectifs viennent des fiches des collaborateurs (`employees`), pas des
 * comptes ; la masse salariale vient des bulletins de paie validés, et se
 * rapproche des rémunérations comptabilisées. Les intervenants (`workers`) ne
 * sont pas des salariés : ils n'entrent pas dans les effectifs.
 *
 * Ce fichier ne dépend ni de la base ni de React.
 */

import { divideMoney } from "@/lib/money";

import { calculerSIG, elementsResultat, type SoldeCompte } from "./etats";
import { CATEGORIES_SOCIOPROFESSIONNELLES, type CategorieSocioprofessionnelle } from "./categories-socioprofessionnelles";
import { intertitre, type ColonneNote, type LigneNote, type NoteAnnexe } from "./notes";

export { CATEGORIES_SOCIOPROFESSIONNELLES, estCategorie, type CategorieSocioprofessionnelle } from "./categories-socioprofessionnelles";

// ------------------------------------------------------------- référentiels

/**
 * Les dix-sept États de l'OHADA, reconnus à la nationalité saisie en clair
 * (« Ivoirienne », « malien », « Burkinabè »). Mali et Niger se testent au mot
 * près : « nigériane » est du Nigeria, hors OHADA.
 */
const ETATS_OHADA: { pays: readonly string[]; motif: RegExp }[] = [
  { pays: ["CI"], motif: /ivoir|cote d'?ivoire/ },
  { pays: ["BJ"], motif: /benin/ },
  { pays: ["BF"], motif: /burkin/ },
  { pays: ["CM"], motif: /camero/ },
  { pays: ["CF"], motif: /centrafric/ },
  { pays: ["KM"], motif: /comor/ },
  { pays: ["CG", "CD"], motif: /congo/ },
  { pays: ["GA"], motif: /gabon/ },
  { pays: ["GN", "GW", "GQ"], motif: /guine/ },
  { pays: ["ML"], motif: /^mali(en|enne)?\b/ },
  { pays: ["NE"], motif: /^niger(ien|ienne)?\b/ },
  { pays: ["SN"], motif: /senegal/ },
  { pays: ["TD"], motif: /tchad/ },
  { pays: ["TG"], motif: /togo/ },
];

export type GroupeNationalite = "national" | "ohada" | "hors_ohada" | "inconnu";

const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .trim();

/** Nationaux, autres États OHADA ou hors OHADA, au regard du pays de l'entreprise. */
export function groupeNationalite(nationalite: string | null, paysEntreprise: string): GroupeNationalite {
  const texte = normaliser(nationalite ?? "");
  if (!texte) return "inconnu";
  const etat = ETATS_OHADA.find((e) => e.motif.test(texte));
  if (!etat) return "hors_ohada";
  return etat.pays.includes(paysEntreprise.toUpperCase()) ? "national" : "ohada";
}

// ---------------------------------------------------------------- effectifs

export interface Collaborateur {
  id: string;
  /** Entrée, AAAA-MM-JJ. */
  debut: string;
  /** Sortie, AAAA-MM-JJ ; nulle s'il est toujours en poste. */
  fin: string | null;
  sexe: "F" | "M" | null;
  nationalite: string | null;
  /** Catégorie du poste occupé ; nulle tant que le poste n'est pas classé. */
  categorie: CategorieSocioprofessionnelle | null;
}

const enPosteLe = (c: Collaborateur, jour: string) => c.debut <= jour && (c.fin === null || c.fin >= jour);

/** Dernier jour d'un mois, AAAA-MM-JJ, sans passer par un objet Date. */
function finDeMois(annee: number, mois: number): string {
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  const jours = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
  return `${annee}-${String(mois).padStart(2, "0")}-${jours}`;
}

/** Effectif moyen de l'exercice : la moyenne des douze fins de mois, arrondie à l'unité. */
export function effectifMoyen(collaborateurs: readonly Collaborateur[], exercice: string): number {
  const annee = Number(exercice);
  let cumul = 0;
  for (let mois = 1; mois <= 12; mois++) {
    const jour = finDeMois(annee, mois);
    cumul += collaborateurs.filter((c) => enPosteLe(c, jour)).length;
  }
  return divideMoney(cumul, 12);
}

const propre = (v: number) => (v === 0 ? 0 : v);
const somme = (soldes: readonly SoldeCompte[], prefixes: readonly string[]) =>
  propre(soldes.filter((s) => prefixes.some((p) => s.compte.startsWith(p))).reduce((t, s) => t + s.debit - s.credit, 0));

/** Colonne d'un collaborateur dans la grille : groupe de nationalité et sexe, ou « non renseigné ». */
function colonneDe(c: Collaborateur, pays: string): number {
  const groupe = groupeNationalite(c.nationalite, pays);
  if (groupe === "inconnu" || c.sexe === null) return 6;
  const rang = { national: 0, ohada: 2, hors_ohada: 4 }[groupe];
  return rang + (c.sexe === "F" ? 1 : 0);
}

const COLONNES_GRILLE = ["Nationaux H", "Nationaux F", "Autres OHADA H", "Autres OHADA F", "Hors OHADA H", "Hors OHADA F", "Non renseigné", "Total"];

/** Une grille catégories × (nationalité, sexe), avec sa ligne de total. */
function grille(collaborateurs: readonly Collaborateur[], pays: string, valeur: (c: Collaborateur) => number, libelleTotal: string): LigneNote[] {
  const rangees = [
    ...CATEGORIES_SOCIOPROFESSIONNELLES.map((cat) => ({ libelle: cat.libelle, membres: collaborateurs.filter((c) => c.categorie === cat.cle) })),
    { libelle: "Catégorie non renseignée", membres: collaborateurs.filter((c) => c.categorie === null) },
  ];
  const total = Array<number>(8).fill(0);
  const lignes: LigneNote[] = [];
  for (const r of rangees) {
    const v = Array<number>(8).fill(0);
    for (const c of r.membres) {
      const montant = valeur(c);
      v[colonneDe(c, pays)] += montant;
      v[7] += montant;
    }
    if (v[7] === 0 && r.libelle === "Catégorie non renseignée") continue;
    v.forEach((x, i) => (total[i] += x));
    lignes.push({ libelle: r.libelle, niveau: "detail", valeurs: v.map(propre) });
  }
  lignes.push({ libelle: libelleTotal, niveau: "total", valeurs: total.map(propre) });
  return lignes;
}

/** Une ligne qui n'a de valeur qu'au total : un montant comptable, sans ventilation. */
const auTotal = (libelle: string, montant: number): LigneNote => ({ libelle, niveau: "detail", valeurs: [null, null, null, null, null, null, null, montant] });

export function noteEffectifs(e: {
  exercice: string;
  paysEntreprise: string;
  collaborateurs: readonly Collaborateur[];
  /** Brut des bulletins validés de l'exercice, par collaborateur. */
  masses: ReadonlyMap<string, number>;
  mouvements: readonly SoldeCompte[];
}): NoteAnnexe {
  const finExercice = `${e.exercice}-12-31`;
  const enPoste = e.collaborateurs.filter((c) => enPosteLe(c, finExercice));
  const payes = e.collaborateurs.filter((c) => (e.masses.get(c.id) ?? 0) !== 0);
  const lignes: LigneNote[] = [
    intertitre("Effectifs au 31 décembre"),
    ...grille(enPoste, e.paysEntreprise, () => 1, "Effectif au 31 décembre"),
    intertitre("Masse salariale brute de l'exercice (bulletins validés)"),
    ...grille(payes, e.paysEntreprise, (c) => e.masses.get(c.id) ?? 0, "Masse salariale brute"),
    intertitre("Charges de personnel comptabilisées"),
    auTotal("Rémunérations comptabilisées (661 à 663)", somme(e.mouvements, ["661", "662", "663"])),
    auTotal("Charges sociales (664, 668)", somme(e.mouvements, ["664", "668"])),
    auTotal("Rémunération de l'exploitant (666)", somme(e.mouvements, ["666"])),
    auTotal("Personnel extérieur facturé (667)", somme(e.mouvements, ["667"])),
  ];

  const remarques: string[] = [];
  const sansCategorie = new Set([...enPoste, ...payes].filter((c) => c.categorie === null).map((c) => c.id)).size;
  if (sansCategorie > 0) {
    remarques.push(`${sansCategorie} collaborateur${sansCategorie > 1 ? "s" : ""} sans catégorie : classez son poste dans « Équipe › Postes ».`);
  }
  const nonRenseignes = new Set([...enPoste, ...payes].filter((c) => colonneDe(c, e.paysEntreprise) === 6).map((c) => c.id)).size;
  if (nonRenseignes > 0) {
    remarques.push(`${nonRenseignes} fiche${nonRenseignes > 1 ? "s" : ""} sans sexe ou sans nationalité : complétez l'état civil du collaborateur.`);
  }

  const colonnes: ColonneNote[] = COLONNES_GRILLE.map((titre) => ({ titre, format: "montant" }));
  const vide = enPoste.length === 0 && payes.length === 0 && lignes.every((l) => l.valeurs.every((v) => v === null || v === 0));
  return { numero: "27B", titre: "Effectifs, masse salariale et personnel extérieur", colonnes, lignes, vide, remarques };
}

// ------------------------------------------------------------------ capital

const capitalAuBilan = (bilan: readonly SoldeCompte[]) => propre(-somme(bilan, ["101", "102", "103", "104"]));

export function noteCapital(c: {
  exercice: string;
  /** Capital social de la fiche Entreprise. */
  capitalDeclare: number | null;
  /** Valeur nominale d'une action ou d'une part, fiche Entreprise. */
  valeurNominale: number | null;
  bilanN: readonly SoldeCompte[];
  bilanN1: readonly SoldeCompte[];
}): NoteAnnexe {
  const auBilan = capitalAuBilan(c.bilanN);
  const divisible = c.capitalDeclare !== null && c.valeurNominale !== null && c.valeurNominale > 0 && c.capitalDeclare % c.valeurNominale === 0;
  const parts = divisible ? (c.capitalDeclare as number) / (c.valeurNominale as number) : null;
  const lignes: LigneNote[] = [
    { libelle: "Capital au bilan (comptes 101 à 104)", niveau: "rubrique", valeurs: [auBilan, capitalAuBilan(c.bilanN1)] },
    { libelle: "Dont capital souscrit non appelé (109)", niveau: "detail", valeurs: [somme(c.bilanN, ["109"]), somme(c.bilanN1, ["109"])] },
    { libelle: "Capital social déclaré (fiche Entreprise)", niveau: "detail", valeurs: [c.capitalDeclare, null] },
    { libelle: "Valeur nominale d'une part", niveau: "detail", valeurs: [c.valeurNominale, null] },
    { libelle: "Nombre de parts", niveau: "total", valeurs: [parts, null] },
  ];

  const remarques: string[] = [];
  if (c.capitalDeclare !== null && auBilan !== 0 && c.capitalDeclare !== auBilan) {
    remarques.push("Le capital déclaré dans la fiche Entreprise diffère du capital comptabilisé : à rapprocher avant de reporter la note.");
  }
  if (c.valeurNominale === null) remarques.push("Renseignez la valeur nominale d'une part dans la fiche Entreprise pour obtenir le nombre de parts.");
  else if (c.capitalDeclare !== null && !divisible) remarques.push("Le capital déclaré n'est pas un multiple de la valeur nominale d'une part.");

  const colonnes: ColonneNote[] = [
    { titre: c.exercice, format: "montant" },
    { titre: String(Number(c.exercice) - 1), format: "montant" },
  ];
  const vide = lignes.every((l) => l.valeurs.every((v) => v === null || v === 0));
  return { numero: "13", titre: "Capital : valeur nominale des actions ou parts", colonnes, lignes, vide, remarques };
}

// ------------------------------------------------- cinq derniers exercices

export interface ExerciceHistorique {
  exercice: string;
  /** Mouvements de l'exercice, clôture exclue. */
  mouvements: readonly SoldeCompte[];
  /** Soldes cumulés à sa clôture. */
  bilan: readonly SoldeCompte[];
  /** Dividendes décidés sur son résultat (affectation). */
  dividendes: number;
  effectifMoyen: number;
}

/** Note 31, l'exercice le plus récent d'abord. */
export function noteCinqExercices(exercices: readonly ExerciceHistorique[]): NoteAnnexe {
  const colonnes = exercices.map((x) => {
    const e = elementsResultat(x.mouvements);
    const sig = new Map(calculerSIG(e).map((l) => [l.code, l.montant]));
    return {
      capital: capitalAuBilan(x.bilan),
      ca: sig.get("XB") ?? 0,
      avantImpot: sig.get("XG") ?? 0,
      participation: e.participation,
      impot: e.impotResultat,
      net: sig.get("XI") ?? 0,
      distribue: x.dividendes,
      effectif: x.effectifMoyen,
      masse: somme(x.mouvements, ["661", "662", "663", "666"]),
      sociaux: somme(x.mouvements, ["664", "668"]),
    };
  });
  type Cle = keyof (typeof colonnes)[number];
  const rangee = (libelle: string, cle: Cle, niveau: LigneNote["niveau"] = "detail"): LigneNote => ({ libelle, niveau, valeurs: colonnes.map((c) => propre(c[cle])) });

  const lignes: LigneNote[] = [
    intertitre("Structure du capital à la clôture"),
    rangee("Capital social", "capital"),
    intertitre("Opérations et résultats de l'exercice"),
    rangee("Chiffre d'affaires hors taxes", "ca"),
    rangee("Résultat des activités ordinaires avant impôt", "avantImpot"),
    rangee("Participation des travailleurs", "participation"),
    rangee("Impôt sur le résultat", "impot"),
    rangee("Résultat net", "net", "rubrique"),
    rangee("Résultat distribué", "distribue"),
    intertitre("Personnel et politique salariale"),
    rangee("Effectif moyen des collaborateurs", "effectif"),
    rangee("Masse salariale", "masse"),
    rangee("Avantages sociaux (charges sociales)", "sociaux"),
  ];
  const vide = lignes.every((l) => l.valeurs.every((v) => v === null || v === 0));
  return {
    numero: "31",
    titre: "Répartition du résultat et éléments caractéristiques des cinq derniers exercices",
    colonnes: exercices.map((x) => ({ titre: x.exercice, format: "montant" })),
    lignes,
    vide,
  };
}
