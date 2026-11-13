/**
 * Procès-verbaux : les règles, sans base ni React. Importable depuis le
 * navigateur — l'écran prévient, le serveur rejoue toujours les mêmes règles.
 *
 * Un PV se rédige (brouillon), se soumet à la direction (à valider), qui le
 * renvoie avec une remarque ou le publie : il reçoit alors son numéro, son
 * texte se fige et il part à ses destinataires. Corriger un PV publié, c'est
 * en publier une nouvelle version, sous le même numéro.
 */

export const TYPES_PV = ["reunion", "compte_rendu", "rapport"] as const;
export type TypePv = (typeof TYPES_PV)[number];

export const LIBELLE_TYPE: Record<TypePv, string> = {
  reunion: "Procès-verbal de réunion",
  compte_rendu: "Compte rendu",
  rapport: "Rapport",
};

export const LIBELLE_TYPE_COURT: Record<TypePv, string> = {
  reunion: "PV de réunion",
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
}): string | null {
  if (pv.objet.trim().length < 3) return "Donnez l'objet du procès-verbal.";
  if (pv.points.length === 0) return "Rédigez au moins un point.";
  if (pv.type === "reunion" && !pv.participants.some((p) => p.presence === "present")) return "Un PV de réunion nomme au moins un participant présent.";
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
