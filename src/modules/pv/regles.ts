/**
 * Procès-verbaux : les règles, sans base ni React. Importable depuis le
 * navigateur — l'écran prévient, le serveur rejoue toujours les mêmes règles.
 *
 * Un PV se rédige (brouillon), se soumet à la direction (à valider), qui le
 * renvoie avec une remarque ou le publie : il reçoit alors son numéro, son
 * texte se fige et il part à ses destinataires. Corriger un PV publié, c'est
 * en publier une nouvelle version, sous le même numéro.
 */

export const TYPES_PV = ["reunion", "chantier", "compte_rendu", "rapport"] as const;
export type TypePv = (typeof TYPES_PV)[number];

export const LIBELLE_TYPE: Record<TypePv, string> = {
  reunion: "Procès-verbal de réunion",
  chantier: "Procès-verbal de réunion de chantier",
  compte_rendu: "Compte rendu",
  rapport: "Rapport",
};

export const LIBELLE_TYPE_COURT: Record<TypePv, string> = {
  reunion: "PV de réunion",
  chantier: "PV de chantier",
  compte_rendu: "Compte rendu",
  rapport: "Rapport",
};

export type StatutPv = "brouillon" | "a_valider" | "publie";

export const LIBELLE_STATUT: Record<StatutPv, string> = {
  brouillon: "Brouillon",
  a_valider: "À valider",
  publie: "Publié",
};

export const estTypePv = (v: unknown): v is TypePv => typeof v === "string" && (TYPES_PV as readonly string[]).includes(v);

// ------------------------------------------------------------------ contenu

export type Presence = "present" | "absent" | "excuse";

export const LIBELLE_PRESENCE: Record<Presence, string> = { present: "Présent", absent: "Absent", excuse: "Excusé" };

export interface Participant {
  nom: string;
  /** Fonction ou qualité : « Directeur technique », « Bureau de contrôle ». */
  qualite: string;
  presence: Presence;
  /** Compte du participant, quand il en a un. */
  userId?: string | null;
}

export interface Point {
  titre: string;
  /** Les échanges, mis en forme comme une mise à jour de tâche (`**gras**`, listes…). */
  texte: string;
  /** Ce qui a été décidé sur ce point, une décision par ligne. */
  decisions: string[];
}

export interface Diffusion {
  /** Tout le personnel qui a un compte. */
  tous: boolean;
  /** Services du référentiel : leurs collaborateurs qui ont un compte. */
  services: string[];
  /** Comptes choisis un à un. */
  comptes: string[];
}

export const DIFFUSION_VIDE: Diffusion = { tous: false, services: [], comptes: [] };

export const OBJET_MAX = 200;
export const TEXTE_MAX = 20_000;
export const PARTICIPANTS_MAX = 200;
export const POINTS_MAX = 60;
export const ACTIONS_MAX = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const propre = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Participants nettoyés : sans nom, la ligne tombe ; une présence inconnue vaut « présent ». */
export function normaliserParticipants(brut: unknown): Participant[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((p): Participant => {
      const o = (p ?? {}) as Record<string, unknown>;
      const presence = o.presence === "absent" || o.presence === "excuse" ? o.presence : "present";
      const userId = typeof o.userId === "string" && UUID.test(o.userId) ? o.userId : null;
      return { nom: propre(o.nom, 120), qualite: propre(o.qualite, 120), presence, userId };
    })
    .filter((p) => p.nom.length >= 2)
    .slice(0, PARTICIPANTS_MAX);
}

/** Points nettoyés : un point sans titre ni texte tombe ; les décisions vides aussi. */
export function normaliserPoints(brut: unknown): Point[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((p): Point => {
      const o = (p ?? {}) as Record<string, unknown>;
      const texte = typeof o.texte === "string" ? o.texte.replace(/\r\n?/g, "\n").trim().slice(0, TEXTE_MAX) : "";
      const decisions = Array.isArray(o.decisions) ? o.decisions.map((d) => propre(d, 500)).filter(Boolean).slice(0, 50) : [];
      return { titre: propre(o.titre, 200), texte, decisions };
    })
    .filter((p) => p.titre || p.texte || p.decisions.length)
    .slice(0, POINTS_MAX);
}

export function normaliserDiffusion(brut: unknown): Diffusion {
  const o = (brut ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => [...new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [])].slice(0, 500);
  return { tous: o.tous === true, services: ids(o.services), comptes: ids(o.comptes) };
}

export const diffusionVide = (d: Diffusion) => !d.tous && d.services.length === 0 && d.comptes.length === 0;

/**
 * Ce qui manque pour soumettre ou publier, dit en clair ; `null` si rien.
 * Un PV confidentiel ne part pas à tout le personnel : on choisit ses lecteurs.
 */
