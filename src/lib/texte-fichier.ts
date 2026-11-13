import JSZip from "jszip";

/**
 * Le texte d'un fichier déposé, lu côté serveur, sans service tiers : le
 * fichier ne quitte pas la plateforme.
 *
 * Word (.docx) : un .docx est une archive dont `word/document.xml` porte le
 * texte ; chaque paragraphe devient une ligne. Texte brut (.txt, .md) : lu
 * tel quel, en UTF-8. Le PDF n'est pas lu : son texte n'est pas fiable sans
 * moteur dédié, et un découpage faux est pire que pas de découpage.
 */

export const TAILLE_MAX = 5 * 1024 * 1024;
/** Un document.xml décompressé de plus de 20 Mo n'est pas un règlement : c'est une archive piégée. */
const XML_MAX = 20 * 1024 * 1024;

export type FormatTexte = "docx" | "texte";

export function formatDe(nom: string, typeMime: string): FormatTexte | "pdf" | null {
  const extension = nom.includes(".") ? nom.split(".").pop()!.toLowerCase() : "";
  if (extension === "docx" || typeMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (extension === "txt" || extension === "md" || typeMime === "text/plain") return "texte";
  if (extension === "pdf" || typeMime === "application/pdf") return "pdf";
  return null;
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decoder(xml: string): string {
  return xml.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITES[code.toLowerCase()] ?? tout;
  });
}

/** Le texte d'un document.xml de Word : un paragraphe par ligne, les tabulations gardées. */
export function texteDeDocumentXml(xml: string): string {
  return decoder(
    xml
      .replace(/<w:tab\s*\/>/g, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:p\b[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

export async function lireTexte(contenu: ArrayBuffer, format: FormatTexte): Promise<string> {
  if (format === "texte") return new TextDecoder("utf-8").decode(contenu);
  const archive = await JSZip.loadAsync(contenu);
  const document = archive.file("word/document.xml");
  if (!document) throw new Error("Ce fichier n'est pas un document Word lisible.");
  const octets = await document.async("uint8array");
  if (octets.byteLength > XML_MAX) throw new Error("Ce document est trop volumineux pour être lu.");
  return texteDeDocumentXml(new TextDecoder("utf-8").decode(octets));
}
