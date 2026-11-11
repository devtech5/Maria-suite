/**
 * Visiteurs : les règles, sans base ni React.
 *
 * Chaque point d'accueil — siège, chantier, site minier — tient son
 * registre ; la direction les voit tous. Une visite naît ATTENDUE (rendez-vous
 * annoncé à l'avance) ou directement PRÉSENTE (arrivée sans rendez-vous),
 * puis SORTIE ; un rendez-vous qui ne vient pas s'ANNULE.
 *
 * Données personnelles (loi n° 2013-450, ARTCI) : les photos de la pièce
 * d'identité et du visiteur s'effacent d'elles-mêmes trois mois après la
 * visite. Le registre — nom, heures, motif, personne visitée — reste.
 */

export const STATUTS_VISITE = ["attendue", "presente", "sortie", "annulee"] as const;
export type StatutVisite = (typeof STATUTS_VISITE)[number];

export const LIBELLE_STATUT: Record<StatutVisite, string> = {
  attendue: "Attendu",
  presente: "Sur place",
  sortie: "Sorti",
  annulee: "Annulé",
};

/** Mois pendant lesquels les photos se conservent après la visite. */
export const CONSERVATION_PHOTOS_MOIS = 3;

/** Pièces d'identité reçues à l'accueil, en Côte d'Ivoire. */
export const PIECES_IDENTITE = {
  cni: "Carte nationale d'identité",
  passeport: "Passeport",
  permis: "Permis de conduire",
  consulaire: "Carte consulaire",
  sejour: "Carte de résident",
  attestation: "Attestation d'identité",
  professionnelle: "Carte professionnelle",
  autre: "Autre pièce",
} as const;
export type TypePiece = keyof typeof PIECES_IDENTITE;

export function typePieceValide(valeur: unknown): valeur is TypePiece {
  return typeof valeur === "string" && Object.hasOwn(PIECES_IDENTITE, valeur);
}

/** Côtés photographiés d'une visite. */
export const COTES_PHOTO = ["recto", "verso", "visiteur"] as const;
export type CotePhoto = (typeof COTES_PHOTO)[number];

/** Une photo prise par l'appareil : JPEG ou WebP, 4 Mo au plus après compression dans le navigateur. */
export const TYPES_PHOTO = new Set(["image/jpeg", "image/webp", "image/png"]);
export const TAILLE_MAX_PHOTO = 4 * 1024 * 1024;

/**
 * Le jour où les photos d'une visite doivent avoir disparu : trois mois
 * civils après le jour de la visite (le 31 mai donne le 31 août ; le
 * 30 novembre, le 28 ou 29 février).
 */
export function effacementDes(visiteLe: Date, mois = CONSERVATION_PHOTOS_MOIS): Date {
  const d = new Date(visiteLe.getTime());
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return d;
}

/** Vrai si les photos de cette visite ont dépassé leur durée de conservation. */
export function photosEchues(visiteLe: Date, maintenant: Date): boolean {
  return effacementDes(visiteLe).getTime() <= maintenant.getTime();
}

/** Les passages permis d'un statut à l'autre. */
const PASSAGES: Record<StatutVisite, readonly StatutVisite[]> = {
  attendue: ["presente", "annulee"],
  presente: ["sortie"],
  sortie: [],
  annulee: [],
};

export function passagePermis(de: StatutVisite, vers: StatutVisite): boolean {
  return PASSAGES[de].includes(vers);
}

/** Durée sur place, en minutes entières ; jusqu'à maintenant si le visiteur n'est pas sorti. */
export function dureeMinutes(arrivee: Date, sortie: Date | null, maintenant: Date): number {
  return Math.max(0, Math.floor(((sortie ?? maintenant).getTime() - arrivee.getTime()) / 60_000));
}

/** « 45 min », « 2 h 05 ». */
export function dureeLisible(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export interface SaisieVisite {
  nom: string;
  telephone: string;
  societe: string;
  motif: string;
  typePiece: string;
  numeroPiece: string;
}

export const LONGUEURS = { nom: 120, telephone: 30, societe: 120, motif: 300, numeroPiece: 40 } as const;

/** Ce qui empêche d'enregistrer une visite, ou null. */
export function refusSaisie(s: SaisieVisite, options: { pieceExigee: boolean }): string | null {
  if (s.nom.trim().length < 2) return "Indiquez le nom du visiteur.";
  if (s.motif.trim().length < 2) return "Indiquez le motif de la visite.";
  for (const [champ, max] of Object.entries(LONGUEURS) as [keyof typeof LONGUEURS, number][]) {
    if (s[champ].trim().length > max) return `Le champ « ${champ} » dépasse ${max} caractères.`;
  }
  if (options.pieceExigee) {
    if (!typePieceValide(s.typePiece)) return "Choisissez la pièce d'identité présentée.";
    if (s.numeroPiece.trim().length < 3) return "Indiquez le numéro de la pièce d'identité.";
  } else if (s.typePiece && !typePieceValide(s.typePiece)) {
    return "Pièce d'identité inconnue.";
  }
  return null;
}

/** Numéro de visite : `V-2026-00042`, compteur remis à zéro chaque année. */
export function formatNumeroVisite(annee: number): { cle: string; prefix: string; padding: number; periode: string } {
  return { cle: "visite", prefix: `V-${annee}-`, padding: 5, periode: String(annee) };
}

/** Initiales d'un nom, pour le badge sans photo. */
export function initiales(nom: string): string {
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");
}
