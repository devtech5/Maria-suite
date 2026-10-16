"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Modale centrée pour un formulaire court ; tiroir à droite pour un long (lignes, fiche complète). */
export type Presentation = "modale" | "tiroir";

const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const rien = () => () => {};

/**
 * Fenêtre posée au-dessus de l'écran : modale centrée ou tiroir à droite,
 * plein écran sur un téléphone.
 *
 * Pas de `<dialog>` natif : `showModal()` place la fenêtre dans la couche
 * supérieure du navigateur, au-dessus de tout z-index — donc au-dessus du
 * voile du verrou d'inactivité, qui laisserait la saisie lisible. Une couche
 * `fixed` sous le voile (z-60 contre z-1000) garde l'ordre voulu.
 *
 * Fermer ne démonte rien : le contenu reste monté, caché, et la saisie
 * revient intacte à la réouverture. Un clic à côté ne ferme pas une saisie
 * entamée (`retenir`) ; Échap et le bouton de fermeture, si.
 */
export function Fenetre({
  ouverte,
  titre,
  presentation = "modale",
  retenir = false,
  onFermer,
  children,
}: {
  ouverte: boolean;
  titre: string;
  presentation?: Presentation;
  /** Vrai quand la saisie a commencé : le clic sur le fond ne ferme plus. */
  retenir?: boolean;
  onFermer: () => void;
  children: ReactNode;
}) {
  const monte = useSyncExternalStore(rien, () => true, () => false);
  const panneau = useRef<HTMLDivElement>(null);
  const idTitre = useId();

  useEffect(() => {
    if (!ouverte) return;
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const premier = panneau.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    (premier ?? panneau.current)?.focus();
    const defilement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = defilement;
      avant?.focus();
    };
  }, [ouverte]);

  if (!monte) return null;

  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onFermer();
      return;
    }
    if (e.key !== "Tab" || !panneau.current) return;
    const elements = [...panneau.current.querySelectorAll<HTMLElement>(FOCALISABLES)];
    if (elements.length === 0) return;
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  const tiroir = presentation === "tiroir";

  return createPortal(
    <div
      hidden={!ouverte}
      className={`fixed inset-0 z-[60] flex bg-nuit-profond/55 sm:p-4 print:hidden ${
        tiroir ? "justify-end sm:p-0" : "items-end justify-center sm:items-center"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !retenir) onFermer();
      }}
    >
      <div
        ref={panneau}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
        onKeyDown={auClavier}
        className={`flex h-dvh w-full flex-col overflow-y-auto bg-[var(--surface)] text-left shadow-2xl outline-none ${
          tiroir ? "sm:max-w-4xl sm:border-l sm:border-[var(--filet)]" : "sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-2xl"
        }`}
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-[var(--filet)] bg-[var(--surface)] px-5 py-3.5">
          <h2 id={idTitre} className="text-base font-semibold">
            {titre}
          </h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            title="Fermer (Échap) — la saisie est conservée"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
