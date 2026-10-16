/**
 * Dossier du salarié : ce que chaque pièce porte, et ce qu'elle dit du dossier.
 *
 * Fichier sans dépendance : lu par le serveur (validation, alertes) et par le
 * navigateur (formulaire qui n'affiche que les champs de la nature choisie).
 *
 * Une pièce n'est pas qu'un fichier. Une CNI a un numéro et une date de fin de
 * validité ; un permis, ses catégories ; un RIB, sa banque. Ce sont ces
 * données — pas le scan — qui permettent de prévenir qu'un permis expire le
 * mois prochain, ou de retrouver le compte où verser un salaire.
 */

export const NATURES_PIECE = [
  "cni",
  "passeport",
  "cmu",
  "permis",
  "casier_judiciaire",
  "assurance",
  "extrait_naissance",
  "certificat_medical",
  "diplome",
  "rib",
  "cv",
  "lettre_motivation",
  "autre",
] as const;

export type NaturePiece = (typeof NATURES_PIECE)[number];

export interface DefinitionPiece {
  libelle: string;
  /** Libellé du numéro, s'il en a un : « N° de la carte », « IBAN ou n° de compte ». */
  numero?: string;
  /** Qui l'a délivrée : autorité, banque, assureur, établissement. */
  organisme?: string;
  /** Précision propre à la nature : catégories du permis, intitulé du diplôme. */
  precision?: string;
  delivrance: boolean;
  /** La pièce a une fin de validité, à surveiller. */
  expiration: boolean;
  /** Une pièce sans fichier n'a pas de sens : un CV est un document. */
  fichierRequis: boolean;
  /**
   * Une seule pièce en cours par salarié : la nouvelle CNI remplace l'ancienne.
   * Faux pour ce qui s'accumule — diplômes, pièces diverses.
   */
  remplacable: boolean;
  /** Groupe d'affichage. */
  groupe: "identite" | "social" | "banque" | "recrutement" | "autre";
}

export const PIECES: Record<NaturePiece, DefinitionPiece> = {
  cni: { libelle: "Carte nationale d'identité", numero: "N° de la carte", organisme: "Délivrée par", delivrance: true, expiration: true, fichierRequis: false, remplacable: true, groupe: "identite" },
  passeport: { libelle: "Passeport", numero: "N° du passeport", organisme: "Délivré par", delivrance: true, expiration: true, fichierRequis: false, remplacable: true, groupe: "identite" },
  permis: { libelle: "Permis de conduire", numero: "N° du permis", precision: "Catégories (B, C, D…)", delivrance: true, expiration: true, fichierRequis: false, remplacable: true, groupe: "identite" },
  extrait_naissance: { libelle: "Extrait d'acte de naissance", numero: "N° de l'acte", organisme: "Mairie ou sous-préfecture", delivrance: true, expiration: false, fichierRequis: false, remplacable: true, groupe: "identite" },
  casier_judiciaire: { libelle: "Casier judiciaire", organisme: "Tribunal", delivrance: true, expiration: true, fichierRequis: false, remplacable: true, groupe: "identite" },
  cmu: { libelle: "Carte CMU", numero: "N° CMU", delivrance: true, expiration: true, fichierRequis: false, remplacable: true, groupe: "social" },
  assurance: { libelle: "Assurance", numero: "N° de police", organisme: "Assureur", precision: "Garantie (santé, accident…)", delivrance: true, expiration: true, fichierRequis: false, remplacable: false, groupe: "social" },
  certificat_medical: { libelle: "Certificat médical", organisme: "Médecin ou centre", delivrance: true, expiration: true, fichierRequis: false, remplacable: true, groupe: "social" },
  rib: { libelle: "RIB", numero: "IBAN ou n° de compte", organisme: "Banque", precision: "Titulaire du compte", delivrance: false, expiration: false, fichierRequis: false, remplacable: true, groupe: "banque" },
  cv: { libelle: "CV", delivrance: false, expiration: false, fichierRequis: true, remplacable: true, groupe: "recrutement" },
  lettre_motivation: { libelle: "Lettre de motivation", delivrance: false, expiration: false, fichierRequis: true, remplacable: true, groupe: "recrutement" },
  diplome: { libelle: "Diplôme", precision: "Intitulé du diplôme", organisme: "Établissement", delivrance: true, expiration: false, fichierRequis: false, remplacable: false, groupe: "recrutement" },
  autre: { libelle: "Autre pièce", precision: "Nom de la pièce", numero: "Numéro", delivrance: true, expiration: true, fichierRequis: false, remplacable: false, groupe: "autre" },
};