export function refusSoumission(pv: {
  objet: string;
  type: TypePv;
  participants: Participant[];
  points: Point[];
  diffusion: Diffusion;
  confidentiel: boolean;
  projetId?: string | null;
  chantier?: DonneesChantier | null;
}): string | null {
  if (pv.objet.trim().length < 3) return "Donnez l'objet du procès-verbal.";
  if (pv.type === "chantier") {
    if (!pv.projetId) return "Rattachez le PV de chantier à son projet.";
    if (pv.points.length === 0 && !(pv.chantier?.avancement.length ?? 0)) return "Rédigez au moins un point ou l'avancement d'un lot.";
  } else if (pv.points.length === 0) return "Rédigez au moins un point.";
  if ((pv.type === "reunion" || pv.type === "chantier") && !pv.participants.some((p) => p.presence === "present")) return "Un PV de réunion nomme au moins un participant présent.";
  if (diffusionVide(pv.diffusion)) return "Choisissez à qui le diffuser : tout le personnel, des services ou des personnes.";
  if (pv.confidentiel && pv.diffusion.tous) return "Un PV confidentiel ne se diffuse pas à tout le personnel : choisissez ses lecteurs.";
  return null;
}

// ------------------------------------------------------------------ gestes

export type GestePv = "modifier" | "soumettre" | "renvoyer" | "publier" | "reviser" | "supprimer";

export interface RolePv {
  /** A rédigé ce PV. */
  redacteur: boolean;
  /** Porte `pv.valider` : la direction. */
  valideur: boolean;
}

/**
 * Gestes permis selon l'état et le rôle.
 *
 *   brouillon — le rédacteur le modifie, le soumet ou le supprime ; la
 *               direction peut le publier d'emblée ;
 *   à valider — la direction le renvoie avec une remarque ou le publie ; le
 *               rédacteur peut le reprendre (retour au brouillon) ;
 *   publié    — figé : rédacteur et direction en ouvrent une nouvelle
 *               version.
 */
export function gestesPv(statut: StatutPv, role: RolePv): GestePv[] {
  const g: GestePv[] = [];
  if (statut === "brouillon") {
    if (role.redacteur || role.valideur) g.push("modifier");
    if (role.redacteur && !role.valideur) g.push("soumettre");
    if (role.valideur) g.push("publier");
    if (role.redacteur || role.valideur) g.push("supprimer");
  } else if (statut === "a_valider") {
    if (role.valideur) g.push("renvoyer", "publier");
    else if (role.redacteur) g.push("renvoyer");
  } else if (role.redacteur || role.valideur) {
    g.push("reviser");
  }
  return g;
}

/** « PV-2026-00012 », ou « PV-2026-00012 (version 2) ». */
export function referencePv(numero: string | null, revision: number): string {
  if (!numero) return "Sans numéro (brouillon)";
  return revision > 1 ? `${numero} (version ${revision})` : numero;
}

// ------------------------------------------------------------------ lectures

export interface Lecteur {
  userId: string;
  nom: string;
  luLe: Date | null;
}

export function suiviLectures(lecteurs: Lecteur[]): { total: number; lus: number; pourcent: number; enAttente: Lecteur[]; ontLu: Lecteur[] } {
  const ontLu = lecteurs.filter((l) => l.luLe).sort((a, b) => b.luLe!.getTime() - a.luLe!.getTime());
  const enAttente = lecteurs.filter((l) => !l.luLe).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const total = lecteurs.length;
  return { total, lus: ontLu.length, pourcent: total === 0 ? 0 : Math.floor((ontLu.length * 100) / total), enAttente, ontLu };
}

/**
 * Destinataires d'une diffusion, parmi les comptes actifs : tous, ou ceux des
 * services choisis, ou ceux nommés — sans doublon, sans le rédacteur (il ne
 * s'accuse pas réception à lui-même).
 */
export function destinataires(
  diffusion: Diffusion,
  comptes: { userId: string; serviceId: string | null }[],
  redacteur: string,
): string[] {
  const actifs = new Set(comptes.map((c) => c.userId));
  const choisis = new Set<string>();
  for (const c of comptes) {
    if (diffusion.tous || (c.serviceId && diffusion.services.includes(c.serviceId))) choisis.add(c.userId);
  }
  for (const u of diffusion.comptes) if (actifs.has(u)) choisis.add(u);
  choisis.delete(redacteur);
  return [...choisis];
}

// ------------------------------------------------------------------ pièces jointes

export const PIECES_MAX = 20;

/**
 * Les pièces jointes font partie du document : elles se joignent et se
 * retirent tant qu'il s'écrit — par le rédacteur au brouillon, par la
 * direction jusqu'à la publication — puis se figent avec lui.
 */
