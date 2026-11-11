/**
 * Transmissions : les règles, sans base ni React.
 *
 * Un BORDEREAU de transmission (`BT-AAAA-NNNNN`) accompagne des pièces d'un
 * détenteur à un autre. Trois sens :
 *
 *   · INTERNE  — d'un service à un autre, avec sa mention (pour attribution,
 *                pour avis, pour signature…) et l'accusé du destinataire ;
 *   · SORTANTE — ce que NOUS transmettons à une entreprise : à transmettre
 *                avant une date, transmise, accusée (décharge), puis son
 *                retour (un visa, une signature) ;
 *   · ENTRANTE — ce qu'une entreprise DOIT NOUS transmettre : attendue avant
 *                une date, reçue, traitée.
 *
 * Une pièce technique porte son indice de révision (A, B, C…) ; le retour
 * dit ce qu'en pense le destinataire : bon pour exécution, visé avec
 * observations, refusé. Ce qui n'est ni transmis ni reçu à sa date est relancé.
 */

export const SENS = ["interne", "sortante", "entrante"] as const;
export type Sens = (typeof SENS)[number];

export const LIBELLE_SENS: Record<Sens, string> = { interne: "Interne", sortante: "À une entreprise", entrante: "D'une entreprise" };

export const STATUTS = ["a_transmettre", "transmise", "accusee", "attendue", "recue", "traitee", "annulee"] as const;
export type Statut = (typeof STATUTS)[number];

export const LIBELLE_STATUT: Record<Statut, string> = {
  a_transmettre: "À transmettre",
  transmise: "Transmise",
  accusee: "Réception accusée",
  attendue: "Attendue",
  recue: "Reçue",
  traitee: "Traitée",
  annulee: "Annulée",
};

export const MENTIONS = {
  attribution: "Pour attribution",
  suite: "Pour suite à donner",
  avis: "Pour avis",
  signature: "Pour signature",
  visa: "Pour visa",
  execution: "Pour exécution",
  information: "Pour information",
  classement: "Pour classement",
} as const;
export type Mention = keyof typeof MENTIONS;

/** L'avis rendu sur une pièce technique, ou sur l'ensemble du bordereau. */
export const AVIS = {
  bon_pour_execution: "Bon pour exécution",
  vise_observations: "Visé avec observations",
  refuse: "Refusé",
  vu: "Vu, sans observation",
} as const;
export type Avis = keyof typeof AVIS;

export const MOYENS = {
  main_propre: "En main propre",
  coursier: "Coursier",
  courriel: "Courriel",
  plateforme: "Plateforme d'échange",
  poste: "La Poste",
  transporteur: "Transporteur",
} as const;
export type Moyen = keyof typeof MOYENS;

export const valide = <T extends object>(table: T, v: unknown): v is keyof T => typeof v === "string" && Object.hasOwn(table, v);

/** Le statut où naît un bordereau. */
export function statutInitial(sens: Sens, dejaFait: boolean): Statut {
  if (sens === "entrante") return dejaFait ? "recue" : "attendue";
  if (sens === "sortante") return dejaFait ? "transmise" : "a_transmettre";
  return "transmise";
}

const PASSAGES: Record<Sens, Partial<Record<Statut, readonly Statut[]>>> = {
  interne: { transmise: ["accusee", "annulee"], accusee: ["traitee"] },
  sortante: { a_transmettre: ["transmise", "annulee"], transmise: ["accusee", "traitee"], accusee: ["traitee"] },
  entrante: { attendue: ["recue", "annulee"], recue: ["traitee"] },
};

export function passagePermis(sens: Sens, de: Statut, vers: Statut): boolean {
  return PASSAGES[sens][de]?.includes(vers) ?? false;
}

/** Une obligation non tenue : à transmettre ou attendue, date limite passée. */
export function enRetard(t: { statut: Statut; dateLimite: string | null }, aujourdhui: string): boolean {
  return (t.statut === "a_transmettre" || t.statut === "attendue") && t.dateLimite !== null && t.dateLimite < aujourdhui;
}

/** Bientôt dû : dans les trois jours qui viennent. */
export function bientotDu(t: { statut: Statut; dateLimite: string | null }, aujourdhui: string, jours = 3): boolean {
  if ((t.statut !== "a_transmettre" && t.statut !== "attendue") || !t.dateLimite || t.dateLimite < aujourdhui) return false;
  return (Date.parse(`${t.dateLimite}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / 86_400_000 <= jours;
}

export const RELANCE_MIN_MS = 20 * 60 * 60_000;

export function relanceDue(t: { statut: Statut; dateLimite: string | null; derniereRelanceLe: Date | null }, aujourdhui: string, maintenant: Date): boolean {
  return enRetard(t, aujourdhui) && (!t.derniereRelanceLe || maintenant.getTime() - t.derniereRelanceLe.getTime() >= RELANCE_MIN_MS);
}

export function formatNumero(annee: number): { cle: string; prefix: string; padding: number; periode: string } {
  return { cle: "transmission", prefix: `BT-${annee}-`, padding: 5, periode: String(annee) };
}

export interface Piece {
  designation: string;
  reference: string;
  /** Indice de révision d'une pièce technique : A, B, C… */
  indice: string;
  exemplaires: number;
  original: boolean;
  avis: Avis | null;
  observation: string;
}

export const PIECES_MAX = 100;

/** Nettoie les pièces saisies ; lève un message lisible sur ce qui ne se garde pas. */
export function normaliserPieces(brut: unknown): Piece[] {
  if (!Array.isArray(brut)) throw new Error("La liste des pièces est illisible.");
  const pieces: Piece[] = [];
  for (const e of brut) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const designation = typeof o.designation === "string" ? o.designation.trim() : "";
    if (!designation) continue;
    const rang = pieces.length + 1;
    if (designation.length > 200) throw new Error(`Pièce ${rang} : désignation trop longue (200 caractères au plus).`);
    const exemplaires = Number(o.exemplaires ?? 1);
    if (!Number.isInteger(exemplaires) || exemplaires < 1 || exemplaires > 999) throw new Error(`Pièce ${rang} : nombre d'exemplaires invalide.`);
    const indice = typeof o.indice === "string" ? o.indice.trim().toUpperCase().slice(0, 8) : "";
    pieces.push({
      designation,
      reference: typeof o.reference === "string" ? o.reference.trim().slice(0, 80) : "",
      indice,
      exemplaires,
      original: o.original === true,
      avis: valide(AVIS, o.avis) ? o.avis : null,
      observation: typeof o.observation === "string" ? o.observation.trim().slice(0, 500) : "",
    });
  }
  if (pieces.length === 0) throw new Error("Ajoutez au moins une pièce au bordereau.");
  if (pieces.length > PIECES_MAX) throw new Error(`Un bordereau compte au plus ${PIECES_MAX} pièces.`);
  return pieces;
}

/**
 * L'avis d'ensemble d'un retour : le plus sévère des avis rendus sur les
 * pièces — une seule pièce refusée suffit à refuser le lot.
 */
export function avisDensemble(pieces: readonly Pick<Piece, "avis">[]): Avis | null {
  const ordre: Avis[] = ["refuse", "vise_observations", "bon_pour_execution", "vu"];
  for (const a of ordre) if (pieces.some((p) => p.avis === a)) return a;
  return null;
}

export function totalExemplaires(pieces: readonly Pick<Piece, "exemplaires">[]): number {
  return pieces.reduce((s, p) => s + p.exemplaires, 0);
}
