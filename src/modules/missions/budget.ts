/**
 * Budget d'une mission et intervenants : les règles, sans base ni React.
 *
 * Une mission est confiée à un collaborateur. Dans son exécution, il faut
 * parfois des INTERVENANTS pour une tâche précise — manutention, vendeuse,
 * entreprise, prestataire. La mission est alors BUDGÉTISÉE : on ne confie
 * pas plus que le budget, et chaque intervenant est PAYÉ SUR PLACE, contre une
 * DÉCHARGE signée, preuve du paiement.
 *
 * Tout est en francs entiers : le franc CFA n'a pas de subdivision.
 */

export const NATURES_INTERVENANT = { intervenant: "Intervenant", entreprise: "Entreprise", prestataire: "Prestataire" } as const;
export type NatureIntervenant = keyof typeof NATURES_INTERVENANT;
export const estNature = (v: unknown): v is NatureIntervenant => typeof v === "string" && Object.hasOwn(NATURES_INTERVENANT, v);

/** Des tâches courantes, proposées à la saisie ; la tâche reste libre. */
export const TACHES_COURANTES = ["Manutention", "Vendeuse", "Gardiennage", "Transport", "Montage", "Nettoyage", "Animation", "Installation"] as const;

export const STATUTS = ["a_payer", "paye", "annule"] as const;
export type StatutIntervenant = (typeof STATUTS)[number];
export const LIBELLE_STATUT: Record<StatutIntervenant, string> = { a_payer: "À payer", paye: "Payé", annule: "Annulé" };

export const MOYENS = { especes: "Espèces", mobile_money: "Mobile money" } as const;
export type MoyenIntervenant = keyof typeof MOYENS;
export const estMoyen = (v: unknown): v is MoyenIntervenant => typeof v === "string" && Object.hasOwn(MOYENS, v);

export const MONTANT_MAX = 100_000_000;

export interface LigneBudget {
  statut: StatutIntervenant;
  montantConvenu: number;
}

export interface BilanBudget {
  budget: number | null;
  /** Ce qui est confié : les montants convenus, hors annulés. */
  engage: number;
  paye: number;
  /** Convenu mais pas encore payé. */
  aPayer: number;
  /** Budget moins engagé ; nul sans budget. */
  reste: number | null;
}

export function bilanBudget(budget: number | null, lignes: readonly LigneBudget[]): BilanBudget {
  let engage = 0;
  let paye = 0;
  for (const l of lignes) {
    if (l.statut === "annule") continue;
    engage += l.montantConvenu;
    if (l.statut === "paye") paye += l.montantConvenu;
  }
  return { budget, engage, paye, aPayer: engage - paye, reste: budget === null ? null : budget - engage };
}

/** Erreur lisible si le montant ne tient pas, sinon nul. */
export function erreurMontant(montant: number): string | null {
  if (!Number.isInteger(montant) || montant < 1) return "Le montant est un nombre entier de francs, supérieur à zéro.";
  if (montant > MONTANT_MAX) return "Ce montant est sans doute une erreur de saisie.";
  return null;
}

/** Peut-on confier cette tâche pour ce montant ? Le budget d'abord, puis ce qu'il en reste. */
export function erreurEngagement(budget: number | null, engage: number, nouveau: number): string | null {
  const montant = erreurMontant(nouveau);
  if (montant) return montant;
  if (budget === null) return "Fixez d'abord le budget de la mission : un intervenant se paie sur ce budget.";
  if (engage + nouveau > budget) return `Le budget est dépassé de ${(engage + nouveau - budget).toLocaleString("fr-FR")} F : il reste ${Math.max(0, budget - engage).toLocaleString("fr-FR")} F.`;
  return null;
}

/** Le budget se fixe, se relève, ou se réduit — jamais en dessous de ce qui est déjà engagé. */
export function erreurBudget(budget: number, engage: number): string | null {
  if (!Number.isInteger(budget) || budget < 0) return "Le budget est un nombre entier de francs.";
  if (budget > MONTANT_MAX) return "Ce budget est sans doute une erreur de saisie.";
  if (budget < engage) return `Le budget ne peut pas être inférieur à ce qui est déjà confié : ${engage.toLocaleString("fr-FR")} F.`;
  return null;
}

const PASSAGES: Record<StatutIntervenant, readonly StatutIntervenant[]> = { a_payer: ["paye", "annule"], paye: [], annule: [] };
export const passagePermis = (de: StatutIntervenant, vers: StatutIntervenant): boolean => PASSAGES[de].includes(vers);

/** Ce qui manque à un paiement pour valoir preuve : qui a reçu, et la décharge. */
export function manqueAuPaiement(recuPar: string, aDecharge: boolean): string | null {
  if (recuPar.trim().length < 2) return "Indiquez qui a reçu l'argent, tel qu'il signe la décharge.";
  if (!aDecharge) return "Joignez la décharge signée (photo ou scan) : sans elle, le paiement n'est pas prouvé.";
  return null;
}
