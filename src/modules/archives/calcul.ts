/**
 * Règles de l'archivage, sans base ni React : ce qui se teste. Importable
 * depuis le navigateur — l'empreinte, qui demande `node:crypto`, vit à part.
 *
 * Une archive n'est pas un document de travail. Elle se dépose, elle se
 * relit, elle ne se modifie jamais. Sa valeur tient à deux garanties :
 *
 *   · l'intégrité — l'empreinte SHA-256 prise au dépôt permet de prouver, des
 *     années plus tard, que le fichier relu est bien celui qui a été déposé ;
 *   · la traçabilité — tout dépôt, toute ouverture, tout retrait laisse une
 *     ligne au journal, consultable par l'administrateur légal.
 */

/**
 * Délai pendant lequel l'auteur peut retirer une archive de son espace.
 *
 * Il couvre l'erreur de manipulation : mauvais fichier, doublon. Passé ce
 * délai, l'archive est scellée. Même retirée, elle reste conservée et visible
 * de l'administrateur légal : un retrait masque, il n'efface pas.
 */
export const DELAI_RETRAIT_HEURES = 24;

/** Espace d'archivage par personne. Au-delà, le dépôt refuse en le disant. */
export const QUOTA_OCTETS = 500 * 1024 * 1024;

/**
 * Plafond d'un envoi. Une action serveur accepte 11 Mo en tout : au-delà, la
 * requête n'arrive pas, et l'utilisateur n'aurait aucun message.
 */
export const ENVOI_MAX_OCTETS = 10 * 1024 * 1024;
export const FICHIERS_MAX_PAR_ENVOI = 10;

/**
 * Formats acceptés. Liste fermée : accepter tout sauf quelques extensions
 * laisse toujours passer ce qu'on n'a pas prévu — un exécutable renommé.
 */
export const TYPES_ARCHIVABLES: Record<string, Famille> = {
  "application/pdf": "pdf",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/gif": "image",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "texte",
  "application/msword": "texte",
  "application/vnd.oasis.opendocument.text": "texte",
  "text/plain": "texte",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "tableur",
  "application/vnd.ms-excel": "tableur",
  "application/vnd.oasis.opendocument.spreadsheet": "tableur",
  "text/csv": "tableur",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation",
  "application/vnd.ms-powerpoint": "presentation",
  "application/json": "donnees",
  "application/xml": "donnees",
  "text/xml": "donnees",
  "application/zip": "compresse",
  "application/x-zip-compressed": "compresse",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
  "video/mp4": "video",
  "video/quicktime": "video",
};

export type Famille =
  | "pdf"
  | "image"
  | "texte"
  | "tableur"
  | "presentation"
  | "donnees"
  | "compresse"
  | "audio"
  | "video"
  | "autre";

export const LIBELLE_FAMILLE: Record<Famille, string> = {
  pdf: "PDF",
  image: "Image",
  texte: "Texte",
  tableur: "Tableur",
  presentation: "Présentation",
  donnees: "Données",
  compresse: "Archive ZIP",
  audio: "Audio",
  video: "Vidéo",
  autre: "Fichier",
};

/** Le format en clair, tel qu'on le nomme au bureau : « Word », « Image PNG ». */
const FORMATS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "Image JPEG",
  "image/png": "Image PNG",
  "image/webp": "Image WebP",
  "image/heic": "Photo HEIC",
  "image/gif": "Image GIF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/msword": "Word 97-2003",
  "application/vnd.oasis.opendocument.text": "Texte OpenDocument",
  "text/plain": "Texte brut",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-excel": "Excel 97-2003",
  "application/vnd.oasis.opendocument.spreadsheet": "Classeur OpenDocument",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "application/vnd.ms-powerpoint": "PowerPoint 97-2003",
  "application/json": "JSON",
  "application/xml": "XML",
  "text/xml": "XML",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
  "audio/mpeg": "Audio MP3",
  "audio/mp4": "Audio M4A",
  "audio/x-m4a": "Audio M4A",
  "audio/ogg": "Audio OGG",
  "audio/wav": "Audio WAV",
  "video/mp4": "Vidéo MP4",
  "video/quicktime": "Vidéo MOV",
};

export function libelleFormat(typeMime: string): string {
  return FORMATS[typeMime] ?? LIBELLE_FAMILLE[familleDe(typeMime)];
}

/** Extension affichée sur l'icône : celle du nom, sinon celle du format. */
export function extensionDe(nomFichier: string): string {
  const point = nomFichier.lastIndexOf(".");
  if (point <= 0 || point === nomFichier.length - 1) return "";
  return nomFichier.slice(point + 1, point + 6).toUpperCase();
}

/** Extensions proposées au sélecteur de fichiers, dans l'ordre du navigateur. */
export const ACCEPT_ARCHIVES = [
  ".pdf",
  "image/*",
  ".doc,.docx,.odt,.txt",
  ".xls,.xlsx,.ods,.csv",
  ".ppt,.pptx",
  ".json,.xml,.zip",
  "audio/*",
  ".mp4,.mov",
].join(",");