export function piecesModifiables(statut: StatutPv, role: RolePv): boolean {
  if (statut === "brouillon") return role.redacteur || role.valideur;
  if (statut === "a_valider") return role.valideur;
  return false;
}

// ------------------------------------------------------------------ signatures

/**
 * Le tracé d'une signature, en chemin SVG : des traits `M x y L x y …`, en
 * coordonnées entières dans un cadre de 1000 × 400. Ce sont des données, pas
 * un fichier : la signature s'imprime avec le PV sans URL à signer, et rien
 * d'autre qu'un trait ne peut s'y glisser — le format est vérifié au point près.
 */
export const CADRE_SIGNATURE = { largeur: 1000, hauteur: 400 } as const;
export const TRACE_MAX = 30_000;
const TRACE = /^(?:M\d{1,4} \d{1,3}(?: L\d{1,4} \d{1,3})*)(?: M\d{1,4} \d{1,3}(?: L\d{1,4} \d{1,3})*)*$/;

/** Le tracé, s'il est bien formé et assez long pour être une signature ; sinon le motif du refus. */
export function verifierTrace(trace: unknown): { ok: true; valeur: string } | { ok: false; message: string } {
  if (typeof trace !== "string" || trace.length === 0) return { ok: false, message: "Signez dans le cadre." };
  const propre = trace.trim().replace(/\s+/g, " ");
  if (propre.length > TRACE_MAX) return { ok: false, message: "Signature trop chargée : recommencez plus simplement." };
  if (!TRACE.test(propre)) return { ok: false, message: "Signature illisible : recommencez." };
  const points = propre.match(/\d{1,4} \d{1,3}/g) ?? [];
  if (points.some((p) => Number(p.split(" ")[0]) > CADRE_SIGNATURE.largeur || Number(p.split(" ")[1]) > CADRE_SIGNATURE.hauteur)) {
    return { ok: false, message: "Signature hors du cadre : recommencez." };
  }
  // Un point ou un trait de quelques pixels n'est pas une signature.
  if (points.length < 8) return { ok: false, message: "Signature trop courte : signez comme sur papier." };
  return { ok: true, valeur: propre };
}

export interface Signataire {
  /** Place du participant dans la liste du PV : la liste est figée à la publication. */
  rang: number;
  nom: string;
  qualite: string;
  userId: string | null;
}

/** Ceux qui signent : les participants présents, et eux seuls. */
export function signatairesDe(participants: Participant[]): Signataire[] {
  return participants.flatMap((p, rang) => (p.presence === "present" ? [{ rang, nom: p.nom, qualite: p.qualite, userId: p.userId ?? null }] : []));
}

/** Le signataire de ce rang, s'il est bien un participant présent. */
export function signataireDe(participants: Participant[], rang: number): Signataire | undefined {
  return Number.isInteger(rang) ? signatairesDe(participants).find((s) => s.rang === rang) : undefined;
}

/**
 * Qui peut apposer la signature d'un participant : lui-même depuis son
 * compte, ou — sur place, sur l'appareil qu'on lui tend — le rédacteur ou la
 * direction. Seulement une fois le PV publié : on signe un texte figé.
 */
export function signaturePermise(
  statut: StatutPv,
  signataire: Signataire | undefined,
  acteur: { userId: string; redacteur: boolean; valideur: boolean },
): "personnelle" | "sur_place" | null {
  if (statut !== "publie" || !signataire) return null;
  if (signataire.userId && signataire.userId === acteur.userId) return "personnelle";
  if (acteur.redacteur || acteur.valideur) return "sur_place";
  return null;
}

// ------------------------------------------------------------------ chantier

/**
 * Le PV de réunion de chantier : rattaché à un projet, numéroté dans la
 * suite des réunions de ce projet (réunion n° 1, 2, 3…), il porte en plus
 * les conditions du jour (météo, effectifs présents par entreprise),
 * l'avancement des travaux lot par lot et la date de la prochaine réunion.
 * Pourcentages et effectifs sont des entiers.
 */
export const METEOS = ["ensoleille", "nuageux", "pluvieux", "orageux"] as const;
export type Meteo = (typeof METEOS)[number];

export const LIBELLE_METEO: Record<Meteo, string> = { ensoleille: "Ensoleillé", nuageux: "Nuageux", pluvieux: "Pluvieux", orageux: "Orageux" };

export interface Effectif {
  /** Entreprise ou équipe : « MARIA GROUP », « Sous-traitant électricité ». */
  entreprise: string;
  /** Lot ou corps d'état, facultatif. */
  lot: string;
  /** Personnes présentes sur le chantier : un entier. */
  nombre: number;
}

