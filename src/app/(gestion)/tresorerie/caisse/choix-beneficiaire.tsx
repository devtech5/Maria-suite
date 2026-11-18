"use client";

import { useState } from "react";

import { CLASSE_CHAMP } from "@/components/ui/primitives";
import type { FicheProposee } from "@/modules/tresorerie/requetes";

import { libelleChamp } from "../champs";

/**
 * Bénéficiaire choisi dans les fiches existantes — fournisseurs, Personnel,
 * intervenants —, le nom ne se retape pas. Le champ libre n'apparaît que pour
 * qui n'a pas de fiche : le taxi, la station de passage.
 */
export function ChoixBeneficiaire({
  libelle,
  groupes,
  exemple,
  libelleNom = "Nom du bénéficiaire",
  initiale,
}: {
  libelle: string;
  groupes: { libelle: string; fiches: FicheProposee[] }[];
  exemple: string;
  /** Intitulé du champ libre, quand le bénéficiaire n'a pas de fiche. */
  libelleNom?: string;
  /** Le bénéficiaire déjà retenu, quand on modifie : sa fiche, sinon le nom saisi. */
  initiale?: { ref: string | null; nom: string | null };
}) {
  const remplis = groupes.filter((g) => g.fiches.length > 0);
  // Une fiche retirée depuis ne figure plus dans la liste : on retombe sur le nom.
  const connue = initiale?.ref && remplis.some((g) => g.fiches.some((f) => f.valeur === initiale.ref)) ? initiale.ref : "";
  const [valeur, setValeur] = useState(connue);

  return (
    <>
      <label className="block">
        <span className={libelleChamp}>{libelle}</span>
        <select name="beneficiaireRef" value={valeur} onChange={(e) => setValeur(e.target.value)} className={CLASSE_CHAMP}>
          <option value="">Sans fiche : saisir nom et prénom</option>
          {remplis.map((g) => (
            <optgroup key={g.libelle} label={g.libelle}>
              {g.fiches.map((f) => (
                <option key={f.valeur} value={f.valeur}>
                  {f.nom} — {f.qualite}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {valeur === "" && (
        <label className="block">
          <span className={libelleChamp}>{libelleNom}</span>
          <input name="beneficiaire" required minLength={2} maxLength={120} defaultValue={initiale?.nom ?? undefined} placeholder={exemple} className={CLASSE_CHAMP} />
        </label>
      )}
    </>
  );
}
