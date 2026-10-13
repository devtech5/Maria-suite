"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Relit la page à intervalle régulier : un nouveau bon en cuisine, une table
 * qui se libère.
 *
 * Rien quand l'onglet est caché ou l'écran verrouillé — même règle que la
 * cloche. Relire une page sous le voile renverrait vers l'écran de
 * verrouillage et ferait perdre la saisie conservée dessous.
 */
export function Rafraichissement({ secondes }: { secondes: number }) {
  const routeur = useRouter();

  useEffect(() => {
    function verrouille(): boolean {
      try {
        return localStorage.getItem("maria-verrou") === "1";
      } catch {
        return false;
      }
    }
    const minuterie = window.setInterval(() => {
      if (document.visibilityState !== "visible" || verrouille() || !navigator.onLine) return;
      routeur.refresh();
    }, secondes * 1000);
    return () => window.clearInterval(minuterie);
  }, [routeur, secondes]);

  return null;
}
