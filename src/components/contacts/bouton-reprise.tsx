"use client";

import { Retour, useOperation } from "@/components/ui/operations";
import { reprendreFiches } from "@/modules/contacts/actions";

/** Inscrit à l'annuaire les adresses professionnelles déjà saisies sur les dossiers du personnel. */
export function BoutonReprise() {
  const op = useOperation();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={op.enCours}
        onClick={() => op.lancer(reprendreFiches)}
        className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
      >
        Reprendre les fiches
      </button>
      <Retour resultat={op.resultat} />
    </div>
  );
}
