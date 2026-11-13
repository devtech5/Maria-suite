"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Toujours une modale centrée, sa hauteur suit son contenu. « modale » pour
 * un formulaire court, « ample » pour un long (lignes, fiche complète) : seule
 * la largeur change. Une seule forme de fenêtre dans toute l'application,
 * à une exception demandée : le panneau d'une tâche, ouvert à droite du
 * tableau des tâches (`src/app/(gestion)/taches/panneau-tache.tsx`).
 */
export type Presentation = "modale" | "ample";

const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const rien = () => () => {};

/**
 * Fenêtre posée au-dessus de l'écran : modale centrée, plein écran sur un
 * téléphone.
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
  sousTitre,
  presentation = "modale",
  large = false,
  retenir = false,
  onFermer,
  children,
}: {
  ouverte: boolean;
  titre: string;
  /** Une phrase sous le titre : ce que la fenêtre attribue ou exige. */
  sousTitre?: string;
  presentation?: Presentation;
  /** Modale élargie, pour un formulaire long rangé en plusieurs colonnes. */
  large?: boolean;
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

  return createPortal(
    <div
      hidden={!ouverte}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-nuit-profond/55 sm:items-center sm:p-4 print:hidden"
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
        className={`flex h-dvh w-full flex-col overflow-y-auto bg-[var(--surface)] text-left shadow-2xl outline-none sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl ${
          large ? "sm:max-w-6xl" : presentation === "ample" ? "sm:max-w-4xl" : "sm:max-w-3xl"
        }`}
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-[var(--filet)] bg-[var(--surface)] px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={idTitre} className="text-base font-semibold">
              {titre}
            </h2>
            {sousTitre && <p className="mt-0.5 text-xs text-[var(--encre-faible)]">{sousTitre}</p>}
          </div>
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
