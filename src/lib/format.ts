const nombre = new Intl.NumberFormat("fr-FR");

/**
 * Affichage compact d'un montant, sans devise : « 2 900 ».
 * Le suffixe FCFA est porté par l'en-tête de colonne ou le libellé voisin,
 * jamais répété sur chaque ligne d'un tableau.
 */
export const fmt = (montant: number) => nombre.format(montant);

/**
 * Abrège les grands montants pour les indicateurs de tête, où la précision
 * au franc près n'apporte rien : « 48,8 M » plutôt que « 48 750 450 ».
 */
export function fmtCompact(montant: number): string {
  const absolu = Math.abs(montant);
  if (absolu >= 1_000_000_000) return `${(montant / 1_000_000_000).toFixed(1).replace(".", ",")} Md`;
  if (absolu >= 1_000_000) return `${(montant / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (absolu >= 10_000) return `${Math.round(montant / 1000)} k`;
  return nombre.format(montant);
}

export const fmtEntier = (valeur: number) => nombre.format(valeur);

/** Taux en écriture française : « 6,3 » et non « 6.3 ». */
export const fmtTaux = (taux: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(taux);

/**
 * Taux stocké en points de base, rendu en pourcentage : 1800 → « 18 % ».
 *
 * Les taux voyagent en entiers depuis la base jusqu'au calcul ; la division
 * par cent n'a lieu qu'ici, au moment de l'affichage, où plus rien n'est
 * recalculé derrière.
 */
export const fmtTauxBp = (pointsDeBase: number) =>
  `${fmtTaux(pointsDeBase / 100)} %`;

/**
 * Date ISO du jour comptable en écriture française : « 2026-08-23 » → « 23/08/2026 ».
 *
 * Découpage de chaîne et non `new Date` : une colonne `date` PostgreSQL n'a pas
 * d'heure, et la passer par un objet Date la décale d'un jour dès que le fuseau
 * du serveur est à l'ouest d'Abidjan.
 */
export function fmtDateIso(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  return jour ? `${jour}/${mois}/${annee}` : iso;
}

/**
 * Période courte : « 03/10 → 06/10/2026 » dans une même année, les deux
 * années sinon. La même année répétée deux fois ne dit rien de plus.
 */
export function fmtPeriode(debutIso: string, finIso: string): string {
  if (debutIso.slice(0, 4) === finIso.slice(0, 4)) {
    return `${fmtDateIso(debutIso).slice(0, 5)} → ${fmtDateIso(finIso)}`;
  }
  return `${fmtDateIso(debutIso)} → ${fmtDateIso(finIso)}`;
}
