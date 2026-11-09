"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { ajouterPoste } from "@/modules/personnes/actions-postes";
import { clePoste } from "@/modules/personnes/postes";

const CLASSE_PLUS =
  "grid size-cible shrink-0 place-items-center rounded-lg border border-[var(--filet)] text-lg leading-none text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]";

/**
 * Postes d'une personne : un principal, et autant d'autres qu'elle en tient.
 *
 * Le principal part dans `poste`, les autres dans autant de `postesAutres`
 * cachés. Deux cellules de grille : le principal, puis les autres, ouverts
 * dans une liste à cocher. `ajout` montre le bouton « + » qui inscrit un
 * poste au référentiel sans quitter le formulaire.
 */
export function ChoixPostes({
  postes,
  principal: principalInitial = "",
  autres: autresInitiaux = [],
  ajout = false,
}: {
  postes: string[];
  principal?: string;
  autres?: string[];
  ajout?: boolean;
}) {
  const id = useId();
  const [options, setOptions] = useState(postes);
  const [principal, setPrincipal] = useState(principalInitial);
  const [autres, setAutres] = useState<string[]>(autresInitiaux);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!panneau.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOuvert(false);
      }
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap, true);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap, true);
    };
  }, [ouvert]);

  const autresVisibles = autres.filter((a) => clePoste(a) !== clePoste(principal));

  function basculer(poste: string) {
    setAutres((avant) => (avant.some((a) => clePoste(a) === clePoste(poste)) ? avant.filter((a) => clePoste(a) !== clePoste(poste)) : [...avant, poste]));
  }

  function inscrire(libelle: string) {
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("libelle", libelle);
      const r = await ajouterPoste(donnees);
      if (!r.ok || !r.libelle) {
        setErreur(r.message);
        return;
      }
      const ajoute = r.libelle;
      setOptions((avant) => [...avant, ajoute]);
      // Le nouveau poste devient le principal s'il n'y en a pas encore, sinon il s'ajoute aux autres.
      if (!principal) setPrincipal(ajoute);
      else setAutres((avant) => [...avant, ajoute]);
      setSaisie(null);
      setErreur(null);
    });
  }

  return (
    <>
      <div>
        <label htmlFor={`${id}-principal`} className="mb-1.5 block text-sm font-medium">
          Poste principal <span className="text-danger-600">*</span>
        </label>
        <div className="flex gap-2">
          <select id={`${id}-principal`} name="poste" required value={principal} onChange={(e) => setPrincipal(e.target.value)} className={CLASSE_CHAMP}>
            <option value="" disabled>
              Choisir un poste…
            </option>
            {options.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {ajout && (
            <button type="button" onClick={() => setSaisie("")} aria-label="Ajouter un poste à la liste" title="Ajouter un poste à la liste" className={CLASSE_PLUS}>
              +
            </button>
          )}
        </div>
        {saisie !== null && (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  // Entrée inscrit le poste sans soumettre le formulaire.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (saisie.trim().length >= 2) inscrire(saisie.trim());
                  }
                }}
                autoFocus
                maxLength={80}
                aria-label="Nouveau poste"
                placeholder="Nouveau poste"
                className={CLASSE_CHAMP}
              />
              <button
                type="button"
                onClick={() => inscrire(saisie.trim())}
                disabled={enCours || saisie.trim().length < 2}
                className="h-cible shrink-0 rounded-lg bg-marque-600 px-3 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
              >
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaisie(null);
                  setErreur(null);
                }}
                className="shrink-0 px-1 text-sm text-[var(--encre-faible)] hover:underline"
              >
                Annuler
              </button>
            </div>
            {erreur && <p className="mt-1 text-xs text-danger-600">{erreur}</p>}
          </div>
        )}
      </div>

      <div ref={panneau} className="relative">
        <span className="mb-1.5 block text-sm font-medium">Autres postes occupés</span>
        {autresVisibles.map((a) => (
          <input key={a} type="hidden" name="postesAutres" value={a} />
        ))}
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-haspopup="listbox"
          className={`${CLASSE_CHAMP} flex items-center justify-between gap-2 text-left`}
        >
          <span className={`truncate ${autresVisibles.length ? "" : "text-[var(--encre-faible)]"}`}>
            {autresVisibles.length ? autresVisibles.join(", ") : "Aucun — une personne peut en tenir plusieurs"}
          </span>
          <svg viewBox="0 0 20 20" aria-hidden className="size-4 shrink-0" fill="currentColor">
            <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
          </svg>
        </button>
        {ouvert && (
          <div role="listbox" aria-multiselectable="true" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--filet)] bg-[var(--surface)] p-1 shadow-lg">
            {options.filter((p) => clePoste(p) !== clePoste(principal)).map((p) => {
              const coche = autresVisibles.some((a) => clePoste(a) === clePoste(p));
              return (
                <label key={p} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-[var(--surface-creuse)]">
                  <input type="checkbox" checked={coche} onChange={() => basculer(p)} className="size-4 accent-[var(--color-marque-600)]" />
                  {p}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
