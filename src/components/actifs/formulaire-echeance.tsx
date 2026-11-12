"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerEcheance, type EtatEcheance } from "@/modules/actifs/actions";
import { Fenetre } from "@/components/ui/fenetre";

export interface OptionActifEcheance {
  id: string;
  code: string;
  designation: string;
  uniteCompteur: string | null;
}

const NATURES = [
  { valeur: "assurance", libelle: "Assurance" },
  { valeur: "visite", libelle: "Visite technique" },
  { valeur: "vignette", libelle: "Vignette" },
  { valeur: "patente", libelle: "Patente de transport" },
  { valeur: "entretien", libelle: "Entretien" },
  { valeur: "garantie", libelle: "Garantie" },
] as const;

export type NatureProposee = (typeof NATURES)[number]["valeur"];

/**
 * Pose d'une échéance.
 *
 * Les deux déclencheurs sont proposés ensemble, et l'un suffit. Une vidange
 * « tous les 5 000 km ou six mois » porte légitimement les deux : c'est le
 * premier atteint qui déclenche, jamais le dernier.
 */
export function FormulaireEcheance({
  actifs,
  natures,
}: {
  actifs: OptionActifEcheance[];
  /** Natures proposées : un ordinateur n'a pas de visite technique. Toutes par défaut. */
  natures?: readonly NatureProposee[];
}) {
  const proposees = natures ? NATURES.filter((n) => natures.includes(n.valeur)) : NATURES;
  const [ouvert, setOuvert] = useState(false);
  const [actifId, setActifId] = useState(actifs[0]?.id ?? "");
  const [etat, action, enCours] = useActionState<EtatEcheance, FormData>(
    creerEcheance,
    {},
  );

  const [dernier, setDernier] = useState(etat.message);
  if (etat.message !== dernier) {
    setDernier(etat.message);
    if (etat.message) setOuvert(false);
  }

  const actif = actifs.find((a) => a.id === actifId);

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.message && (
          <span className="text-sm text-valide-600">{etat.message}</span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={actifs.length === 0}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          Nouvelle échéance
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouvelle échéance" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Champ libelle="Actif">
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

            <Champ libelle="Nature">
              <select name="nature" defaultValue="entretien" className={CLASSE_CHAMP}>
                {proposees.map((n) => (
                  <option key={n.valeur} value={n.valeur}>
                    {n.libelle}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ libelle="Date d'échéance" precision="Vide si le compteur seul déclenche.">
              <input name="echeanceLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>

            <Champ
              libelle="Seuil de compteur"
              precision={
                actif?.uniteCompteur
                  ? `En ${actif.uniteCompteur}. Vide si la date seule déclenche.`
                  : "Cet actif n'a pas de compteur."
              }
            >
              <input
                name="compteurCible"
                inputMode="numeric"
                disabled={!actif?.uniteCompteur}
                placeholder="90000"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ libelle="Libellé">
              <input name="libelle" placeholder="Vidange" className={CLASSE_CHAMP} />
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
              {enCours ? "Enregistrement…" : "Poser l'échéance"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
