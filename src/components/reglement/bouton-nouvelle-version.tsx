"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Retour } from "@/components/ui/operations";
import { nouvelleVersion } from "@/modules/reglement/actions";

/** Ouvre (ou reprend) le brouillon de la prochaine version, puis y mène. */
export function BoutonNouvelleVersion({ libelle }: { libelle: string }) {
  const [enCours, demarrer] = useTransition();
  const [refus, setRefus] = useState<string | null>(null);
  const routeur = useRouter();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            setRefus(null);
            const r = await nouvelleVersion();
            if (r.ok && r.id) routeur.push(`/reglement/versions/${r.id}`);
            else setRefus(r.message);
          })
        }
        className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
      >
        {enCours ? "Ouverture…" : libelle}
      </button>
      <Retour resultat={refus ? { ok: false, message: refus } : null} />
    </div>
  );
}