export const GROUPES_PIECE: { cle: DefinitionPiece["groupe"]; libelle: string }[] = [
  { cle: "identite", libelle: "Identité" },
  { cle: "social", libelle: "Santé et assurance" },
  { cle: "banque", libelle: "Banque" },
  { cle: "recrutement", libelle: "Recrutement" },
  { cle: "autre", libelle: "Autres pièces" },
];
/** En deçà, une pièce qui expire est signalée. */
export const SEUIL_EXPIRATION_JOURS = 30;

export type EtatPiece = "valide" | "expire_bientot" | "expiree" | "remplacee" | "sans_echeance";

export interface PieceDatee {
  id: string;
  nature: NaturePiece;
  /** Date ISO `AAAA-MM-JJ`. */
  delivreeLe: string | null;
  expireLe: string | null;
  /** Horodatage d'enregistrement, pour départager deux pièces sans date. */
  creeLe: Date;
}

function jours(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/**
 * État de chaque pièce du dossier d'un salarié.
 *
 * Pour une nature remplaçable, seule la plus récente compte : la CNI expirée
 * l'an dernier, remplacée depuis, ne doit plus déclencher d'alerte. « Plus
 * récente » se lit d'abord à la délivrance, puis à l'enregistrement.
 */
export function etatsPieces(pieces: readonly PieceDatee[], aujourdhui: string): Map<string, { etat: EtatPiece; jours: number | null }> {
  const courantes = new Map<NaturePiece, PieceDatee>();
  for (const p of pieces) {
    if (!PIECES[p.nature].remplacable) continue;
    const actuelle = courantes.get(p.nature);
    if (!actuelle || plusRecente(p, actuelle)) courantes.set(p.nature, p);
  }

  const etats = new Map<string, { etat: EtatPiece; jours: number | null }>();
  for (const p of pieces) {
    const courante = courantes.get(p.nature);
    if (PIECES[p.nature].remplacable && courante && courante.id !== p.id) {
      etats.set(p.id, { etat: "remplacee", jours: null });
      continue;
    }
    if (!p.expireLe) {
      etats.set(p.id, { etat: "sans_echeance", jours: null });
      continue;
    }
    const restant = jours(aujourdhui, p.expireLe);
    etats.set(p.id, {
      etat: restant < 0 ? "expiree" : restant <= SEUIL_EXPIRATION_JOURS ? "expire_bientot" : "valide",
      jours: restant,
    });
  }
  return etats;
}

function plusRecente(a: PieceDatee, b: PieceDatee): boolean {
  const da = a.delivreeLe ?? "";
  const db = b.delivreeLe ?? "";
  if (da !== db) return da > db;
  return a.creeLe.getTime() > b.creeLe.getTime();
}

/**
 * Ce qu'un dossier de salarié doit au minimum contenir.
 *
 * Une pièce d'identité — CNI ou passeport, l'un ou l'autre —, la CMU, le RIB
 * pour verser le salaire, le CV et la photo. Le reste dépend du poste : un
 * permis pour un chauffeur, un certificat médical en restauration.
 */
export function piecesManquantes(natures: ReadonlySet<NaturePiece>, aPhoto: boolean): string[] {
  const manque: string[] = [];
  if (!natures.has("cni") && !natures.has("passeport")) manque.push("pièce d'identité (CNI ou passeport)");
  if (!natures.has("cmu")) manque.push("carte CMU");
  if (!natures.has("rib")) manque.push("RIB");
  if (!natures.has("cv")) manque.push("CV");
  if (!aPhoto) manque.push("photo");
  return manque;
}

/** Formats acceptés pour une pièce : scan ou photo, et les documents usuels d'un CV. */
export const TYPES_PIECE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** 10 Mo : la limite des actions serveur, enveloppe comprise, est à 11. */
export const TAILLE_MAX_PIECE = 10 * 1024 * 1024;

/**
 * Photo d'identité réduite dans le navigateur, gardée en base pour le badge
 * hors ligne. Mesurée en caractères de data URL : c'est ce que borne la
 * contrainte `employees_photo`.
 */
export const TAILLE_MAX_PHOTO_DATA_URL = 131_072;

/** Photo recevable : image en data URL, sous la borne de la base. */
export function photoValide(photo: string): boolean {
  return photo.length <= TAILLE_MAX_PHOTO_DATA_URL && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo);
}
