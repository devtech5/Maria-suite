"use client";

import { Retour, useOperation } from "@/components/ui/operations";
import { relancerLecteurs } from "@/modules/reglement/actions";

/** Relance dans la cloche ceux qui n'ont pas encore accepté la version. */
export function BoutonRelance({ versionId, enAttente, bloqueeJusqua }: { versionId: string; enAttente: number; bloqueeJusqua: string | null }) {
  const op = useOperation();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={op.enCours || enAttente === 0 || bloqueeJusqua !== null}
        onClick={() => op.lancer(() => relancerLecteurs(versionId))}
        className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
      >
        {op.enCours ? "Envoi…" : enAttente === 0 ? "Tout le monde a accepté" : `Relancer ${enAttente} personne${enAttente > 1 ? "s" : ""}`}
      </button>
      {bloqueeJusqua && !op.resultat && <p className="mt-1 text-xs text-[var(--encre-faible)]">Prochaine relance possible à {bloqueeJusqua}.</p>}
      <Retour resultat={op.resultat} />
    </div>
  );
}
