/**
 * Règlement intérieur : les règles, sans base ni React.
 *
 * Le règlement se publie par VERSIONS. Une version naît brouillon, se rédige
 * article par article, puis se publie avec une date d'effet : elle reçoit
 * alors son numéro (1, 2, 3…) et ne se modifie plus. Corriger un règlement
 * publié, c'est en publier une nouvelle version.
 *
 * La version EN VIGUEUR est la dernière publiée dont la date d'effet est
 * passée, dans le fuseau de l'entreprise. Tant qu'un compte ne l'a pas
 * acceptée, il n'ouvre que l'écran de lecture : « J'ai lu et j'accepte »,
 * horodaté, une fois par version. Une version publiée à l'avance se lit et
 * s'accepte dès sa publication ; elle ne bloque qu'à sa date d'effet.
 *
 * Un règlement n'est jamais rétroactif : la date d'effet d'une publication ne
 * peut pas précéder le jour où elle se publie.
 */

export const TITRE_DEFAUT = "Règlement intérieur";

export const LONGUEUR_MAX_TITRE = 120;
export const LONGUEUR_MAX_TITRE_ARTICLE = 160;
export const LONGUEUR_MAX_TEXTE_ARTICLE = 20_000;
export const LONGUEUR_MAX_PREAMBULE = 5_000;
export const LONGUEUR_MAX_RESUME = 1_000;
export const ARTICLES_MAX = 200;

/** Une relance par heure au plus : un double clic ne double pas la cloche de tout le monde. */
export const RELANCE_MIN_MS = 60 * 60_000;

export interface Article {
  titre: string;
  texte: string;
}

export type StatutStocke = "brouillon" | "publie";

/** Ce que l'écran dit d'une version. */
export type EtatVersion = "brouillon" | "a_venir" | "en_vigueur" | "remplacee";

