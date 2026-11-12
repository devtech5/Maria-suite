"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmtEntier } from "@/lib/format";
import {
  enregistrerIntervention,
  type EtatIntervention,
} from "@/modules/actifs/actions";
import { Fenetre } from "@/components/ui/fenetre";

export interface OptionActif {
  id: string;
  code: string;
  designation: string;
  uniteCompteur: string | null;
  compteur: number | null;
  /** Client propriétaire. Renseigné : l'intervention se facture. */
  proprietaire: string | null;
}

const NATURES = [
  {
    valeur: "correctif",
    libelle: "Correctif",
    precision: "Une panne subie. Sa fréquence dit si le parc est tenu ou non.",
  },
  {
    valeur: "preventif",
    libelle: "Préventif",
    precision: "Prévu : vidange, révision, remplacement d'usure.",
  },
  {
    valeur: "controle",
    libelle: "Contrôle",
    precision: "Imposé par un tiers : visite technique, contrôle réglementaire.",
  },
] as const;

type Nature = (typeof NATURES)[number]["valeur"];

/**
 * Saisie d'une intervention.
 *
 * Le relevé de compteur se saisit ICI, avec l'intervention, et non dans un
 * second écran. Une vidange enregistrée sans son kilométrage laisse l'échéance
 * suivante se calculer sur un relevé de trois mois — et personne ne revient
 * saisir un compteur après coup.
 */
export function FormulaireIntervention({ actifs }: { actifs: OptionActif[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [nature, setNature] = useState<Nature>("correctif");
  const [actifId, setActifId] = useState(actifs[0]?.id ?? "");
  const [etat, action, enCours] = useActionState<EtatIntervention, FormData>(
    enregistrerIntervention,
    {},
  );

  const [dernier, setDernier] = useState(etat.numero);
  if (etat.numero !== dernier) {
    setDernier(etat.numero);
    if (etat.numero) setOuvert(false);
  }

  const definition = NATURES.find((n) => n.valeur === nature) ?? NATURES[0];
  const actif = actifs.find((a) => a.id === actifId);

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.numero && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.numero}</span>
            {etat.message ? ` · ${etat.message}` : " enregistrée."}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={actifs.length === 0}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          Nouvelle intervention
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouvelle intervention" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ
              libelle="Actif"
              precision={
                actif?.proprietaire
                  ? `Appartient à ${actif.proprietaire} : l'intervention se facture.`
                  : "Actif de l'entreprise : le coût est une charge d'entretien."
              }
            >
              <select
                name="actifId"
                value={actifId}
                onChange={(e) => setActifId(e.target.value)}
                className={CLASSE_CHAMP}
              >
                {actifs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.designation}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ libelle="Nature" precision={definition.precision}>
              <select
                name="nature"
                value={nature}
                onChange={(e) => setNature(e.target.value as Nature)}
                className={CLASSE_CHAMP}
              >
                {NATURES.map((n) => (
                  <option key={n.valeur} value={n.valeur}>
                    {n.libelle}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ libelle="Travaux réalisés">
              <input
                name="libelle"
                required
                placeholder="Vidange et filtres"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ
              libelle="Prestataire"
              precision="Atelier interne, ou le garage extérieur."
            >
              <input
                name="prestataire"
                placeholder="Garage Adjamé Auto"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ libelle="Coût" precision="En francs entiers.">
              <input
                name="cout"
                inputMode="numeric"
                required
                defaultValue="0"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ libelle="Date">
              <input name="effectueeLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>

            {actif?.uniteCompteur && (
              <Champ
                libelle={`Compteur (${actif.uniteCompteur})`}
                precision={
                  actif.compteur === null
                    ? "Aucun relevé connu à ce jour."
                    : `Dernier relevé : ${fmtEntier(actif.compteur)} ${actif.uniteCompteur}.`
                }
              >
                <input
                  key={actif.id}
                  name="compteur"
                  inputMode="numeric"
                  defaultValue={actif.compteur === null ? "" : String(actif.compteur)}
                  className={`${CLASSE_CHAMP} chiffres`}
                />
              </Champ>
            )}
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
              {enCours ? "Enregistrement…" : "Enregistrer l'intervention"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
