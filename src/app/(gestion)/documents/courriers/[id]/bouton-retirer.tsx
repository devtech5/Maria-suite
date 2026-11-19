"use client";

import { confirmer } from "@/components/ui/dialogues";

/**
 * Retrait confirmé : le courrier quitte la liste, son numéro reste pris.
 * L'envoi attend la réponse de la fenêtre : on le retient, puis on le relance
 * avec ce même bouton, pour que le formulaire reçoive la même action.
 */
export function BoutonRetirer({ numero }: { numero: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        e.preventDefault();
        const bouton = e.currentTarget;
        void confirmer(`Retirer le courrier ${numero} ? Il quitte la liste ; son numéro n'est pas réattribué.`).then((ok) => {
          if (ok) bouton.form?.requestSubmit(bouton);
        });
      }}
      className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium text-danger-600 hover:bg-[var(--surface-creuse)]"
    >
      Retirer
    </button>
  );
}
