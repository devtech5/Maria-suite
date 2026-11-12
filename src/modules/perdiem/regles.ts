/**
 * Perdiem : les règles, sans base ni React.
 *
 * Le PERDIEM est l'indemnité journalière d'un collaborateur en déplacement
 * ou en mission. Le BARÈME est la grille des montants par jour — « Abidjan »,
 * « Intérieur du pays », « Zone minière », « International » — que la
 * comptable tient : elle y ajoute une ligne, la modifie, la supprime.
 *
 * Une ATTRIBUTION donne un perdiem à un collaborateur pour un nombre de
 * jours, éventuellement pour une mission (`PD-AAAA-NNNNN`). Le montant du
 * jour est FIGÉ à l'attribution : modifier le barème ensuite ne réécrit pas
 * ce qui a été attribué, ni ce qui a été payé.
 *
 * Tout est en francs entiers : le franc CFA n'a pas de subdivision.
 */

export const STATUTS = ["a_payer", "paye", "annule"] as const;
export type StatutPerdiem = (typeof STATUTS)[number];

export const LIBELLE_STATUT: Record<StatutPerdiem, string> = { a_payer: "À payer", paye: "Payé", annule: "Annulé" };

export const MOYENS = { especes: "Espèces", mobile_money: "Mobile money", virement: "Virement" } as const;
export type MoyenPerdiem = keyof typeof MOYENS;

export const estMoyen = (v: unknown): v is MoyenPerdiem => typeof v === "string" && Object.hasOwn(MOYENS, v);

/** Une mission dure rarement plus d'une saison : au-delà, c'est une erreur de saisie. */
export const JOURS_MAX = 366;
export const MONTANT_MAX = 10_000_000;

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const estDate = (v: string): boolean => {
  if (!DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};

/** Le montant d'une attribution : des jours entiers par un montant journalier entier. */
export function montantAttribution(jours: number, journalier: number): number {
  return jours * journalier;
}

/** Erreur lisible si le nombre de jours ne tient pas, sinon nul. */
export function erreurJours(jours: number): string | null {
  if (!Number.isInteger(jours) || jours < 1) return "Indiquez un nombre de jours entier, d'au moins 1.";
  if (jours > JOURS_MAX) return `Un perdiem couvre ${JOURS_MAX} jours au plus.`;
  return null;
}

/** Erreur lisible si le montant du jour ne tient pas, sinon nul. */
export function erreurMontant(montant: number): string | null {
  if (!Number.isInteger(montant) || montant < 1) return "Le montant du jour est un nombre entier de francs, supérieur à zéro.";
  if (montant > MONTANT_MAX) return `Au-delà de ${MONTANT_MAX.toLocaleString("fr-FR")} F par jour, la saisie est sans doute fausse.`;
  return null;
}

const PASSAGES: Record<StatutPerdiem, readonly StatutPerdiem[]> = { a_payer: ["paye", "annule"], paye: [], annule: [] };

/** Un perdiem payé ne revient pas en arrière : il s'est dépensé. Un annulé non plus. */
export const passagePermis = (de: StatutPerdiem, vers: StatutPerdiem): boolean => PASSAGES[de].includes(vers);

export function formatNumero(annee: number): { cle: string; prefix: string; padding: number; periode: string } {
  return { cle: "perdiem", prefix: `PD-${annee}-`, padding: 5, periode: String(annee) };
}

export interface LigneAttribution {
  statut: StatutPerdiem;
  montantTotal: number;
}

export interface BilanPerdiem {
  aPayer: number;
  paye: number;
  nombreAPayer: number;
}

/** Ce qui reste à payer et ce qui l'est, sur une liste d'attributions ; les annulées ne comptent pas. */
export function bilanPerdiem(lignes: readonly LigneAttribution[]): BilanPerdiem {
  let aPayer = 0;
  let paye = 0;
  let nombreAPayer = 0;
  for (const l of lignes) {
    if (l.statut === "a_payer") {
      aPayer += l.montantTotal;
      nombreAPayer += 1;
    } else if (l.statut === "paye") paye += l.montantTotal;
  }
  return { aPayer, paye, nombreAPayer };
}
