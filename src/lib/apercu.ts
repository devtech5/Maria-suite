/**
 * Aperçu des pièces jointes : quel rendu pour quel fichier.
 *
 * Partagé par la route `/fichiers` (le type qu'elle annonce) et la
 * visionneuse (`src/components/ui/apercu.tsx`, le rendu qu'elle choisit).
 * Aucune dépendance : ni base, ni React, ni `server-only`.
 *
 * Liste fermée, comme les formats acceptés à l'envoi. Un fichier que le
 * navigateur interpréterait comme une page — HTML, SVG, XML — ne reçoit
 * jamais son vrai type : servi depuis notre origine, il exécuterait son
 * script avec la session de celui qui l'ouvre. Il part en
 * `application/octet-stream`, et la visionneuse propose de le télécharger.
 */

export type NatureApercu = "pdf" | "image" | "texte" | "tableur" | "docx" | "audio" | "video" | "telecharger";

interface Format {
  type: string;
  nature: NatureApercu;
}

const FORMATS: Record<string, Format> = {
  pdf: { type: "application/pdf", nature: "pdf" },
  jpg: { type: "image/jpeg", nature: "image" },
  jpeg: { type: "image/jpeg", nature: "image" },
  png: { type: "image/png", nature: "image" },
  webp: { type: "image/webp", nature: "image" },
  gif: { type: "image/gif", nature: "image" },
  // Seul Safari décode le HEIC : ailleurs, l'image échoue et la visionneuse propose le téléchargement.
  heic: { type: "image/heic", nature: "image" },
  txt: { type: "text/plain; charset=utf-8", nature: "texte" },
  log: { type: "text/plain; charset=utf-8", nature: "texte" },
  md: { type: "text/plain; charset=utf-8", nature: "texte" },
  // Lu comme du texte, jamais rendu : un XML peut porter du XHTML et son script.
  json: { type: "text/plain; charset=utf-8", nature: "texte" },
  xml: { type: "text/plain; charset=utf-8", nature: "texte" },
  csv: { type: "text/csv; charset=utf-8", nature: "tableur" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nature: "tableur" },
  xls: { type: "application/vnd.ms-excel", nature: "tableur" },
  ods: { type: "application/vnd.oasis.opendocument.spreadsheet", nature: "tableur" },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nature: "docx" },
  doc: { type: "application/msword", nature: "telecharger" },
  odt: { type: "application/vnd.oasis.opendocument.text", nature: "telecharger" },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", nature: "telecharger" },
  ppt: { type: "application/vnd.ms-powerpoint", nature: "telecharger" },
  zip: { type: "application/zip", nature: "telecharger" },
  mp3: { type: "audio/mpeg", nature: "audio" },
  m4a: { type: "audio/mp4", nature: "audio" },
  ogg: { type: "audio/ogg", nature: "audio" },
  wav: { type: "audio/wav", nature: "audio" },
  mp4: { type: "video/mp4", nature: "video" },
  mov: { type: "video/quicktime", nature: "video" },
  webm: { type: "video/webm", nature: "video" },
};

const PAR_TYPE = new Map<string, NatureApercu>(
  Object.values(FORMATS).map((f) => [f.type.split(";")[0], f.nature]),
);

/** Extension en minuscules d'un nom ou d'une adresse, sans la requête. */
export function extensionDe(nomOuUrl: string | null | undefined): string {
  if (!nomOuUrl) return "";
  const sansRequete = nomOuUrl.split(/[?#]/)[0];
  const dernier = sansRequete.split("/").pop() ?? "";
  return dernier.includes(".") ? dernier.split(".").pop()!.toLowerCase() : "";
}

/** Type annoncé par la route pour une clé du dépôt. */
export function typeServi(cle: string): string {
  return FORMATS[extensionDe(cle)]?.type ?? "application/octet-stream";
}

/**
 * Rendu à choisir. Le nom d'origine d'abord (c'est lui que la personne a
 * déposé), puis le type déclaré à l'envoi, puis l'extension de la clé.
 */
export function natureApercu(fichier: { nomFichier?: string | null; typeMime?: string | null; url?: string | null }): NatureApercu {
  const parNom = FORMATS[extensionDe(fichier.nomFichier)];
  if (parNom) return parNom.nature;
  const parType = fichier.typeMime ? PAR_TYPE.get(fichier.typeMime.split(";")[0].trim().toLowerCase()) : undefined;
  if (parType) return parType;
  return FORMATS[extensionDe(fichier.url)]?.nature ?? "telecharger";
}
