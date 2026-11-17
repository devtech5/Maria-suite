/**
 * Notes annexes rédigées par le comptable (lot 3).
 *
 * Elles portent ce que les écritures ne disent pas : sûretés consenties,
 * méthodes comptables, engagements, informations sociales. Une note se
 * rédige par exercice, ou se déclare « néant » ; une note absente n'est pas
 * un néant, elle est signalée à rédiger dans la liasse.
 *
 * Ce fichier ne dépend ni de la base ni de React.
 */

import { ORDRE_LIASSE, type NoteAnnexe } from "./notes";

export const NOTES_A_REDIGER = [
  {
    numero: "1",
    titre: "Dettes garanties par des sûretés réelles",
    aide: "Hypothèques, nantissements, gages et cautions consentis : créancier, nature de la sûreté, bien grevé, montant garanti.",
  },
  {
    numero: "2",
    titre: "Informations obligatoires",
    aide: "Conformité au SYSCOHADA révisé, dérogations aux postulats et conventions comptables, méthodes d'évaluation (stocks, amortissements, dépréciations), changements de méthode.",
  },
  { numero: "3B", titre: "Biens pris en location-acquisition", aide: "Nature du bien, bailleur, durée du contrat, redevances de l'exercice et restant à payer." },
  { numero: "3E", titre: "Informations sur les réévaluations effectuées par l'entité", aide: "Date et nature de la réévaluation, biens concernés, écart constaté et son traitement." },
  { numero: "3F", titre: "Tableau d'étalement des charges immobilisées", aide: "Charges encore étalées : nature, montant d'origine, durée, part de l'exercice et reste à étaler." },
  { numero: "15B", titre: "Autres fonds propres", aide: "Titres participatifs, avances conditionnées, autres fonds propres : nature, montant, conditions." },
  { numero: "16B", titre: "Engagements de retraite et avantages assimilés", aide: "Indemnités de fin de carrière : méthode de calcul, hypothèses retenues, montant de l'engagement et part provisionnée." },
  { numero: "16C", titre: "Actifs et passifs éventuels", aide: "Litiges en cours, garanties données ou reçues, risques non provisionnés : nature et estimation." },
  { numero: "32", titre: "Production de l'exercice", aide: "Production vendue, stockée et immobilisée, par produit ou par service : unités, quantités et valeurs." },
  { numero: "33", titre: "Achats destinés à la production", aide: "Matières et fournitures achetées pour produire : nature, quantités et valeurs." },
  { numero: "35", titre: "Informations sociales, environnementales et sociétales", aide: "Emploi et formation, santé et sécurité au travail, impact environnemental, engagements envers les communautés." },
] as const;

export type NumeroNoteRedigee = (typeof NOTES_A_REDIGER)[number]["numero"];

export const estNoteRedigee = (numero: string): numero is NumeroNoteRedigee => NOTES_A_REDIGER.some((n) => n.numero === numero);

/** Une note tient en quelques pages : au-delà, c'est un rapport, qui se joint à part. */
export const LONGUEUR_MAX_NOTE = 20_000;

export interface Redaction {
  numero: string;
  texte: string;
  neant: boolean;
}

/** Pourquoi une rédaction est refusée, ou `null` si elle est recevable. */
export function verifierRedaction(r: Redaction): string | null {
  if (!estNoteRedigee(r.numero)) return "Cette note n'est pas une note à rédiger.";
  const texte = r.texte.trim();
  if (texte.length > LONGUEUR_MAX_NOTE) return `Texte trop long : ${LONGUEUR_MAX_NOTE} caractères au plus.`;
  if (r.neant && texte) return "Une note « néant » ne porte pas de texte : videz-le, ou décochez « néant ».";
  if (!r.neant && !texte) return "Rédigez le texte de la note, ou déclarez-la « néant ».";
  return null;
}

/** Paragraphes du texte : lignes blanches comme séparateur, espaces de bord retirés. */
const paragraphes = (texte: string) =>
  texte
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .map((l) => l.trim())
        .join("\n")
        .trim(),
    )
    .filter(Boolean);

/** La note telle qu'elle s'imprime : texte, néant, ou à rédiger. */
export function noteRedigee(numero: NumeroNoteRedigee, redaction: Redaction | undefined): NoteAnnexe {
  const def = NOTES_A_REDIGER.find((n) => n.numero === numero) ?? NOTES_A_REDIGER[0];
  return {
    numero,
    titre: def.titre,
    colonnes: [],
    lignes: [],
    texte: redaction && !redaction.neant ? paragraphes(redaction.texte) : [],
    vide: redaction?.neant ?? false,
    aRediger: redaction === undefined,
  };
}

const rang = (numero: string) => ORDRE_LIASSE.indexOf(numero);

/** Notes de l'exercice précédent à reprendre : celles qui n'ont pas encore de rédaction cette année. */
export function aReprendre(precedentes: readonly Redaction[], actuelles: readonly Redaction[]): Redaction[] {
  const dejaRedigees = new Set(actuelles.map((r) => r.numero));
  return precedentes.filter((r) => estNoteRedigee(r.numero) && !dejaRedigees.has(r.numero)).sort((a, b) => rang(a.numero) - rang(b.numero));
}