export interface Avancement {
  /** Lot, ouvrage ou tâche du planning : « Gros œuvre — R+1 ». */
  lot: string;
  /** Avancement prévu au planning à la date de la réunion, en %, s'il est connu. */
  prevu: number | null;
  /** Avancement constaté, en %. */
  realise: number;
  observation: string;
}

export interface DonneesChantier {
  meteo: Meteo | null;
  /** Travaux interrompus par les intempéries ce jour-là. */
  intemperies: boolean;
  effectifs: Effectif[];
  avancement: Avancement[];
  prochaineReunion: { date: string | null; heure: string | null; lieu: string };
}

export const CHANTIER_VIDE: DonneesChantier = { meteo: null, intemperies: false, effectifs: [], avancement: [], prochaineReunion: { date: null, heure: null, lieu: "" } };

export const LIGNES_CHANTIER_MAX = 60;
export const NUMERO_REUNION_MAX = 9999;

/** Un entier borné, ou `null` si la saisie n'en est pas un. */
function entier(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Données de chantier nettoyées : lignes vides retirées, pourcentages entre 0 et 100, effectifs entiers. */
export function normaliserChantier(brut: unknown): DonneesChantier {
  const o = (brut ?? {}) as Record<string, unknown>;
  const meteo = (METEOS as readonly string[]).includes(o.meteo as string) ? (o.meteo as Meteo) : null;
  const effectifs = (Array.isArray(o.effectifs) ? o.effectifs : [])
    .map((e): Effectif => {
      const x = (e ?? {}) as Record<string, unknown>;
      return { entreprise: propre(x.entreprise, 120), lot: propre(x.lot, 120), nombre: entier(x.nombre, 0, 100_000) ?? 0 };
    })
    .filter((e) => e.entreprise.length >= 2)
    .slice(0, LIGNES_CHANTIER_MAX);
  const avancement = (Array.isArray(o.avancement) ? o.avancement : [])
    .map((a): Avancement => {
      const x = (a ?? {}) as Record<string, unknown>;
      return { lot: propre(x.lot, 160), prevu: entier(x.prevu, 0, 100), realise: entier(x.realise, 0, 100) ?? 0, observation: propre(x.observation, 500) };
    })
    .filter((a) => a.lot.length >= 2)
    .slice(0, LIGNES_CHANTIER_MAX);
  const p = (o.prochaineReunion ?? {}) as Record<string, unknown>;
  const date = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
  const heure = typeof p.heure === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.heure) ? p.heure : null;
  return { meteo, intemperies: o.intemperies === true, effectifs, avancement, prochaineReunion: { date, heure, lieu: propre(p.lieu, 120) } };
}

/** Effectif total présent sur le chantier : la somme des lignes. */
export const effectifTotal = (effectifs: Effectif[]) => effectifs.reduce((t, e) => t + e.nombre, 0);

/**
 * Écart entre le réalisé et le prévu, en points : négatif = retard. `null`
 * sans prévu. Un retard se signale dès 5 points.
 */
export function ecartAvancement(a: Avancement): { points: number; retard: boolean } | null {
  if (a.prevu === null) return null;
  const points = a.realise - a.prevu;
  return { points, retard: points <= -5 };
}

/** Le numéro de la prochaine réunion d'un projet : la suite du plus grand déjà donné. */
export const numeroReunionSuivant = (dejaDonnes: (number | null)[]) => Math.min(NUMERO_REUNION_MAX, Math.max(0, ...dejaDonnes.filter((n): n is number => typeof n === "number")) + 1);

/** « Réunion de chantier n° 7 — Résidence Les Palmiers ». */
export const objetChantier = (numero: number, projet: string) => `Réunion de chantier n° ${numero} — ${projet}`.slice(0, OBJET_MAX);

/**
 * Ce que la réunion suivante reprend de la précédente : les mêmes
 * participants (tous présents par défaut), les mêmes entreprises et les mêmes
 * lots, l'avancement constaté devenant le point de départ. (Le lieu, la
 * diffusion et les actions encore ouvertes se reprennent en base.) Météo, effectifs et
 * observations sont ceux du jour : ils repartent à zéro.
 */
export function repriseChantier(precedent: { participants: Participant[]; chantier: DonneesChantier | null }): { participants: Participant[]; chantier: DonneesChantier } {
  const c = precedent.chantier ?? CHANTIER_VIDE;
  return {
    participants: precedent.participants.map((p) => ({ ...p, presence: "present" as const })),
    chantier: {
      ...CHANTIER_VIDE,
      effectifs: c.effectifs.map((e) => ({ ...e, nombre: 0 })),
      avancement: c.avancement.map((a) => ({ lot: a.lot, prevu: null, realise: a.realise, observation: "" })),
    },
  };
}
