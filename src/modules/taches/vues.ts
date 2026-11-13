/**
 * Règles des vues de tâches — Tableur, Fiches, Calendrier, Kanban, Gantt,
 * Échéancier —, sans base ni React. Importable depuis le navigateur.
 *
 * Toutes les dates sont des jours ISO (`AAAA-MM-JJ`) calculés en UTC : une
 * échéance n'a pas d'heure, et un objet Date local la décalerait d'un jour
 * dans un fuseau à l'ouest d'Abidjan.
 */

import { enRetard, LIBELLE_PRIORITE, LIBELLE_STATUT, statutApres, type Geste, type Priorite, type Statut } from "./calcul";

// ------------------------------------------------------------------ affichages

export const AFFICHAGES = ["tableur", "fiches", "calendrier", "kanban", "gantt", "echeancier"] as const;
export type Affichage = (typeof AFFICHAGES)[number];

export const LIBELLE_AFFICHAGE: Record<Affichage, string> = {
  tableur: "Tableur",
  fiches: "Fiches",
  calendrier: "Calendrier",
  kanban: "Kanban",
  gantt: "Gantt",
  echeancier: "Échéancier",
};

export const DESCRIPTION_AFFICHAGE: Record<Affichage, string> = {
  tableur: "Planifiez, suivez et gérez tout dans un tableau : chaque cellule se modifie sur place.",
  fiches: "Suivez l'évolution de chaque tâche dans une galerie de fiches.",
  calendrier: "Toutes les échéances du mois d'un coup d'œil ; glissez une tâche pour la reporter.",
  kanban: "Une colonne par état : glissez une fiche pour la faire avancer.",
  gantt: "La durée de chaque tâche, du début prévu à l'échéance, sur une frise.",
  echeancier: "La charge de chacun dans le temps, pour équilibrer le travail.",
};

export function lireAffichage(valeur: unknown): Affichage {
  return typeof valeur === "string" && (AFFICHAGES as readonly string[]).includes(valeur) ? (valeur as Affichage) : "tableur";
}

// ------------------------------------------------------------------ couleurs

/** Couleurs d'état, celles d'un tableau de suivi : gris, orange, vert, rouge. */
export const COULEUR_STATUT: Record<Statut, string> = {
  a_faire: "#a3a7b4",
  en_cours: "#fdab3d",
  terminee: "#00c875",
  annulee: "#df2f4a",
};

/** Priorité : du bleu clair au rouge sombre, l'urgence se voit sans lire. */
export const COULEUR_PRIORITE: Record<Priorite, string> = {
  basse: "#579bfc",
  normale: "#5559df",
  haute: "#401694",
  urgente: "#bb3354",
};

/** Ordre des colonnes du Kanban et des groupes par état. */
export const ORDRE_STATUTS: Statut[] = ["a_faire", "en_cours", "terminee", "annulee"];

export const estClose = (statut: Statut) => statut === "terminee" || statut === "annulee";

// ------------------------------------------------------------------ Kanban

/**
 * Le geste qu'implique le dépôt d'une fiche dans une autre colonne, ou `null`
 * si ce passage n'existe pas (d'« en cours » à « à faire », d'« annulée » à
 * « terminée »…). La permission se vérifie à part, avec `gestePermis`.
 */
export function gesteVers(actuel: Statut, cible: Statut): Geste | null {
  if (actuel === cible) return null;
  const gestes: Geste[] = ["demarrer", "terminer", "rouvrir", "annuler"];
  return gestes.find((g) => statutApres(g, actuel) === cible) ?? null;
}

// ------------------------------------------------------------------ jours

const JOUR_MS = 24 * 3600 * 1000;
const enMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const versIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function ajouterJours(iso: string, jours: number): string {
  return versIso(enMs(iso) + jours * JOUR_MS);
}

/** Jours de `a` à `b` : positif si `b` vient après. */
export function ecartJours(a: string, b: string): number {
  return Math.round((enMs(b) - enMs(a)) / JOUR_MS);
}

/** Lundi de la semaine du jour donné. */
export function lundiDe(iso: string): string {
  const rang = (new Date(enMs(iso)).getUTCDay() + 6) % 7; // lundi = 0
  return ajouterJours(iso, -rang);
}

export const estWeekEnd = (iso: string) => {
  const j = new Date(enMs(iso)).getUTCDay();
  return j === 0 || j === 6;
};

