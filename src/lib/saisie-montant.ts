/**
 * Montant en francs entiers tapé au clavier : « 10 000 000 » donne 10000000.
 *
 * Espaces, espaces insécables (fines ou non, celles de `toLocaleString`) et
 * points de milliers sont ignorés. Vide donne `null` ; tout autre texte
 * donne `NaN`, que le serveur refuse avec un message lisible.
 *
 * Fichier sans dépendance : il sert aux formulaires du navigateur.
 */
export function montantSaisi(texte: string): number | null {
  const brut = texte.replace(/[\s.]/g, "");
  if (brut === "") return null;
  return /^\d+$/.test(brut) ? Number(brut) : Number.NaN;
}
