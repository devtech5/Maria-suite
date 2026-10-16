/**
 * Périodes déduites : ce que le planning sait sans qu'on le lui dise.
 *
 * Un congé accordé, une mission confiée, une réunion programmée disent déjà
 * où sera la personne. Les ressaisir en créneau, c'est risquer qu'ils
 * divergent — le congé avancé d'un jour dans Présences, resté à l'ancienne
 * date dans le planning. Ici, chaque pièce devient une période en lecture
 * seule, avec sa référence et le lien vers l'écran qui la tient ; elle se
 * corrige là-bas, jamais depuis le planning.
 *
 * Sans base ni React : les requêtes fournissent les lignes, ces fonctions
 * en tirent les périodes, à l'heure du fuseau de l'entreprise.
 */

import type { Statut as StatutReunion } from "@/modules/meeting/calcul";
import type { StatutMission } from "@/modules/missions/schema";
import { ajouterJours, instantLocal, jourLocal, NATURES_CONGE, type NatureConge } from "@/modules/presences/calcul";

import { chevauche, comparerPriorite, type Creneau, type Origine, type SourcePeriode } from "./calcul";
import type { StatutPlanning } from "./schema";

export const SOURCES: Record<SourcePeriode, { libelle: string; statut: StatutPlanning; ouvrir: string }> = {
  conge: { libelle: "Congé", statut: "en_conge", ouvrir: "Voir le congé" },
  mission: { libelle: "Mission", statut: "en_mission", ouvrir: "Voir la mission" },
  reunion: { libelle: "Réunion", statut: "en_reunion", ouvrir: "Voir la réunion" },
};

/** « Mission LIV-2026-00003 · Livraison Bouaké » : la pièce d'où vient la période. */
export function libelleOrigine(o: Origine): string {
  return `${SOURCES[o.source].libelle} ${o.reference}${o.titre ? ` · ${o.titre}` : ""}`;
}

/** Une demi-journée de congé se coupe à midi, heure de l'entreprise. */
export const MIDI = "12:00";

/**
 * Une réunion ouverte qui déborde de sa durée prévue tient encore : on la
 * prolonge par tranches, tant que personne ne l'a terminée.
 */
export const PROLONGATION_REUNION_MS = 15 * 60_000;

/** Qui regarde le planning : ce qu'il peut ouvrir décide du titre et du lien. */
export interface Lecteur {
  userId: string;
  droits: ReadonlySet<string>;
}

function minuit(jour: string, fuseau: string): Date {
  return instantLocal(jour, "00:00", fuseau);
}

/** Minuit qui suit cet instant, heure locale. */
function finDuJour(instant: Date, fuseau: string): Date {
  return minuit(ajouterJours(jourLocal(instant, fuseau), 1), fuseau);
}

// --------------------------------------------------------------- congés

export interface CongeSource {
  id: string;
  numero: string;
  /** Compte du salarié : le planning appartient à un utilisateur. */
  userId: string;
  nature: NatureConge;
  debut: string;
  fin: string;
  /** Part l'après-midi du premier jour. */
  debutDemi: boolean;
  /** Rentre l'après-midi du dernier jour. */
  finDemi: boolean;
}

/**
 * La période d'un congé accordé. La nature (maladie, maternité…) ne se lit
 * qu'avec le droit d'ouvrir le congé : l'accueil sait que la personne est
 * absente, pas pourquoi.
 */
export function periodeConge(c: CongeSource, lecteur: Lecteur, fuseau: string): Creneau {
  const debut = instantLocal(c.debut, c.debutDemi ? MIDI : "00:00", fuseau);
  let fin = c.finDemi ? instantLocal(c.fin, MIDI, fuseau) : minuit(ajouterJours(c.fin, 1), fuseau);
  // Un seul jour, parti l'après-midi et « rentré l'après-midi » : c'est
  // l'après-midi qui est pris, comme le décompte le compte.
  if (fin <= debut) fin = minuit(ajouterJours(c.fin, 1), fuseau);
  const ouvre = lecteur.droits.has("conges.valider") || (lecteur.userId === c.userId && (lecteur.droits.has("conges.demander") || lecteur.droits.has("presences.consulter")));
  return {
    id: `conge:${c.id}`,
    userId: c.userId,
    statut: SOURCES.conge.statut,
    debut,
    fin,
    lieu: null,
    note: null,
    origine: { source: "conge", reference: c.numero, titre: ouvre ? NATURES_CONGE[c.nature].libelle : null, lien: ouvre ? "/presences/conges" : null },
  };
}

// ------------------------------------------------------------- missions

export interface MissionSource {
  id: string;
  reference: string;
  titre: string;
  lieu: string | null;
  statut: StatutMission;
  /** Compte du salarié exécutant. Un intervenant sans compte ne tient pas de planning. */
  userId: string;
  echeanceLe: Date | null;
  debuteLe: Date | null;
  clotureLe: Date | null;
}

