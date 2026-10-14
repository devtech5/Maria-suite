/**
 * Meeting : réunions d'équipe à distance.
 *
 * Le chemin d'une image, d'un participant aux autres :
 *
 *     caméra et micro du navigateur
 *       → serveur vidéo (MediaMTX), où le navigateur PUBLIE son flux (WHIP)
 *       → navigateurs des autres participants, qui le LISENT (WHEP)
 *
 * Le serveur vidéo est celui du module Sécurité : il relaie, il ne décide de
 * rien. Chaque publication et chaque lecture passent par Maria Suite
 * (`/api/video/autorisation`), qui vérifie le jeton, la réunion et la place du
 * participant. Chacun n'envoie qu'un flux, quel que soit le nombre de
 * présents : c'est ce qui tient sur une liaison montante d'Abidjan.
 *
 * Ce fichier est pur : statuts, gestes, chemins, présence. Il se teste sans
 * réseau et s'importe depuis le navigateur.
 */

export type Statut = "planifiee" | "en_cours" | "terminee" | "annulee";
export type Geste = "terminer" | "annuler";
/** Flux d'un participant : sa caméra (avec son micro), ou l'écran qu'il partage. */
export type Flux = "cam" | "ecran";

export const LIBELLE_STATUT: Record<Statut, string> = {
  planifiee: "Programmée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

/** Durées proposées, en minutes. */
export const DUREES = [15, 30, 45, 60, 90, 120, 180] as const;
export const DUREE_MIN = 5;
export const DUREE_MAX = 480;

export function dureeValide(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= DUREE_MIN && minutes <= DUREE_MAX;
}

/** Une réunion se rejoint tant qu'elle n'est ni terminée ni annulée ; la première arrivée l'ouvre. */
export function rejoignable(statut: Statut): boolean {
  return statut === "planifiee" || statut === "en_cours";
}

const TRANSITIONS: Record<Geste, { depuis: Statut[]; vers: Statut }> = {
  terminer: { depuis: ["en_cours"], vers: "terminee" },
  annuler: { depuis: ["planifiee"], vers: "annulee" },
};

export function statutApres(geste: Geste, actuel: Statut): Statut | null {
  const regle = TRANSITIONS[geste];
  return regle.depuis.includes(actuel) ? regle.vers : null;
}

export interface Acteur {
  userId: string;
  /** Porte le droit d'organiser : pilote toute réunion, même celle d'un autre. */
  organise: boolean;
}

/**
 * Piloter une réunion — la terminer, l'annuler, inviter, rédiger le compte
 * rendu : l'organisateur, ou qui porte le droit d'organiser. Un participant
 * ne met pas fin à la réunion des autres.
 */
export function pilote(reunion: { organisateurUserId: string }, acteur: Acteur): boolean {
  return acteur.organise || reunion.organisateurUserId === acteur.userId;
}

/** Gestes proposés, dans l'ordre d'affichage. */
export function gestesPossibles(statut: Statut, reunion: { organisateurUserId: string }, acteur: Acteur): Geste[] {
  if (!pilote(reunion, acteur)) return [];
  return (["terminer", "annuler"] as const).filter((g) => statutApres(g, statut) !== null);
}

// ---------------------------------------------------------------- présence

/** Le navigateur se signale toutes les quatre secondes depuis la salle. */
export const PAS_SIGNAL_MS = 4_000;

/**
 * Au-delà, un participant a quitté la salle : onglet fermé, réseau coupé,
 * écran verrouillé. Trois signaux manqués, pas un : un signal perdu sur un
 * réseau mobile ne doit pas faire disparaître quelqu'un qui parle.
 */
export const FRAICHEUR_MS = 15_000;

export function present(vuLe: Date | null, maintenant: Date): boolean {
  return vuLe !== null && maintenant.getTime() - vuLe.getTime() <= FRAICHEUR_MS;
}

/**
 * Secondes de présence à ajouter au cumul d'un participant, depuis son
 * dernier signal. Un trou plus long que la fraîcheur n'est pas de la
 * présence : le participant était parti, il revient.
 */
export function secondesDePresence(vuLe: Date | null, maintenant: Date): number {
  if (!vuLe) return 0;
  const ecart = maintenant.getTime() - vuLe.getTime();
  if (ecart <= 0 || ecart > FRAICHEUR_MS) return 0;
  return Math.floor(ecart / 1000);
}

/** « 1 h 05 », « 2 h », « 12 min », « moins d'une minute ». */
export function dureeLisible(secondes: number): string {
  const minutes = Math.floor(secondes / 60);
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 60) return `${minutes} min`;
  const heures = `${Math.floor(minutes / 60)} h`;
  return minutes % 60 === 0 ? heures : `${heures} ${String(minutes % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ chemins

/**
 * Chemin d'un flux sur le serveur vidéo : `m/<réunion>/<participant>/<flux>`.
 *
 * Le participant est dans le chemin : c'est ce qui permet de refuser à
 * quelqu'un de publier sous le nom d'un autre.
 */
export function cheminFlux(reunionId: string, userId: string, flux: Flux): string {
  return `m/${reunionId}/${userId}/${flux}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MOTIF_CHEMIN = new RegExp(`^m/(${UUID})/(${UUID})/(cam|ecran)$`, "i");

export function lireChemin(chemin: string): { reunionId: string; userId: string; flux: Flux } | null {
  const m = MOTIF_CHEMIN.exec(chemin.replace(/^\//, ""));
  return m ? { reunionId: m[1].toLowerCase(), userId: m[2].toLowerCase(), flux: m[3].toLowerCase() as Flux } : null;
}

/** Vrai si le chemin relève de Meeting, et non des caméras du module Sécurité. */
export function cheminDeReunion(chemin: string): boolean {
  return chemin.replace(/^\//, "").startsWith("m/");
}

/** Adresse WHIP (publier) ou WHEP (lire) d'un flux, jeton compris. */
export function adresseFlux(base: string, chemin: string, sens: "whip" | "whep", jeton: string): string {
  return `${base.replace(/\/$/, "")}/${chemin}/${sens}?jeton=${encodeURIComponent(jeton)}`;
}

/**
 * Disposition de la mosaïque : colonnes pour `n` tuiles. Un écran partagé
 * passe en grand et n'entre pas dans ce compte.
 */
export function colonnesMosaique(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}
