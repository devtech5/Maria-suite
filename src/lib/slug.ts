/**
 * Identifiant lisible tiré d'un libellé : minuscules, sans accents, mots
 * séparés par des tirets, 40 caractères au plus.
 */
export function slug(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize("NFD")
    // Diacritiques décomposés par NFD, en notation échappée : des caractères
    // combinants écrits littéralement seraient invisibles à la relecture.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
