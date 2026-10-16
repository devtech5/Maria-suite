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
