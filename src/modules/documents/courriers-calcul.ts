/**
 * Courriers : les règles de mise en forme, sans base ni React.
 *
 * Le corps d'un courrier est du texte brut. Ces fonctions le découpent en
 * paragraphes et en lignes ; React échappe ensuite chaque morceau. Aucune
 * balise saisie n'est jamais interprétée : un `<script>` tapé dans un courrier
 * s'imprime en toutes lettres, il ne s'exécute pas.
 */

/** Plafonds de saisie : une lettre, pas un rapport. */
export const LONGUEUR_MAX_CORPS = 20_000;
export const LONGUEUR_MAX_OBJET = 200;

/**
 * Paragraphes du corps : une ligne non vide, un paragraphe.
 *
 * Les lignes blanches ne produisent rien — l'espacement vient de la mise en
 * page, pas du nombre d'Entrée frappés. Une saisie faite de deux sauts entre
 * chaque paragraphe et une saisie à un seul saut s'impriment pareil.
 */
export function paragraphesDe(corps: string): string[] {
  return corps
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(/\s+/g, " ").trim())
    .filter((ligne) => ligne !== "");
}

/** Lignes du bloc destinataire, telles qu'elles s'impriment, sans ligne vide. */
export function lignesDe(texte: string | null | undefined): string[] {
  if (!texte) return [];
  return texte
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "");
}

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * Date d'une lettre : « 2026-10-01 » → « 1er octobre 2026 ».
 *
 * Découpage de chaîne et non `new Date` : une colonne `date` n'a pas d'heure,
 * et un objet Date la décalerait d'un jour dans un fuseau à l'ouest d'Abidjan.
 * Le premier du mois s'écrit « 1er », comme sur toute lettre française.
 */
export function dateEnLettres(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const jour = Number(m[3]);
  const mois = MOIS[Number(m[2]) - 1];
  if (!mois || jour < 1 || jour > 31) return iso;
  return `${jour === 1 ? "1er" : jour} ${mois} ${m[1]}`;
}

/** Ligne de lieu et de date : « Abidjan, le 16 octobre 2026 ». */
export function lieuEtDate(lieu: string, iso: string): string {
  const date = dateEnLettres(iso);
  return lieu.trim() ? `${lieu.trim()}, le ${date}` : `Le ${date}`;
}
