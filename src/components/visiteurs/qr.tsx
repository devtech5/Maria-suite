import { qrEnSvg } from "@/lib/qr";

/**
 * Un QR code, dessiné côté serveur par notre encodeur (`src/lib/qr.ts`). Le
 * SVG est produit à partir de notre seule matrice : aucun texte reçu n'y est
 * recopié tel quel.
 */
export function Qr({ texte, className, titre }: { texte: string; className?: string; titre: string }) {
  return <div role="img" aria-label={titre} className={className} dangerouslySetInnerHTML={{ __html: qrEnSvg(texte) }} />;
}
