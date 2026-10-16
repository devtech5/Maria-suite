/**
 * Recherche plein texte et filtre de période : règles pures, partagées par
 * la recherche globale de la barre du haut et les listes des modules.
 *
 * Une seule normalisation partout — minuscules, sans accents — pour qu'un
 * mot trouvé dans une liste le soit aussi depuis la barre, et inversement.
 */

/** Au-delà, une recherche n'est plus une recherche : on coupe. */
export const LONGUEUR_MAX_RECHERCHE = 80;
const MOTS_MAX = 6;

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Minuscules, sans accents : « Bébé » se trouve en tapant « bebe ». */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Mots cherchés, normalisés, sans doublon ; six au plus. */
export function motsRecherche(recherche: string | null | undefined): string[] {
  if (!recherche) return [];
  const mots = normaliser(recherche.slice(0, LONGUEUR_MAX_RECHERCHE)).split(/\s+/).filter(Boolean);
  return [...new Set(mots)].slice(0, MOTS_MAX);
}

/** Vrai si tous les mots cherchés figurent dans l'un des champs. */
export function correspond(recherche: string, champs: (string | null | undefined)[]): boolean {
  const mots = motsRecherche(recherche);
  if (mots.length === 0) return true;
  const texte = normaliser(champs.filter(Boolean).join(" "));
  return mots.every((mot) => texte.includes(mot));
}

/** Motif `LIKE` d'un mot : `%` et `_` tapés au clavier sont cherchés tels quels. */
export function motifLike(mot: string): string {
  return `%${mot.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Une période lue dans l'adresse : `du` et `au` inclus, l'un ou l'autre absent. */
export interface Periode {
  du: string | null;
  au: string | null;
}

/** Date `AAAA-MM-JJ` réelle, ou rien : « 2026-02-30 » n'en est pas une. */
export function dateValide(valeur: string | null | undefined): string | null {
  if (!valeur || !DATE_ISO.test(valeur)) return null;
  const d = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur ? valeur : null;
}

/** Période validée ; des bornes inversées sont remises dans l'ordre plutôt que de tout masquer. */
export function lirePeriode(du: string | null | undefined, au: string | null | undefined): Periode {
  const a = dateValide(du);
  const b = dateValide(au);
  return a && b && a > b ? { du: b, au: a } : { du: a, au: b };
}

/**
 * Vrai si la date tombe dans la période, bornes incluses.
 *
 * Une date absente ne passe qu'une période vide : filtrer « en octobre »
 * ne doit pas montrer une fiche qui n'a pas de date.
 */
export function dansPeriode(date: string | Date | null | undefined, periode: Periode): boolean {
  if (!periode.du && !periode.au) return true;
  if (!date) return false;
  const jour = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return (!periode.du || jour >= periode.du) && (!periode.au || jour <= periode.au);
}

type Parametres = Record<string, string | string[] | undefined>;

/** Ce qu'une liste lit dans son adresse : la recherche et la période. */
export interface FiltresListe {
  q: string;
  periode: Periode;
  /** Vrai si l'un des filtres est posé : la liste annonce alors « n sur m ». */
  actif: boolean;
}

/** Lecture validée de `?q=`, `?du=`, `?au=` : une valeur mal formée est ignorée, jamais une erreur. */
export function lireFiltresListe(p: Parametres): FiltresListe {
  const un = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const q = (un(p.q) ?? "").trim().slice(0, LONGUEUR_MAX_RECHERCHE);
  const periode = lirePeriode(un(p.du), un(p.au));
  return { q, periode, actif: q !== "" || !!periode.du || !!periode.au };
}