export interface VersionDatee {
  id: string;
  statut: StatutStocke;
  numero: number | null;
  /** « AAAA-MM-JJ », nulle tant que la version est un brouillon. */
  dateEffet: string | null;
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vrai pour un jour civil « AAAA-MM-JJ » qui existe. */
export function dateValide(valeur: string | null | undefined): valeur is string {
  if (!valeur) return false;
  const m = DATE_ISO.exec(valeur);
  if (!m) return false;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}

function publiees<V extends VersionDatee>(versions: readonly V[]): (V & { dateEffet: string; numero: number })[] {
  return versions.filter((v): v is V & { dateEffet: string; numero: number } => v.statut === "publie" && dateValide(v.dateEffet) && v.numero !== null);
}

/** Plus récente d'abord : date d'effet, puis numéro (deux publications le même jour). */
function plusRecente(a: { dateEffet: string; numero: number }, b: { dateEffet: string; numero: number }): number {
  if (a.dateEffet !== b.dateEffet) return a.dateEffet < b.dateEffet ? 1 : -1;
  return b.numero - a.numero;
}

/** La version que chacun doit avoir acceptée aujourd'hui, ou rien. */
export function versionEnVigueur<V extends VersionDatee>(versions: readonly V[], aujourdhui: string): V | null {
  const passees = publiees(versions).filter((v) => v.dateEffet <= aujourdhui);
  return passees.sort(plusRecente)[0] ?? null;
}

/** La prochaine version publiée à l'avance, la plus proche d'abord. */
export function versionAVenir<V extends VersionDatee>(versions: readonly V[], aujourdhui: string): V | null {
  const futures = publiees(versions).filter((v) => v.dateEffet > aujourdhui);
  return futures.sort((a, b) => -plusRecente(a, b))[0] ?? null;
}

export function etatVersion(version: VersionDatee, versions: readonly VersionDatee[], aujourdhui: string): EtatVersion {
  if (version.statut === "brouillon") return "brouillon";
  if (version.dateEffet && version.dateEffet > aujourdhui) return "a_venir";
  return versionEnVigueur(versions, aujourdhui)?.id === version.id ? "en_vigueur" : "remplacee";
}

export const LIBELLE_ETAT: Record<EtatVersion, string> = {
  brouillon: "Brouillon",
  a_venir: "À venir",
  en_vigueur: "En vigueur",
  remplacee: "Remplacée",
};

/**
 * Les articles saisis, nettoyés : espaces retirés, articles vides écartés.
 * Lève un message lisible sur une saisie qu'on ne peut pas garder.
 */
export function normaliserArticles(brut: unknown): Article[] {
  if (!Array.isArray(brut)) throw new Error("Les articles sont illisibles. Rechargez la page.");
  const articles: Article[] = [];
  for (const element of brut) {
    if (!element || typeof element !== "object") continue;
    const { titre, texte } = element as { titre?: unknown; texte?: unknown };
    const t = typeof titre === "string" ? titre.trim() : "";
    const x = typeof texte === "string" ? texte.replace(/\r\n?/g, "\n").trim() : "";
    if (!t && !x) continue;
    const rang = articles.length + 1;
    if (!x) throw new Error(`L'article ${rang} n'a pas de texte.`);
    if (t.length > LONGUEUR_MAX_TITRE_ARTICLE) throw new Error(`Le titre de l'article ${rang} dépasse ${LONGUEUR_MAX_TITRE_ARTICLE} caractères.`);
    if (x.length > LONGUEUR_MAX_TEXTE_ARTICLE) throw new Error(`L'article ${rang} dépasse ${LONGUEUR_MAX_TEXTE_ARTICLE.toLocaleString("fr-FR")} caractères.`);
    articles.push({ titre: t, texte: x });
  }
  if (articles.length > ARTICLES_MAX) throw new Error(`Un règlement compte au plus ${ARTICLES_MAX} articles.`);
  return articles;
}

/** « Article 3 — Horaires de travail », ou « Article 3 » sans titre. */
export function intituleArticle(article: Article, rang: number): string {
  return article.titre ? `Article ${rang} — ${article.titre}` : `Article ${rang}`;
}

/** Ancre d'un article dans la page, pour le sommaire. */
export function ancreArticle(rang: number): string {
  return `article-${rang}`;
}

/** Les paragraphes d'un texte : séparés par une ligne vide. */
export function paragraphes(texte: string): string[] {
  return texte
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Ce qui empêche de publier, ou null. `aujourdhui` est le jour civil de
 * l'entreprise.
 */
export function refusPublication(brouillon: { articles: readonly Article[]; dateEffet: string | null | undefined }, aujourdhui: string): string | null {
  if (brouillon.articles.length === 0) return "Le règlement n'a aucun article.";
  if (!dateValide(brouillon.dateEffet)) return "Indiquez la date d'effet.";
  if (brouillon.dateEffet < aujourdhui) return "Un règlement n'est pas rétroactif : la date d'effet ne peut pas précéder aujourd'hui.";
  return null;
}

export interface Membre {
  userId: string;
  nom: string;
}

export interface Lecture {
  userId: string;
  accepteLe: Date;
}

export interface SuiviLectures {
  total: number;
  lus: number;
  /** Pourcentage entier, arrondi vers le bas : 99 % tant qu'il en manque un. */
  pourcent: number;
  lecteurs: (Membre & { accepteLe: Date })[];
  enAttente: Membre[];
}

/** Qui a accepté une version, qui ne l'a pas encore fait, parmi les comptes actifs. */
export function suiviLectures(membres: readonly Membre[], lectures: readonly Lecture[]): SuiviLectures {
  const parUtilisateur = new Map(lectures.map((l) => [l.userId, l.accepteLe]));
  const lecteurs: (Membre & { accepteLe: Date })[] = [];
  const enAttente: Membre[] = [];
  for (const m of membres) {
    const le = parUtilisateur.get(m.userId);
    if (le) lecteurs.push({ ...m, accepteLe: le });
    else enAttente.push(m);
  }
  const parNom = (a: Membre, b: Membre) => a.nom.localeCompare(b.nom, "fr");
  lecteurs.sort((a, b) => b.accepteLe.getTime() - a.accepteLe.getTime());
  enAttente.sort(parNom);
  const total = membres.length;
  return { total, lus: lecteurs.length, pourcent: total === 0 ? 0 : Math.floor((lecteurs.length * 100) / total), lecteurs, enAttente };
}

/** Vrai si une relance peut partir : jamais deux dans l'heure. */
export function relancePermise(derniere: Date | null, maintenant: Date): boolean {
  return !derniere || maintenant.getTime() - derniere.getTime() >= RELANCE_MIN_MS;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;

/** « 1er décembre 2026 ». */
export function dateLongue(jour: string): string {
  const m = DATE_ISO.exec(jour);
  if (!m) return jour;
  const j = Number(m[3]);
  return `${j === 1 ? "1er" : j} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}
