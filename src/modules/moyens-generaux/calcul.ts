/**
 * Moyens généraux : règles pures, sans base ni React.
 */

export type EtatFourniture = "rupture" | "a_racheter" | "suffisant";

export const ETATS_FOURNITURE: Record<EtatFourniture, string> = {
  rupture: "Rupture",
  a_racheter: "À racheter",
  suffisant: "Suffisant",
};

interface Mouvement {
  fournitureId: string;
  sens: "entree" | "sortie";
  quantite: number;
  cout?: number | null;
}

/** Stock par fourniture : entrées moins sorties. Jamais tenu ailleurs que dans ses mouvements. */
export function stocks(mouvements: readonly Mouvement[]): Map<string, number> {
  const parFourniture = new Map<string, number>();
  for (const m of mouvements) {
    const signe = m.sens === "entree" ? 1 : -1;
    parFourniture.set(m.fournitureId, (parFourniture.get(m.fournitureId) ?? 0) + signe * m.quantite);
  }
  return parFourniture;
}

/** Rupture à zéro ; à racheter au seuil ou en dessous ; un seuil nul n'alerte qu'en rupture. */
export function etatFourniture(stock: number, seuil: number): EtatFourniture {
  if (stock <= 0) return "rupture";
  if (seuil > 0 && stock <= seuil) return "a_racheter";
  return "suffisant";
}

/**
 * Une sortie ne peut pas dépasser ce qu'il y a dans le placard. Rend le
 * message de refus, ou null si la sortie passe.
 */
export function refusSortie(stock: number, quantite: number, unite: string): string | null {
  if (!Number.isInteger(quantite) || quantite <= 0) return "La quantité doit être un nombre entier positif.";
  if (quantite > stock) return `Il n'en reste que ${stock} ${unite} : impossible d'en sortir ${quantite}.`;
  return null;
}

/**
 * Coût moyen d'une unité, d'après les entrées qui portent un coût : le total
 * payé divisé par les unités achetées, arrondi au franc. Nul sans achat chiffré.
 *
 * Arrondi entier par `Math.round` sur deux entiers : le résultat est une
 * estimation affichée, jamais ventilée ni additionnée.
 */
export function coutMoyenUnitaire(mouvements: readonly Mouvement[]): number | null {
  let total = 0;
  let unites = 0;
  for (const m of mouvements) {
    if (m.sens !== "entree" || m.cout === null || m.cout === undefined) continue;
    total += m.cout;
    unites += m.quantite;
  }
  return unites > 0 ? Math.round(total / unites) : null;
}

/** Sorties par service (ou par salarié, à défaut de service) : qui consomme quoi. */
export function consommationParService(
  sorties: readonly { quantite: number; service: string | null; beneficiaire: string | null }[],
): { service: string; quantite: number }[] {
  const totaux = new Map<string, number>();
  for (const s of sorties) {
    const cle = s.service?.trim() || s.beneficiaire || "Non précisé";
    totaux.set(cle, (totaux.get(cle) ?? 0) + s.quantite);
  }
  return [...totaux.entries()].map(([service, quantite]) => ({ service, quantite })).sort((a, b) => b.quantite - a.quantite || a.service.localeCompare(b.service));
}