/**
 * La période d'une mission. Une mission ne porte pas d'heure de départ
 * prévue, seulement une échéance : tant qu'elle n'a pas commencé, elle
 * occupe la journée de l'échéance jusqu'à l'échéance. Commencée, elle part
 * de la première étape faite et tient jusqu'à l'échéance — ou, l'échéance
 * dépassée, jusqu'au soir : la personne est encore dehors. Close, elle
 * reste dans l'historique, du départ à la clôture.
 *
 * Nulle quand rien ne la situe : annulée, ou planifiée sans échéance.
 */
export function periodeMission(m: MissionSource, lecteur: Lecteur, maintenant: Date, fuseau: string): Creneau | null {
  // Une échéance à minuit pile ferme la journée précédente.
  const jourEcheance = m.echeanceLe ? jourLocal(new Date(m.echeanceLe.getTime() - 1), fuseau) : null;
  let debut: Date | null = null;
  let fin: Date | null = null;
  switch (m.statut) {
    case "annulee":
      return null;
    case "planifiee":
      if (m.echeanceLe && jourEcheance) [debut, fin] = [m.debuteLe ?? minuit(jourEcheance, fuseau), m.echeanceLe];
      break;
    case "en_cours":
      debut = m.debuteLe ?? (jourEcheance ? minuit(jourEcheance, fuseau) : null);
      fin = m.echeanceLe && m.echeanceLe > maintenant ? m.echeanceLe : finDuJour(maintenant, fuseau);
      break;
    case "terminee":
    case "echouee":
      fin = m.clotureLe ?? m.echeanceLe;
      debut = m.debuteLe ?? (fin ? minuit(jourLocal(new Date(fin.getTime() - 1), fuseau), fuseau) : null);
      break;
  }
  if (!debut || !fin || fin <= debut) return null;
  const ouvre = lecteur.droits.has("missions.consulter");
  return {
    id: `mission:${m.id}`,
    userId: m.userId,
    statut: SOURCES.mission.statut,
    debut,
    fin,
    lieu: m.lieu,
    note: null,
    origine: { source: "mission", reference: m.reference, titre: ouvre ? m.titre : null, lien: ouvre ? `/missions/suivi?mission=${m.id}` : null },
  };
}

// ------------------------------------------------------------- réunions

export interface ReunionSource {
  id: string;
  numero: string;
  titre: string;
  statut: StatutReunion;
  debutPrevu: Date;
  dureeMinutes: number;
  ouverteLe: Date | null;
  termineeLe: Date | null;
  organisateurUserId: string;
  /** Le participant dont on lit le planning. */
  userId: string;
  /** Ce participant est entré dans la salle. */
  rejoint: boolean;
  /** Celui qui lit le planning est lui-même invité à cette réunion. */
  lecteurInvite: boolean;
}

/**
 * La période d'une réunion pour l'un de ses invités. Programmée, elle tient
 * son heure et sa durée prévues ; ouverte, elle part de l'ouverture et se
 * prolonge si elle déborde. Terminée, elle ne reste qu'au planning de ceux
 * qui sont venus : un invité absent n'était pas en réunion.
 */
export function periodeReunion(r: ReunionSource, lecteur: Lecteur, maintenant: Date): Creneau | null {
  const finPrevue = new Date(r.debutPrevu.getTime() + r.dureeMinutes * 60_000);
  let debut = r.debutPrevu;
  let fin = finPrevue;
  switch (r.statut) {
    case "annulee":
      return null;
    case "planifiee":
      break;
    case "en_cours":
      debut = r.ouverteLe ?? r.debutPrevu;
      if (fin <= maintenant) fin = new Date(maintenant.getTime() + PROLONGATION_REUNION_MS);
      break;
    case "terminee":
      if (!r.rejoint || !r.termineeLe) return null;
      debut = r.ouverteLe ?? r.debutPrevu;
      fin = r.termineeLe;
      break;
  }
  if (fin <= debut) return null;
  // Même règle que l'écran de la réunion : invité, organisateur, ou droit d'organiser.
  const ouvre = lecteur.droits.has("meeting.participer") && (r.lecteurInvite || r.organisateurUserId === lecteur.userId || lecteur.droits.has("meeting.organiser"));
  return {
    id: `reunion:${r.id}`,
    userId: r.userId,
    statut: SOURCES.reunion.statut,
    debut,
    fin,
    lieu: null,
    note: null,
    origine: { source: "reunion", reference: r.numero, titre: ouvre ? r.titre : null, lien: ouvre ? `/meeting/${r.id}` : null },
  };
}

// --------------------------------------------------------------- fusion

/**
 * Créneaux saisis et périodes déduites, en une liste : celles qui touchent
 * la fenêtre, dans l'ordre du début, et à début égal dans l'ordre de
 * priorité de `etatActuel`. Rien n'est écarté pour un chevauchement : une
 * réunion pendant une mission est un fait, et la semaine montre les deux.
 */
export function fusionner(creneaux: readonly Creneau[], deduites: readonly (Creneau | null)[], fenetre?: { du: Date; au: Date }): Creneau[] {
  return [...creneaux, ...deduites.filter((c): c is Creneau => c !== null)]
    .filter((c) => !fenetre || chevauche(c, { debut: fenetre.du, fin: fenetre.au }))
    .sort((a, b) => a.debut.getTime() - b.debut.getTime() || comparerPriorite(a, b));
}