/** `AAAA-MM` du mois voisin. */
export function moisVoisin(mois: string, sens: number): string {
  const [a, m] = mois.split("-").map(Number);
  const rang = a * 12 + (m - 1) + sens;
  return `${Math.floor(rang / 12)}-${String((rang % 12) + 1).padStart(2, "0")}`;
}

/**
 * Cases du calendrier d'un mois (`AAAA-MM`) : semaines entières du lundi au
 * dimanche, débordant sur les mois voisins, cinq ou six rangées.
 */
export function grilleMois(mois: string): { jour: string; duMois: boolean }[] {
  const premier = `${mois}-01`;
  const dernier = ajouterJours(`${moisVoisin(mois, 1)}-01`, -1);
  const debut = lundiDe(premier);
  const fin = ajouterJours(lundiDe(dernier), 6);
  const cases: { jour: string; duMois: boolean }[] = [];
  for (let j = debut; j <= fin; j = ajouterJours(j, 1)) cases.push({ jour: j, duMois: j.startsWith(mois) });
  return cases;
}

// ------------------------------------------------------------------ regroupement

export type Regroupement = "statut" | "echeance" | "responsable" | "priorite";

export const LIBELLE_REGROUPEMENT: Record<Regroupement, string> = {
  statut: "État",
  echeance: "Échéance",
  responsable: "Responsable",
  priorite: "Priorité",
};

export interface Regroupable {
  statut: Statut;
  priorite: Priorite;
  echeance: string | null;
  assignee: string;
}

export interface Groupe<T> {
  cle: string;
  libelle: string;
  couleur: string;
  taches: T[];
}

const ORDRE_ECHEANCE = ["retard", "aujourdhui", "semaine", "plus-tard", "sans", "closes"] as const;
const GROUPE_ECHEANCE: Record<(typeof ORDRE_ECHEANCE)[number], { libelle: string; couleur: string }> = {
  retard: { libelle: "En retard", couleur: "#df2f4a" },
  aujourdhui: { libelle: "Aujourd'hui", couleur: "#fdab3d" },
  semaine: { libelle: "Cette semaine", couleur: "#579bfc" },
  "plus-tard": { libelle: "Plus tard", couleur: "#5559df" },
  sans: { libelle: "Sans échéance", couleur: "#a3a7b4" },
  closes: { libelle: "Terminées et annulées", couleur: "#00c875" },
};

/** Groupe d'échéance d'une tâche : la semaine court jusqu'au dimanche. */
export function trancheEcheance(t: Regroupable, aujourdhui: string): (typeof ORDRE_ECHEANCE)[number] {
  if (estClose(t.statut)) return "closes";
  if (!t.echeance) return "sans";
  if (enRetard(t.echeance, t.statut, aujourdhui)) return "retard";
  if (t.echeance === aujourdhui) return "aujourdhui";
  if (t.echeance <= ajouterJours(lundiDe(aujourdhui), 6)) return "semaine";
  return "plus-tard";
}

const TEINTES_PERSONNES = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#e2445c", "#0086c0", "#9d50dd", "#ff642e", "#037f4c", "#bb3354"];

/** Couleur stable d'une personne : la même à chaque affichage, sans rien stocker. */
export function couleurPersonne(nom: string): string {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES_PERSONNES[h % TEINTES_PERSONNES.length];
}

/** « Awa Koné » → « AK » ; « Kouassi » → « KO ». */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/**
 * Range les tâches en groupes, dans l'ordre de travail : par état (en cours
 * d'abord), par échéance (le retard d'abord), par responsable (alphabétique),
 * par priorité (l'urgente d'abord). Un groupe vide n'apparaît pas, sauf les
 * deux états ouverts quand on range par état : on y dépose des tâches.
 */
