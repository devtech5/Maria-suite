"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { accepterReglement } from "@/modules/reglement/actions";

/**
 * « J'ai lu et j'accepte » : la case ne se coche qu'une fois le texte
 * parcouru jusqu'au bout — un repère posé sous le dernier article, guetté
 * par un IntersectionObserver. Puis l'acceptation part, horodatée côté
 * serveur, et l'écran suivant s'ouvre.
 */
export function Acceptation({ versionId, numero, suite }: { versionId: string; numero: number; suite: string }) {
  const repere = useRef<HTMLDivElement>(null);
  const [parcouru, setParcouru] = useState(false);
  const [coche, setCoche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  useEffect(() => {
    const cible = repere.current;
    if (!cible) return;
    const observateur = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) {
        setParcouru(true);
        observateur.disconnect();
      }
    });
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, []);

  const accepter = () => {
    setErreur(null);
    demarrer(async () => {
      const r = await accepterReglement(versionId);
      if (!r.ok) {
        setErreur(r.message);
        return;
      }
      routeur.replace(suite);
      routeur.refresh();
    });
  };

  return (
    <>
      <div ref={repere} aria-hidden className="h-px" />
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-[var(--filet)] bg-[var(--surface)]/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8 print:hidden">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className={`flex items-start gap-3 text-sm ${parcouru ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              checked={coche}
              disabled={!parcouru || enCours}
              onChange={(e) => setCoche(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-marque-600"
            />
            <span>
              <span className="font-semibold">J&apos;ai lu et j&apos;accepte le règlement intérieur</span> (version {numero}).
              {!parcouru && <span className="block text-xs text-[var(--encre-faible)]">Faites défiler jusqu&apos;au dernier article pour pouvoir cocher.</span>}
            </span>
          </label>
          <button
            type="button"
            onClick={accepter}
            disabled={!coche || enCours}
            className="h-cible shrink-0 rounded-lg bg-marque-600 px-5 text-sm font-semibold text-white hover:bg-marque-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Accepter et continuer"}
          </button>
        </div>
        {erreur && (
          <p role="alert" className="mx-auto mt-2 max-w-5xl rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-600">
            {erreur}
          </p>
        )}
      </div>
    </>
  );
}
