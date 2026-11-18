"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

/** Le temps laissé à `window.close()` avant de conclure que l'onglet ne se fermera pas. */
const DELAI_FERMETURE_MS = 150;

/**
 * Retour depuis l'aperçu avant impression.
 *
 * L'aperçu s'ouvre le plus souvent dans un nouvel onglet : il n'a alors pas
 * d'historique, et revenir veut dire fermer l'onglet pour retrouver l'écran
 * d'où l'on vient. Si le navigateur refuse de le fermer, ou si l'aperçu a été
 * ouvert dans le même onglet, on revient en arrière, sinon vers `href`.
 *
 * Masqué à l'impression, comme le bouton Imprimer.
 */
export function BoutonRetour({ href, children = "Retour" }: { href: string; children?: ReactNode }) {
  const routeur = useRouter();

  function revenir(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (window.history.length > 1) {
      routeur.back();
      return;
    }
    window.close();
    window.setTimeout(() => routeur.push(href), DELAI_FERMETURE_MS);
  }

  return (
    <a
      href={href}
      onClick={revenir}
      className="h-cible inline-flex items-center gap-1.5 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--encre)] hover:bg-[var(--surface-creuse)] print:hidden"
    >
      <span aria-hidden>←</span>
      {children}
    </a>
  );
}
