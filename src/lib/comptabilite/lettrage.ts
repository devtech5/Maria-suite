/**
 * Lettrage des comptes de tiers.
 *
 * Lettrer, c'est déclarer qu'une créance et son règlement se répondent. Deux
 * lignes portant le même code sont réputées soldées l'une par l'autre : la
 * facture n'apparaît plus dans l'encours, le règlement n'apparaît plus comme
 * non affecté.
 *
 * Logique pure : elle décide de ce qui est lettrable, elle n'écrit rien.
 */

export interface LigneLettrable {
  id: string;
  compte: string;
  auxiliaire: string | null;
  debit: number;
  credit: number;
  lettrage: string | null;
}

export type Refus =
  | "aucune_ligne"
  | "deja_lettree"
  | "comptes_differents"
  | "tiers_differents"
  | "compte_non_lettrable"
  | "desequilibre";

export const MESSAGE_REFUS: Record<Refus, string> = {
  aucune_ligne: "Sélectionnez au moins deux lignes.",
  deja_lettree: "Une des lignes est déjà lettrée.",
  comptes_differents: "Les lignes doivent appartenir au même compte.",
  tiers_differents: "Les lignes doivent concerner le même tiers.",
  compte_non_lettrable:
    "Seuls les comptes de tiers se lettrent — clients et fournisseurs.",
  desequilibre:
    "Le total débit doit égaler le total crédit. Un lettrage partiel se fait sur le montant réellement réglé.",
};

/**
 * Comptes qui admettent un lettrage.
 *
 * Seuls les comptes de tiers. Lettrer un compte de produit ou de trésorerie
 * n'a pas de sens : on ne solde pas une vente, on solde une créance.
 */
export function compteLettrable(compte: string): boolean {
  return compte.startsWith("40") || compte.startsWith("41");
}

/**
 * Vérifie qu'un ensemble de lignes peut être lettré ensemble.
 *
 * La condition qui compte est l'équilibre : la somme des débits doit égaler
 * celle des crédits. Sans elle, on marquerait comme soldée une facture
 * partiellement payée, et l'encours client deviendrait faux — précisément le
 * chiffre pour lequel on tient une comptabilité de tiers.
 */
export function verifierLettrage(
  lignes: LigneLettrable[],
): { ok: true; montant: number } | { ok: false; raison: Refus } {
  if (lignes.length < 2) return { ok: false, raison: "aucune_ligne" };

  if (lignes.some((l) => l.lettrage)) {
    return { ok: false, raison: "deja_lettree" };
  }

  const [premiere] = lignes;

  if (!compteLettrable(premiere.compte)) {
    return { ok: false, raison: "compte_non_lettrable" };
  }

  if (lignes.some((l) => l.compte !== premiere.compte)) {
    return { ok: false, raison: "comptes_differents" };
  }

  // Le tiers doit être le même : rapprocher la facture d'un client du
  // règlement d'un autre soldrait deux comptes à la fois, tous deux à tort.
  if (lignes.some((l) => l.auxiliaire !== premiere.auxiliaire)) {
    return { ok: false, raison: "tiers_differents" };
  }

  const debit = lignes.reduce((somme, l) => somme + l.debit, 0);
  const credit = lignes.reduce((somme, l) => somme + l.credit, 0);

  if (debit !== credit) return { ok: false, raison: "desequilibre" };

  return { ok: true, montant: debit };
}

/**
 * Convertit un rang en code de lettrage : 1 → A, 26 → Z, 27 → AA.
 *
 * Des lettres et non des chiffres, par convention comptable : un code de
 * lettrage se distingue ainsi au premier coup d'œil d'un numéro de pièce ou
 * d'un montant, dans une colonne où les trois se côtoient.
 */
export function versLettres(rang: number): string {
  if (rang < 1) return "";

  let reste = rang;
  let code = "";

  while (reste > 0) {
    const modulo = (reste - 1) % 26;
    code = String.fromCharCode(65 + modulo) + code;
    reste = Math.floor((reste - 1) / 26);
  }

  return code;
}
