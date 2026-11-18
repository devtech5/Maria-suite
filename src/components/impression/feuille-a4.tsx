import type { ReactNode } from "react";
import localFont from "next/font/local";

import { Filigrane } from "./entete-document";

/**
 * Police du papier à en-tête de MARIA GROUP : Montserrat (licence SIL OFL,
 * `polices/OFL.txt`), jeu latin, graisses 500 à 700.
 *
 * Les fichiers vivent dans le dépôt et non chez Google : `next/font/google`
 * les téléchargeait pendant la construction, et un serveur de déploiement
 * qui ne joint pas fonts.gstatic.com faisait échouer tout le build. Servie
 * par l'application, aucune requête vers un tiers à l'ouverture d'une facture.
 */
const montserrat = localFont({
  src: [
    { path: "./polices/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./polices/montserrat-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "./polices/montserrat-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./polices/montserrat-latin-600-italic.woff2", weight: "600", style: "italic" },
    { path: "./polices/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./polices/montserrat-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
  display: "swap",
});

/**
 * Une feuille A4 (210 × 297 mm), telle qu'elle sort de l'imprimante.
 *
 * Elle s'affiche dans l'application, au milieu de l'écran, et s'imprime seule :
 * la coque de gestion masque menu, en-tête et bandeaux à l'impression.
 * La page est réglée en A4 portrait sans marge d'imprimante — les marges de la
 * feuille en tiennent lieu. `paysage` couche la feuille (297 × 210 mm) pour
 * les registres larges.
 *
 * Un document plus long que la feuille continue sur la suivante, et chaque
 * page imprimée porte l'en-tête et le pied :
 *
 *   · `entete` (le papier à en-tête, `PapierEnTete`) va dans le `thead` d'un
 *     tableau qui enveloppe la feuille : le navigateur le répète en haut de
 *     chaque page. Chrome ne le répète que s'il tient dans le quart de la
 *     page — d'où le titre de la pièce, qui reste dans le corps, sur la
 *     première page seulement ;
 *   · `pied` est fixé au bas de la page à l'impression, ce qui le reproduit
 *     sur chacune ; une copie invisible dans le `tfoot`, répétée elle aussi,
 *     lui réserve sa place pour que le texte ne passe pas dessous.
 *
 * Les marges haute et basse vivent dans ces deux cellules, pas sur la
 * feuille : une marge de l'article ne s'appliquerait qu'à la première et à
 * la dernière page.
 */
export function FeuilleA4({ children, entete, pied, paysage = false }: { children: ReactNode; entete?: ReactNode; pied?: ReactNode; paysage?: boolean }) {
  const format = paysage
    ? "min-h-[210mm] w-[297mm] print:min-h-[209mm] [&>table>thead_img]:max-h-[24mm]"
    : "min-h-[297mm] w-[210mm] print:min-h-[296mm]";
  return (
    <article
      id="document-imprimable"
      className={`${montserrat.className} relative isolate mx-auto flex ${format} flex-col overflow-hidden bg-white px-[17mm] pb-[10mm] pt-[13mm] text-[10pt] font-medium leading-snug text-black shadow-lg [print-color-adjust:exact] print:py-0 print:shadow-none`}
    >
      <style>{`@page { size: A4 ${paysage ? "landscape" : "portrait"}; margin: 0; }`}</style>
      {entete && <Filigrane className="print:fixed" />}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td className="p-0 print:pt-[13mm]">{entete}</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-0 align-top">{children}</td>
          </tr>
        </tbody>
        <tfoot className="hidden print:table-footer-group" aria-hidden>
          <tr>
            <td className="p-0">
              <div className="invisible pb-[10mm]">{pied}</div>
            </td>
          </tr>
        </tfoot>
      </table>
      {pied && <div className="mt-auto print:fixed print:inset-x-[17mm] print:bottom-[10mm]">{pied}</div>}
    </article>
  );
}

/** Le fond de l'aperçu : la feuille posée sur un plateau, qui défile de côté sur téléphone. */
export function ApercuA4({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-3 overflow-x-auto bg-[var(--surface-creuse)] px-3 py-5 sm:rounded-xl print:m-0 print:overflow-visible print:bg-white print:p-0">
      <div className="w-fit min-w-full">{children}</div>
    </div>
  );
}
