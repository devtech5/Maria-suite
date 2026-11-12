"use client";

import { useState } from "react";

import { Fenetre } from "@/components/ui/fenetre";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Champ, Pastille } from "@/components/ui/primitives";
import { ajouterNumero, retirerNumero } from "@/modules/contacts/actions";
import { formaterNumero, LISTE_NATURES, LISTE_USAGES, NATURES_NUMERO, USAGES_NUMERO, type NumeroAffiche } from "@/modules/contacts/regles";

/**
 * Les numéros d'un collaborateur, dans une modale : voir tous (personnels
 * compris), en ajouter, en retirer. Réservé à qui tient l'annuaire — la page
 * ne le monte pas pour un simple lecteur.
 */
export function NumerosCollaborateur({ employeeId, nom, numeros }: { employeeId: string; nom: string; numeros: NumeroAffiche[] }) {
  const [ouverte, setOuverte] = useState(false);
  const [generation, setGeneration] = useState(0);
  const op = useOperation();

  return (
    <>
      <button type="button" onClick={() => setOuverte(true)} className="text-sm font-semibold text-marque-600 hover:underline">
        Numéros
      </button>
      <Fenetre ouverte={ouverte} titre="Numéros de téléphone" sousTitre={nom} onFermer={() => setOuverte(false)}>
        <div className="space-y-4 px-5 py-4">
          {numeros.length === 0 ? (
            <p className="text-sm text-[var(--encre-douce)]">Aucun numéro pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-[var(--filet)] rounded-lg border border-[var(--filet)]">
              {numeros.map((n) => (
                <li key={n.id ?? n.numero} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="chiffres whitespace-nowrap font-semibold">{formaterNumero(n.numero)}</span>
                  <Pastille>{NATURES_NUMERO[n.nature]}</Pastille>
                  <Pastille ton={n.usage === "personnel" ? "alerte" : "neutre"}>{USAGES_NUMERO[n.usage]}</Pastille>
                  {n.origine === "fiche" && <span className="text-xs text-[var(--encre-faible)]">de la fiche du collaborateur</span>}
                  {n.id && (
                    <button
                      type="button"
                      disabled={op.enCours}
                      aria-label={`Retirer ${formaterNumero(n.numero)}`}
                      onClick={() => op.lancer(() => retirerNumero(n.id!))}
                      className="ml-auto text-sm font-semibold text-danger-600 hover:underline disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            key={generation}
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              op.lancer(() => ajouterNumero(employeeId, d), () => setGeneration((g) => g + 1));
            }}
            className="space-y-3 border-t border-[var(--filet)] pt-4"
          >
            <p className="text-sm font-semibold">Ajouter un numéro</p>
            <Champ libelle="Numéro" precision="Dix chiffres pour un numéro ivoirien, ou « + » et l'indicatif.">
              <input name="numero" type="tel" required placeholder="07 07 12 34 56" className={CLASSE_CHAMP} />
            </Champ>
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ libelle="Nature">
                <select name="nature" defaultValue="mobile" className={`${CLASSE_CHAMP_COMPACT} w-full`}>
                  {LISTE_NATURES.map((c) => (
                    <option key={c} value={c}>
                      {NATURES_NUMERO[c]}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ libelle="Usage" precision="Un numéro personnel n'est lu que par ceux qui tiennent l'annuaire.">
                <select name="usage" defaultValue="professionnel" className={`${CLASSE_CHAMP_COMPACT} w-full`}>
                  {LISTE_USAGES.map((c) => (
                    <option key={c} value={c}>
                      {USAGES_NUMERO[c]}
                    </option>
                  ))}
                </select>
              </Champ>
            </div>
            <Retour resultat={op.resultat} />
            <div className="flex justify-end">
              <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
                Ajouter
              </button>
            </div>
          </form>
        </div>
      </Fenetre>
    </>
  );
}