export function familleDe(typeMime: string): Famille {
  return TYPES_ARCHIVABLES[typeMime] ?? "autre";
}

export function typeArchivable(typeMime: string): boolean {
  return typeMime in TYPES_ARCHIVABLES;
}

/** Le retrait est-il encore ouvert à l'auteur ? */
export function retraitPossible(deposeLe: Date, maintenant: Date = new Date()): boolean {
  return maintenant.getTime() - deposeLe.getTime() < DELAI_RETRAIT_HEURES * 3600 * 1000;
}

/** Heures restantes avant scellement, arrondies au-dessus ; 0 une fois scellée. */
export function heuresAvantScellement(deposeLe: Date, maintenant: Date = new Date()): number {
  const restant = DELAI_RETRAIT_HEURES * 3600 * 1000 - (maintenant.getTime() - deposeLe.getTime());
  return restant > 0 ? Math.ceil(restant / 3600 / 1000) : 0;
}

/**
 * Contrôle d'un envoi, AVANT le premier dépôt : un lot refusé à mi-chemin
 * laisserait des archives partielles.
 *
 * Rend le motif du refus, ou `null` si l'envoi passe.
 */
export function refusEnvoi(
  fichiers: readonly { nom: string; typeMime: string; taille: number }[],
  dejaUtilise: number,
): string | null {
  if (fichiers.length === 0) return "Choisissez au moins un fichier.";
  if (fichiers.length > FICHIERS_MAX_PAR_ENVOI) return `${FICHIERS_MAX_PAR_ENVOI} fichiers au plus par envoi.`;

  const total = fichiers.reduce((s, f) => s + f.taille, 0);
  if (total > ENVOI_MAX_OCTETS) {
    return `Envoi trop lourd : ${tailleLisible(total)} pour 10 Mo au plus. Envoyez en plusieurs fois.`;
  }
  if (dejaUtilise + total > QUOTA_OCTETS) {
    return `Espace insuffisant : il reste ${tailleLisible(Math.max(0, QUOTA_OCTETS - dejaUtilise))} sur ${tailleLisible(QUOTA_OCTETS)}.`;
  }
  for (const f of fichiers) {
    if (f.taille <= 0) return `« ${f.nom} » est vide.`;
    if (!typeArchivable(f.typeMime)) {
      return `« ${f.nom} » : format non accepté (${f.typeMime || "inconnu"}).`;
    }
  }
  return null;
}

/** Taille lisible : Ko en dessous du mégaoctet, Mo avec une décimale au-dessus. */
export function tailleLisible(octets: number): string {
  const decimal = (n: number) => n.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (octets >= 1024 * 1024 * 1024) return `${decimal(octets / 1024 / 1024 / 1024)} Go`;
  if (octets >= 1024 * 1024) return `${decimal(octets / 1024 / 1024)} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/** Part du quota consommée, en pour cent entier, plafonnée à 100. */
export function partQuota(utilise: number): number {
  return Math.min(100, Math.round((utilise * 100) / QUOTA_OCTETS));
}

// ------------------------------------------------------------ dossiers partagés

export interface RegleDossier {
  visibilite: "tous" | "selection";
  depotOuvert: boolean;
  /** Membres désignés, pour la visibilité « sélection ». */
  designes: readonly string[];
}

/**
 * Le dossier est-il visible de cette personne ?
 *
 * Celui qui gère les dossiers les voit tous : il ne peut pas administrer ce
 * qu'il ne voit pas. Pour les autres, « tous » ouvre à chacun, « sélection »
 * aux seuls désignés — personne de désigné, le dossier est masqué.
 */
export function dossierVisible(regle: RegleDossier, userId: string, gestionnaire: boolean): boolean {
  if (gestionnaire) return true;
  return regle.visibilite === "tous" || regle.designes.includes(userId);
}

/** Peut-elle y déposer ? Il faut le voir, et que le dépôt y soit ouvert. */
export function depotDossierPermis(regle: RegleDossier, userId: string, gestionnaire: boolean): boolean {
  if (gestionnaire) return true;
  return regle.depotOuvert && dossierVisible(regle, userId, false);
}

/** Résumé de la visibilité, tel que l'écran l'affiche. */
export function resumeVisibilite(regle: Pick<RegleDossier, "visibilite" | "designes">): string {
  if (regle.visibilite === "tous") return "Visible de tous les membres";
  const n = regle.designes.length;
  if (n === 0) return "Masqué — visible des seuls administrateurs";
  return `Visible de ${n} membre${n > 1 ? "s" : ""}`;
}

/** La même règle en deux mots, pour une vignette de dossier. */
export function resumeVisibiliteCourt(regle: Pick<RegleDossier, "visibilite" | "designes">): string {
  if (regle.visibilite === "tous") return "Tous";
  const n = regle.designes.length;
  return n === 0 ? "Masqué" : `${n} membre${n > 1 ? "s" : ""}`;
}
