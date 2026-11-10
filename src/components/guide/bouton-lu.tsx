"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { marquerLu } from "@/modules/guide/actions";

/** Marque le chapitre lu, puis passe au suivant — ou au quiz, au bout du parcours. */
export function BoutonLu({ chapitre, deja, suite }: { chapitre: string; deja: boolean; suite: string }) {
  const [enCours, demarrer] = useTransition();
  const [refus, setRefus] = useState<string | null>(null);
  const routeur = useRouter();
  const continuer = suite === "/guide/quiz" ? "passer au quiz" : "continuer";
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            setRefus(null);
            const r = deja ? { ok: true as const } : await marquerLu(chapitre);
            if (r.ok) routeur.push(suite);
            else setRefus(r.message);
          })
        }
        className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
      >
        {enCours ? "Un instant…" : deja ? `Lu · ${continuer}` : `Marquer comme lu et ${continuer}`}
      </button>
      {refus && <p role="alert" className="text-sm text-danger-600">{refus}</p>}
    </div>
  );
}
