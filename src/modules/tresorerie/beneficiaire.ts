/**
 * Nom d'un bénéficiaire saisi à la main, sans fiche : pour le suivi, on
 * exige le nom ET le prénom — deux mots au moins, chacun avec une lettre.
 * « Aya » seul ne permet pas de retrouver la personne.
 */
export function estNomComplet(v: string | null | undefined): boolean {
  return (v ?? "").trim().split(/\s+/).filter((m) => /\p{L}/u.test(m)).length >= 2;
}

export const MESSAGE_NOM_COMPLET = "Indiquez le nom et le prénom du bénéficiaire.";
