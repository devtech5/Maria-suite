"use client";

import { Selecteur, type OptionSelecteur } from "./selecteur";

interface Props {
  /** Nom de l'entreprise. Il n'y en a qu'une : il s'affiche, il ne se choisit pas. */
  entreprise: string | null;
  /** Exercice comptable courant. Second niveau du fil. */
  exercice: OptionSelecteur | null;
  exercices: OptionSelecteur[];
}

/**
 * Fil d'Ariane en tête d'application.
 *
 * Deux niveaux : l'entreprise, puis l'exercice comptable. Maria Suite ne sert
 * qu'une entreprise, MARIA GROUP SARL : le premier niveau rappelle le
 * contexte de travail, sans menu. L'exercice, lui, reste un sélecteur.
 */
export function FilAriane({ entreprise, exercice, exercices }: Props) {
  return (
    <nav aria-label="Contexte de travail" className="flex min-w-0 items-center gap-1">
      {entreprise && (
        <span className="truncate px-2 py-1 text-sm font-semibold">{entreprise}</span>
      )}

      {exercice && (
        <>
          <span className="text-[var(--filet)]" aria-hidden>
            /
          </span>
          <Selecteur
            valeur={exercice}
            options={exercices}
            placeholderRecherche="Chercher un exercice…"
            messageVide="Un seul exercice ouvert."
            onChoisir={() => {
              // Le changement d'exercice touchera aux écritures : il attend le
              // module comptable, pas seulement un état d'interface.
            }}
          />
        </>
      )}
    </nav>
  );
}
