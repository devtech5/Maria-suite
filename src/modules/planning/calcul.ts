/**
 * Planning : les règles, sans base ni React.
 *
 * Les heures d'une journée se comptent en MINUTES entières depuis minuit,
 * dans le fuseau de l'entreprise : 8 h 30 vaut 510, minuit du soir 1440.
 * Les instants (début et fin d'un créneau) restent des `Date` : un créneau
 * peut chevaucher minuit, et seul le fuseau dit à quel jour il appartient.
 */

import { ajouterJours, heureLocale, instantLocal, jourLocal, jourSemaine, LIBELLES_JOURS, minutesDe } from "@/modules/presences/calcul";

import type { StatutPlanning } from "./schema";

export type { StatutPlanning };
export { LIBELLES_JOURS };

/**
 * Les statuts, dans l'ordre où on les propose. `joignable` : on peut appeler
 * la personne ou lui confier quelque chose tout de suite.
 */
export const STATUTS: Record<StatutPlanning, { libelle: string; couleur: string; joignable: boolean }> = {
  disponible: { libelle: "Disponible", couleur: "#1f8a5c", joignable: true },
  occupe: { libelle: "Occupé", couleur: "#c0392b", joignable: false },
  en_reunion: { libelle: "En réunion", couleur: "#7c3aed", joignable: false },
  en_mission: { libelle: "En mission", couleur: "#2563eb", joignable: false },
  sur_terrain: { libelle: "Sur le terrain", couleur: "#0f766e", joignable: false },
  en_course: { libelle: "En courses", couleur: "#ea580c", joignable: false },
  en_deplacement: { libelle: "En déplacement", couleur: "#4f46e5", joignable: false },
  en_pause: { libelle: "En pause", couleur: "#ca8a04", joignable: true },
  teletravail: { libelle: "En télétravail", couleur: "#0891b2", joignable: true },
  en_conge: { libelle: "En congé", couleur: "#6b7f87", joignable: false },
  absent: { libelle: "Absent", couleur: "#3c4d54", joignable: false },
};

export const LISTE_STATUTS = Object.keys(STATUTS) as StatutPlanning[];

export function statutConnu(s: string): s is StatutPlanning {
  return s in STATUTS;
}

/** Module d'où vient une période que personne n'a saisie dans le planning. */
export type SourcePeriode = "conge" | "mission" | "reunion";

/**
 * Ce qui distingue une période déduite d'un créneau saisi : sa pièce
 * d'origine. Le titre et le lien ne sont remplis que pour qui peut ouvrir
 * cette pièce ; les autres voient le statut et la référence, rien de plus.
 */
export interface Origine {
  source: SourcePeriode;
  /** CONG-2026-00012, LIV-2026-00003, REU-2026-00042. */
  reference: string;
  titre: string | null;
  lien: string | null;
}

export interface Creneau {
  id: string;
  userId: string;
  statut: StatutPlanning;
  debut: Date;
  fin: Date;
  lieu: string | null;
  note: string | null;
  /** Absent pour un créneau saisi ; présent pour une période lue dans un autre module. */
  origine?: Origine | null;
}

/** Une plage d'horaires habituels : un jour de la semaine, de telle minute à telle minute. */
export interface Plage {
  jour: number;
  debutMinutes: number;
  finMinutes: number;
}

// ------------------------------------------------------------- heures

/** « 08:30 » → 510 ; « 24:00 » est admis pour une fin de journée. Nul si illisible. */
export function heureEnMinutes(heure: string): number | null {
  if (heure === "24:00") return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) return null;
  return minutesDe(heure);
}

