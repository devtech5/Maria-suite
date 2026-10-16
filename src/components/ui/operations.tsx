"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Fenetre, type Presentation } from "./fenetre";

/**
 * Briques communes aux écrans qui appellent une action serveur : retour
 * annoncé, formulaire en fenêtre, opération en cours.
 */

/** Ce que rend toute action serveur des modules : un succès ou un refus lisible. */
export type Resultat = { ok: boolean; message: string };

/** Message de retour d'une opération, lisible et annoncé. */
export function Retour({ resultat }: { resultat: Resultat | null }) {
  if (!resultat) return null;
  return (
    <p
      role={resultat.ok ? "status" : "alert"}
      className={`mt-2 rounded-lg px-3 py-2 text-sm font-medium ${
        resultat.ok ? "bg-valide-50 text-valide-600" : "bg-danger-50 text-danger-600"
      }`}
    >
      {resultat.message}
    </p>
  );
}

/**
 * Formulaire ouvert par un bouton, dans une fenêtre : modale pour un
 * formulaire court, tiroir à droite pour un long. Branché sur une action
 * serveur à FormData.
 *
 * Se ferme et se vide sur un succès ; garde la saisie sur un refus. Fermer
 * (Échap, ×) garde aussi la saisie ; « Annuler » la vide, après confirmation
 * si elle avait commencé.
 */
export function FormulaireRepliable({
  libelle,
  titre,
  action,
  children,
  desactive,
  presentation = "modale",
}: {
  libelle: string;
  titre: string;
  action: (donnees: FormData) => Promise<Resultat>;
  children: ReactNode;
  desactive?: boolean;
  presentation?: Presentation;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  // Changer la clé remonte le formulaire : champs ET état des composants enfants (lignes ajoutées…) repartent à zéro.
  const [generation, setGeneration] = useState(0);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const vider = () => {
    setGeneration((g) => g + 1);
    setModifie(false);
  };

  const abandonner = () => {
    if (modifie && !window.confirm("Abandonner la saisie en cours ?")) return;
    vider();
    setResultat(null);
    setOuvert(false);
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={desactive}
        onClick={() => {
          setOuvert(true);
          if (resultat?.ok) setResultat(null);
        }}
        className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
      >
        {libelle}
      </button>
      {!ouvert && resultat?.ok && <Retour resultat={resultat} />}

      <Fenetre ouverte={ouvert} titre={titre} presentation={presentation} retenir={modifie} onFermer={() => setOuvert(false)}>
        <form
          key={generation}
          onInput={() => setModifie(true)}
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            demarrer(async () => {
              const r = await action(donnees);
              setResultat(r);
              if (r.ok) {
                vider();
                setOuvert(false);
                routeur.refresh();
              }
            });
          }}
          className="flex flex-1 flex-col"
        >
          <div className="flex-1 px-5 py-4">
            {children}
            {resultat && !resultat.ok && <Retour resultat={resultat} />}
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--filet)] bg-[var(--surface)] px-5 py-3">
            <button
              type="button"
              onClick={abandonner}
              className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={enCours}
              className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </Fenetre>
    </div>
  );
}

export function useOperation() {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  return {
    resultat,
    enCours,
    lancer<R extends Resultat>(op: () => Promise<R>, apres?: (r: R) => void) {
      setResultat(null);
      demarrer(async () => {
        const r = await op();
        setResultat(r);
        if (r.ok) {
          apres?.(r);
          routeur.refresh();
        }
      });
    },
  };
}
