/**
 * Mise en forme du planning pour l'écran : jours, heures, état. Sans base ni
 * React ; les pages serveur s'en servent pour préparer ce que reçoivent les
 * composants client.
 */

import { ajouterJours, heureLocale, instantLocal, jourLocal, jourSemaine } from "@/modules/presences/calcul";

import { blocsDuJour, minutesEnHeure, type Bloc, type Creneau, type EtatActuel, type Plage } from "./calcul";

const JOURS_COURTS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."] as const;

/** « lun. 06/10 ». */
export function titreJour(jour: string): string {
  return `${JOURS_COURTS[jourSemaine(jour) - 1]} ${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
}

/** « 18:00 » le jour même, sinon « mar. 07/10 à 08:00 ». */
export function formaterEcheance(instant: Date | null, maintenant: Date, fuseau: string): string | null {
  if (!instant) return null;
  const jour = jourLocal(instant, fuseau);
  const heure = heureLocale(instant, fuseau);
  return jour === jourLocal(maintenant, fuseau) ? heure : `${titreJour(jour)} à ${heure}`;
}

/** « 08:00–12:00, 14:00–18:00 », ou nul un jour de repos. */
export function resumeHoraires(plages: readonly Plage[], jour: string): string | null {
  const du = plages.filter((p) => p.jour === jourSemaine(jour)).sort((a, b) => a.debutMinutes - b.debutMinutes);
  return du.length ? du.map((p) => `${minutesEnHeure(p.debutMinutes)}–${minutesEnHeure(p.finMinutes)}`).join(", ") : null;
}

export function etatAffiche(etat: EtatActuel, maintenant: Date, fuseau: string) {
  return {
    libelle: etat.libelle,
    couleur: etat.couleur,
    jusqua: formaterEcheance(etat.jusqua, maintenant, fuseau),
    source: etat.source,
    lieu: etat.creneau?.lieu ?? null,
    origine: etat.creneau?.origine ?? null,
  };
}

/** Un créneau tel que le formulaire le reprend : jours et heures locaux. */
export function creneauAffiche(c: Creneau, fuseau: string) {
  return {
    id: c.id,
    statut: c.statut,
    jourDebut: jourLocal(c.debut, fuseau),
    heureDebut: heureLocale(c.debut, fuseau),
    jourFin: jourLocal(c.fin, fuseau),
    heureFin: heureLocale(c.fin, fuseau),
    lieu: c.lieu,
    note: c.note,
  };
}

/** La semaine d'une personne, jour par jour. */
export function semaineAffichee(lundi: string, aujourdhui: string, creneaux: readonly Creneau[], plages: readonly Plage[], fuseau: string): { jour: string; titre: string; aujourdhui: boolean; horaires: string | null; blocs: Bloc[] }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const jour = ajouterJours(lundi, i);
    return { jour, titre: titreJour(jour), aujourdhui: jour === aujourdhui, horaires: resumeHoraires(plages, jour), blocs: blocsDuJour(jour, creneaux, fuseau) };
  });
}

/** Bornes d'une semaine, comme instants : de lundi 00:00 au lundi suivant 00:00. */
export function bornesSemaine(lundi: string, fuseau: string): { du: Date; au: Date } {
  return { du: instantLocal(lundi, "00:00", fuseau), au: instantLocal(ajouterJours(lundi, 7), "00:00", fuseau) };
}

// ---------------------------------------------------------------- mois

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;

const MOIS_ISO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** « 2026-11 » si la saisie est un mois lisible, sinon nul. */
export function moisValide(mois: unknown): string | null {
  return typeof mois === "string" && MOIS_ISO.test(mois) ? mois : null;
}

/** Le mois d'un jour : « 2026-11-10 » → « 2026-11 ». */
export function moisDe(jour: string): string {
  return jour.slice(0, 7);
}

/** Le mois décalé de `n` : (« 2026-12 », 1) → « 2027-01 ». */
export function moisVoisin(mois: string, n: number): string {
  const rang = Number(mois.slice(0, 4)) * 12 + Number(mois.slice(5, 7)) - 1 + n;
  return `${Math.floor(rang / 12)}-${String((rang % 12) + 1).padStart(2, "0")}`;
}

/** Nombre de jours du mois, années bissextiles comprises. */
export function joursDansMois(mois: string): number {
  // Jour 0 du mois suivant = dernier jour de celui-ci ; calcul en UTC, sans fuseau.
  return new Date(Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0)).getUTCDate();
}

/** « novembre 2026 ». */
export function titreMois(mois: string): string {
  return `${NOMS_MOIS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}`;
}

/** Bornes du mois, comme instants : du 1er à 00:00 au 1er du mois suivant à 00:00. */
export function bornesMois(mois: string, fuseau: string): { du: Date; au: Date } {
  return { du: instantLocal(`${mois}-01`, "00:00", fuseau), au: instantLocal(`${moisVoisin(mois, 1)}-01`, "00:00", fuseau) };
}

export interface JourDuMois {
  jour: string;
  /** Numéro du jour dans le mois : 1 à 31. */
  numero: number;
  aujourdhui: boolean;
  /** Samedi ou dimanche. */
  finDeSemaine: boolean;
  horaires: string | null;
  blocs: Bloc[];
}

/**
 * Le mois d'une personne, en semaines du lundi au dimanche : du 1er au
 * dernier jour du mois, rien de plus. Les cases avant le 1er et après le
 * dernier jour restent vides (`null`) pour que chaque colonne garde son jour
 * de la semaine.
 */
export function moisAffiche(mois: string, aujourdhui: string, creneaux: readonly Creneau[], plages: readonly Plage[], fuseau: string): (JourDuMois | null)[][] {
  const premier = `${mois}-01`;
  const total = joursDansMois(mois);
  const avant = jourSemaine(premier) - 1;
  const cases: (JourDuMois | null)[] = Array.from({ length: avant }, () => null);
  for (let i = 0; i < total; i++) {
    const jour = ajouterJours(premier, i);
    const rang = jourSemaine(jour);
    cases.push({ jour, numero: i + 1, aujourdhui: jour === aujourdhui, finDeSemaine: rang >= 6, horaires: resumeHoraires(plages, jour), blocs: blocsDuJour(jour, creneaux, fuseau) });
  }
  while (cases.length % 7 !== 0) cases.push(null);
  return Array.from({ length: cases.length / 7 }, (_, s) => cases.slice(s * 7, s * 7 + 7));
}