/** 510 → « 08:30 ». */
export function minutesEnHeure(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Lundi de la semaine qui contient ce jour. */
export function lundiDe(jour: string): string {
  return ajouterJours(jour, 1 - jourSemaine(jour));
}

export function joursDeLaSemaine(lundi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}

/** Début du jour local, comme instant. */
function minuit(jour: string, fuseau: string): Date {
  return instantLocal(jour, "00:00", fuseau);
}

// ---------------------------------------------------------- validation

export const DUREE_MAX_MS = 31 * 86_400_000;

/** Refus lisible, ou nul si le créneau se tient. */
export function verifierCreneau(debut: Date, fin: Date): string | null {
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return "Date ou heure illisible.";
  if (fin <= debut) return "La fin doit venir après le début.";
  if (fin.getTime() - debut.getTime() > DUREE_MAX_MS) return "Un créneau dure un mois au plus. Pour une absence plus longue, posez un congé.";
  return null;
}

export function chevauche(a: { debut: Date; fin: Date }, b: { debut: Date; fin: Date }): boolean {
  return a.debut < b.fin && b.debut < a.fin;
}

/** Le premier créneau existant qui empiète sur le nouveau ; celui qu'on modifie ne compte pas. */
export function premierConflit<C extends { id: string; debut: Date; fin: Date }>(nouveau: { id?: string; debut: Date; fin: Date }, existants: readonly C[]): C | undefined {
  return existants.filter((c) => c.id !== nouveau.id && chevauche(c, nouveau)).sort((a, b) => a.debut.getTime() - b.debut.getTime())[0];
}

/** Les plages d'une semaine type : chacune valide, aucune ne mord sur une autre le même jour. */
export function verifierPlages(plages: readonly Plage[]): string | null {
  for (const p of plages) {
    if (!Number.isInteger(p.jour) || p.jour < 1 || p.jour > 7) return "Jour de la semaine inconnu.";
    if (!Number.isInteger(p.debutMinutes) || !Number.isInteger(p.finMinutes) || p.debutMinutes < 0 || p.finMinutes > 1440) return "Heure illisible.";
    if (p.finMinutes <= p.debutMinutes) return `Le ${LIBELLES_JOURS[p.jour - 1]}, une plage finit avant de commencer.`;
  }
  for (let jour = 1; jour <= 7; jour++) {
    const jourPlages = plages.filter((p) => p.jour === jour).sort((a, b) => a.debutMinutes - b.debutMinutes);
    for (let i = 1; i < jourPlages.length; i++) {
      if (jourPlages[i].debutMinutes < jourPlages[i - 1].finMinutes) return `Le ${LIBELLES_JOURS[jour - 1]}, deux plages se chevauchent.`;
    }
  }
  return null;
}

// -------------------------------------------------------- statut actuel

export type EtatHorsCreneau = "hors_horaires" | "non_renseigne";

export interface EtatActuel {
  statut: StatutPlanning | EtatHorsCreneau;
  libelle: string;
  couleur: string;
  joignable: boolean;
  /** Jusqu'à quand cet état tient, s'il est connu. */
  jusqua: Date | null;
  /** D'où vient l'état : un créneau déclaré, une période déduite (congé, mission, réunion), les horaires habituels, ou rien. */
  source: "creneau" | "deduite" | "horaires" | "aucune";
  creneau: Creneau | null;
}

const HORS: Record<EtatHorsCreneau, { libelle: string; couleur: string }> = {
  hors_horaires: { libelle: "Hors horaires", couleur: "#94a5ab" },
  non_renseigne: { libelle: "Non renseigné", couleur: "#c3ced2" },
};

/** Fin d'une plage du jour, comme instant (1440 = minuit suivant). */
function finDePlage(jour: string, finMinutes: number, fuseau: string): Date {
  return finMinutes >= 1440 ? minuit(ajouterJours(jour, 1), fuseau) : instantLocal(jour, minutesEnHeure(finMinutes), fuseau);
}

/** Prochain début de plage après cet instant, dans les sept jours. */
function prochaineReprise(maintenant: Date, plages: readonly Plage[], fuseau: string): Date | null {
  const aujourdhui = jourLocal(maintenant, fuseau);
  for (let i = 0; i <= 7; i++) {
    const jour = ajouterJours(aujourdhui, i);
    const debuts = plages
      .filter((p) => p.jour === jourSemaine(jour))
      .map((p) => instantLocal(jour, minutesEnHeure(p.debutMinutes), fuseau))
      .filter((d) => d > maintenant)
      .sort((a, b) => a.getTime() - b.getTime());
    if (debuts.length) return debuts[0];
  }
  return null;
}

/**
 * Parmi des créneaux qui se chevauchent, celui qui dit où est la personne :
 * le dernier commencé. Une réunion de 10 h tenue pendant une mission de la
 * journée, une pause posée pendant un congé — le plus récent est le plus
 * précis. À début égal, le plus court ; puis le créneau saisi, que la
 * personne a posé en connaissance de cause, avant la période déduite.
 */
export function comparerPriorite(a: Creneau, b: Creneau): number {
  return b.debut.getTime() - a.debut.getTime() || a.fin.getTime() - b.fin.getTime() || Number(Boolean(a.origine)) - Number(Boolean(b.origine));
}

/**
 * Où en est la personne à cet instant.
 *
 * Un créneau — saisi, ou déduit d'un congé, d'une mission, d'une réunion —
 * l'emporte ; s'ils se chevauchent, `comparerPriorite` tranche. Sans
 * créneau, les horaires habituels disent « disponible » ou « hors
 * horaires ». Sans horaires, on ne sait pas — et on le dit, plutôt que
 * d'afficher « disponible » à tort.
 */
export function etatActuel(maintenant: Date, creneaux: readonly Creneau[], plages: readonly Plage[], fuseau = "Africa/Abidjan"): EtatActuel {
  const enCours = creneaux.filter((c) => c.debut <= maintenant && maintenant < c.fin).sort(comparerPriorite)[0];
  if (enCours) {
    const s = STATUTS[enCours.statut];
    return { statut: enCours.statut, ...s, jusqua: enCours.fin, source: enCours.origine ? "deduite" : "creneau", creneau: enCours };
  }

  if (plages.length === 0) {
    return { statut: "non_renseigne", ...HORS.non_renseigne, joignable: false, jusqua: null, source: "aucune", creneau: null };
  }

  const jour = jourLocal(maintenant, fuseau);
  const minute = minutesDe(heureLocale(maintenant, fuseau));
  const plage = plages.find((p) => p.jour === jourSemaine(jour) && p.debutMinutes <= minute && minute < p.finMinutes);
  // Un créneau qui commence avant la fin de la plage l'interrompt.
  const prochain = creneaux
    .filter((c) => c.debut > maintenant)
    .sort((a, b) => a.debut.getTime() - b.debut.getTime())[0];
  if (plage) {
    const fin = finDePlage(jour, plage.finMinutes, fuseau);
    const jusqua = prochain && prochain.debut < fin ? prochain.debut : fin;
    return { statut: "disponible", ...STATUTS.disponible, jusqua, source: "horaires", creneau: null };
  }
  const reprise = prochaineReprise(maintenant, plages, fuseau);
  const jusqua = prochain && (!reprise || prochain.debut < reprise) ? prochain.debut : reprise;
  return { statut: "hors_horaires", ...HORS.hors_horaires, joignable: false, jusqua, source: "horaires", creneau: null };
}

// ------------------------------------------------------------ semaine

export interface Bloc {
  id: string;
  statut: StatutPlanning;
  /** Minutes depuis minuit, ce jour-là. */
  debutMinutes: number;
  finMinutes: number;
  lieu: string | null;
  note: string | null;
  /** Le créneau a commencé la veille ou plus tôt. */
  depuisAvant: boolean;
  /** Le créneau continue le lendemain. */
  continueApres: boolean;
  /** Nul pour un créneau saisi, qui se modifie ; une période déduite renvoie à sa pièce. */
  origine: Origine | null;
}

/** Les créneaux d'un jour, coupés à minuit de part et d'autre, dans l'ordre. */
export function blocsDuJour(jour: string, creneaux: readonly Creneau[], fuseau = "Africa/Abidjan"): Bloc[] {
  const debutJour = minuit(jour, fuseau);
  const finJour = minuit(ajouterJours(jour, 1), fuseau);
  // Tronquer, comme `heureLocale` : un statut posé à 12:43:40 pour une heure
  // s'affiche 12:43–13:43, et non 12:44–13:44 face à « jusqu'à 13:43 ».
  const minutes = (d: Date) => Math.floor((d.getTime() - debutJour.getTime()) / 60_000);
  return creneaux
    .filter((c) => chevauche(c, { debut: debutJour, fin: finJour }))
    .sort((a, b) => a.debut.getTime() - b.debut.getTime())
    .map((c) => ({
      id: c.id,
      statut: c.statut,
      debutMinutes: c.debut <= debutJour ? 0 : minutes(c.debut),
      finMinutes: c.fin >= finJour ? 1440 : minutes(c.fin),
      lieu: c.lieu,
      note: c.note,
      depuisAvant: c.debut < debutJour,
      continueApres: c.fin > finJour,
      origine: c.origine ?? null,
    }));
}

// ------------------------------------------------------ statut rapide

export const DUREES_RAPIDES = [
  { cle: "30m", libelle: "30 min", minutes: 30 },
  { cle: "1h", libelle: "1 h", minutes: 60 },
  { cle: "2h", libelle: "2 h", minutes: 120 },
  { cle: "4h", libelle: "4 h", minutes: 240 },
  { cle: "journee", libelle: "Jusqu'à ce soir", minutes: null },
] as const;

export type CleDuree = (typeof DUREES_RAPIDES)[number]["cle"];

/**
 * Fin d'un statut posé « maintenant ». « Jusqu'à ce soir » s'arrête à la fin
 * de la dernière plage de la journée, ou à minuit si elle est passée.
 */
export function finRapide(cle: CleDuree, maintenant: Date, plages: readonly Plage[], fuseau = "Africa/Abidjan"): Date {
  const duree = DUREES_RAPIDES.find((d) => d.cle === cle);
  if (duree?.minutes) return new Date(maintenant.getTime() + duree.minutes * 60_000);
  const jour = jourLocal(maintenant, fuseau);
  const fins = plages
    .filter((p) => p.jour === jourSemaine(jour))
    .map((p) => finDePlage(jour, p.finMinutes, fuseau))
    .filter((f) => f > maintenant)
    .sort((a, b) => b.getTime() - a.getTime());
  return fins[0] ?? minuit(ajouterJours(jour, 1), fuseau);
}