export function regrouper<T extends Regroupable>(taches: T[], critere: Regroupement, aujourdhui: string): Groupe<T>[] {
  if (critere === "statut") {
    return (["en_cours", "a_faire", "terminee", "annulee"] as Statut[])
      .map((s) => ({ cle: s, libelle: LIBELLE_STATUT[s], couleur: COULEUR_STATUT[s], taches: taches.filter((t) => t.statut === s) }))
      .filter((g) => g.taches.length > 0 || !estClose(g.cle as Statut));
  }
  if (critere === "priorite") {
    return (["urgente", "haute", "normale", "basse"] as Priorite[])
      .map((p) => ({ cle: p, libelle: LIBELLE_PRIORITE[p], couleur: COULEUR_PRIORITE[p], taches: taches.filter((t) => t.priorite === p) }))
      .filter((g) => g.taches.length > 0);
  }
  if (critere === "echeance") {
    return ORDRE_ECHEANCE.map((cle) => ({
      cle,
      ...GROUPE_ECHEANCE[cle],
      taches: taches.filter((t) => trancheEcheance(t, aujourdhui) === cle),
    })).filter((g) => g.taches.length > 0);
  }
  const noms = [...new Set(taches.map((t) => t.assignee))].sort((a, b) => a.localeCompare(b, "fr"));
  return noms.map((nom) => ({ cle: nom, libelle: nom, couleur: couleurPersonne(nom), taches: taches.filter((t) => t.assignee === nom) }));
}

/** Part de chaque état dans un groupe, pour la barre de pied de groupe. Entiers, total exact. */
export function repartitionStatuts(taches: { statut: Statut }[]): { statut: Statut; nombre: number }[] {
  return ORDRE_STATUTS.map((statut) => ({ statut, nombre: taches.filter((t) => t.statut === statut).length })).filter(
    (r) => r.nombre > 0,
  );
}

// ------------------------------------------------------------------ frises

export interface Intervalle {
  debut: string;
  fin: string;
}

/**
 * Période d'une tâche sur une frise : du début prévu à l'échéance. Une seule
 * des deux dates donne une tâche d'un jour ; aucune, pas de barre.
 */
export function intervalleTache(t: { dateDebut: string | null; echeance: string | null }): Intervalle | null {
  const debut = t.dateDebut ?? t.echeance;
  const fin = t.echeance ?? t.dateDebut;
  if (!debut || !fin) return null;
  return debut <= fin ? { debut, fin } : { debut: fin, fin: debut };
}

/**
 * Fenêtre de la frise : toutes les barres, aujourd'hui compris, calée du
 * lundi au dimanche, quatre semaines au moins.
 */
export function plageFrise(intervalles: Intervalle[], aujourdhui: string): Intervalle {
  let debut = ajouterJours(aujourdhui, -7);
  let fin = ajouterJours(aujourdhui, 21);
  for (const i of intervalles) {
    if (i.debut < debut) debut = i.debut;
    if (i.fin > fin) fin = i.fin;
  }
  return { debut: lundiDe(debut), fin: ajouterJours(lundiDe(fin), 6) };
}

/**
 * Range des barres en couloirs, sans chevauchement : chaque barre prend le
 * premier couloir libre à son début. Rend le couloir de chaque barre, dans
 * l'ordre reçu, et le nombre de couloirs.
 */
export function rangerEnCouloirs(intervalles: Intervalle[]): { couloirs: number[]; nombre: number } {
  const ordre = intervalles.map((_, i) => i).sort((a, b) => {
    const x = intervalles[a];
    const y = intervalles[b];
    return x.debut < y.debut ? -1 : x.debut > y.debut ? 1 : x.fin < y.fin ? -1 : x.fin > y.fin ? 1 : a - b;
  });
  const finDesCouloirs: string[] = [];
  const couloirs = new Array<number>(intervalles.length);
  for (const i of ordre) {
    const { debut, fin } = intervalles[i];
    let rang = finDesCouloirs.findIndex((f) => f < debut);
    if (rang === -1) rang = finDesCouloirs.push(fin) - 1;
    else finDesCouloirs[rang] = fin;
    couloirs[i] = rang;
  }
  return { couloirs, nombre: finDesCouloirs.length };
}

/**
 * Déplacer une tâche à une nouvelle échéance garde sa durée : le début prévu
 * avance d'autant.
 */
export function deplacerEcheance(
  t: { dateDebut: string | null; echeance: string | null },
  nouvelle: string,
): { dateDebut: string | null; echeance: string } {
  if (!t.dateDebut) return { dateDebut: null, echeance: nouvelle };
  const decalage = t.echeance ? ecartJours(t.echeance, nouvelle) : ecartJours(t.dateDebut, nouvelle);
  const debut = ajouterJours(t.dateDebut, decalage);
  return { dateDebut: debut <= nouvelle ? debut : nouvelle, echeance: nouvelle };
}
