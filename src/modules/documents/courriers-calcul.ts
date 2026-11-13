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
 * Polices proposées pour le texte d'un courrier.
 *
 * Montserrat est la police de la charte, servie par l'application. Les autres
 * sont des polices installées sur les postes Windows et Mac : rien ne se
 * télécharge chez un tiers, et chaque pile se replie sur une police libre de
 * même dessin (Liberation, Carlito, DejaVu) quand l'originale manque. En-tête
 * et pied de page restent en Montserrat : c'est le papier de l'entreprise.
 *
 * Chaque police a sa taille conseillée : Montserrat est large, un corps de
 * 8,65 pt y lit comme un Times à 11 pt.
 */
export const POLICES_COURRIER = {
  montserrat: { libelle: "Montserrat (charte)", pile: null, tailleConseillee: 865 },
  arial: { libelle: "Arial", pile: "Arial, Helvetica, 'Liberation Sans', sans-serif", tailleConseillee: 1000 },
  calibri: { libelle: "Calibri", pile: "Calibri, Carlito, 'Segoe UI', sans-serif", tailleConseillee: 1100 },
  times: { libelle: "Times New Roman", pile: "'Times New Roman', Times, 'Liberation Serif', serif", tailleConseillee: 1100 },
  georgia: { libelle: "Georgia", pile: "Georgia, 'DejaVu Serif', serif", tailleConseillee: 1000 },
  garamond: { libelle: "Garamond", pile: "Garamond, 'EB Garamond', 'Times New Roman', serif", tailleConseillee: 1200 },
} as const satisfies Record<string, { libelle: string; pile: string | null; tailleConseillee: number }>;

export type PoliceCourrier = keyof typeof POLICES_COURRIER;
export const POLICE_PAR_DEFAUT: PoliceCourrier = "montserrat";

/** Taille du corps en CENTIÈMES de point : 8,65 pt = 865. Bornes de la feuille A4. */
export const TAILLE_PAR_DEFAUT = 865;
export const TAILLE_MIN = 700;
export const TAILLE_MAX = 1400;
/** Pas des boutons « A− » / « A+ » : un demi-point. */
export const PAS_TAILLE = 50;

export function estPoliceCourrier(valeur: unknown): valeur is PoliceCourrier {
  return typeof valeur === "string" && Object.hasOwn(POLICES_COURRIER, valeur);
}

/** Ramène une taille dans les bornes, au centième entier. */
export function bornerTaille(centiemes: number): number {
  if (!Number.isFinite(centiemes)) return TAILLE_PAR_DEFAUT;
  return Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, Math.round(centiemes)));
}

/**
 * Taille suivante d'un demi-point vers le haut ou le bas. Une taille hors
 * grille (8,65 pt) se cale d'abord sur le demi-point voisin : 8,65 pt → 9 pt
 * en montant, 8,5 pt en descendant.
 */
export function tailleVoisine(centiemes: number, sens: 1 | -1): number {
  const cale = sens > 0 ? Math.floor(centiemes / PAS_TAILLE) : Math.ceil(centiemes / PAS_TAILLE);
  return bornerTaille((cale + sens) * PAS_TAILLE);
}

/** « 8,65 pt », « 11 pt ». */
export function tailleLisible(centiemes: number): string {
  const points = Math.trunc(centiemes / 100);
  const reste = centiemes % 100;
  if (reste === 0) return `${points} pt`;
  return `${points},${String(reste).padStart(2, "0").replace(/0$/, "")} pt`;
}

/**
 * Tailles du courrier, en points CSS, dérivées de celle du corps. Les
 * rapports sont ceux du modèle : destinataire, objet et date un peu plus
 * grands (9 pt pour 8,65 pt), la référence un peu plus petite (8 pt).
 */
export function taillesCourrier(centiemes: number): { corps: string; titre: string; reference: string } {
  const corps = bornerTaille(centiemes);
  const pt = (rapport: number) => `${Math.round(corps * rapport) / 100}pt`;
  return { corps: pt(1), titre: pt(900 / 865), reference: pt(800 / 865) };
}

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
