import type { ReactNode } from "react";
import localFont from "next/font/local";

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
 * feuille en tiennent lieu. Un document plus long que la feuille continue sur
 * la suivante ; `pied` descend au bas de la dernière.
 *
 * Relative et isolée : le filigrane de l'en-tête s'y place, derrière le texte.
 */
export function FeuilleA4({ children, pied }: { children: ReactNode; pied?: ReactNode }) {
  return (
    <article
      id="document-imprimable"
      className={`${montserrat.className} relative isolate mx-auto flex min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white px-[17mm] pb-[10mm] pt-[13mm] text-[10pt] font-medium leading-snug text-black shadow-lg [print-color-adjust:exact] print:min-h-[296mm] print:shadow-none`}
    >
      <style>{"@page { size: A4 portrait; margin: 0; }"}</style>
      {children}
      {pied && <div className="mt-auto">{pied}</div>}
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
