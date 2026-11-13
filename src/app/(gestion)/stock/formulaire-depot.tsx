"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerDepot, type EtatDepot } from "@/modules/stock/actions";
import { Fenetre } from "@/components/ui/fenetre";

/**
 * Ouverture d'un lieu de stockage.
 *
 * `premier` change le discours, pas le formulaire : une entreprise qui n'a
 * aucun dépôt ne choisit pas encore entre plusieurs, elle déclare l'endroit où
 * se trouve sa marchandise.
 */
export function FormulaireDepot({ premier = false }: { premier?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action, enCours] = useActionState<EtatDepot, FormData>(
    creerDepot,
    {},
  );

  const [dernierCree, setDernierCree] = useState(etat.cree);
  if (etat.cree !== dernierCree) {
    setDernierCree(etat.cree);
    if (etat.cree) setOuvert(false);
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.cree && (
          <span className="text-sm text-valide-600">
            Dépôt {etat.cree} ouvert.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          {premier ? "Ouvrir un dépôt" : "Nouveau dépôt"}
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouveau lieu de stockage" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Nom">
              <input
                name="nom"
                autoFocus
                required
                placeholder="Dépôt Yopougon"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ
              libelle="Code"
              precision="Laissé vide, il est attribué automatiquement."
            >
              <input
                name="code"
                placeholder="DEP-YOP"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            {/* Le véhicule n'est pas un décor : la vente ambulante charge le camion
                le matin, et ce stock-là ne doit pas rester attribué au dépôt. */}
            <Champ
              libelle="Nature"
              precision="Le véhicule porte le stock d'une tournée."
            >
              <select name="type" defaultValue="depot" className={CLASSE_CHAMP}>
                <option value="depot">Dépôt</option>
                <option value="magasin">Magasin</option>
                <option value="vehicule">Véhicule</option>
              </select>
            </Champ>

            <Champ libelle="Ville">
              <input name="ville" placeholder="Abidjan" className={CLASSE_CHAMP} />
            </Champ>

            <Champ libelle="Adresse">
              <input
                name="adresse"
                placeholder="Rue des Jardins, Yopougon"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ
              libelle="Dépôt par défaut"
              precision="Un seul par entreprise : celui que propose la saisie."
            >
              <label className="flex h-cible items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="parDefaut"
                  defaultChecked={premier}
                  className="size-4 rounded border-[var(--filet)]"
                />
                Proposer ce lieu en premier
              </label>
            </Champ>
          </div>

          {etat.erreur && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
            >
              {etat.erreur}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={enCours}
              className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Ouvrir le dépôt"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
