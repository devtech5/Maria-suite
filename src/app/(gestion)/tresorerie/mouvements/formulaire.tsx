"use client";

import { useState } from "react";

import { FormulaireRepliable } from "@/components/ui/operations";
import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { enregistrerMouvement } from "@/modules/tresorerie/actions-mouvements";
import { NATURES_MOUVEMENT, tiersRequis, type NatureMouvement } from "@/modules/tresorerie/mouvements";

const ENTREES = (Object.keys(NATURES_MOUVEMENT) as NatureMouvement[]).filter((n) => NATURES_MOUVEMENT[n].sens === "entree");
const SORTIES = (Object.keys(NATURES_MOUVEMENT) as NatureMouvement[]).filter((n) => NATURES_MOUVEMENT[n].sens === "sortie");

/**
 * Saisie d'un mouvement. La nature décide du reste : le tiers à choisir
 * (client ou fournisseur), et pour un paiement, le RIB qui ira sur l'ordre de
 * virement.
 */
export function FormulaireMouvement({
  compteId,
  banque,
  clients,
  fournisseurs,
  aujourdhui,
}: {
  compteId: string;
  banque: boolean;
  clients: { id: string; nom: string }[];
  fournisseurs: { id: string; nom: string }[];
  aujourdhui: string;
}) {
  const [nature, setNature] = useState<NatureMouvement>("client");
  const definition = NATURES_MOUVEMENT[nature];
  const role = tiersRequis(nature);
  const tiers = role === "client" ? clients : role === "fournisseur" ? fournisseurs : [];

  return (
    <FormulaireRepliable libelle="Nouveau mouvement" titre="Enregistrer un mouvement" presentation="tiroir" action={enregistrerMouvement}>
      <input type="hidden" name="compteId" value={compteId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Nature" precision={definition.aide}>
          <select name="nature" value={nature} onChange={(e) => setNature(e.target.value as NatureMouvement)} className={CLASSE_CHAMP}>
            <optgroup label="Entrée d'argent">
              {ENTREES.map((n) => (
                <option key={n} value={n}>
                  {NATURES_MOUVEMENT[n].libelle}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sortie d'argent">
              {SORTIES.map((n) => (
                <option key={n} value={n}>
                  {NATURES_MOUVEMENT[n].libelle}
                </option>
              ))}
            </optgroup>
          </select>
        </Champ>
        {role && (
          <Champ libelle={role === "client" ? "Client" : "Fournisseur ou prestataire"}>
            <select name="tiersId" required className={CLASSE_CHAMP} key={role}>
              <option value="">Choisir…</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}
        <Champ libelle="Montant">
          <input name="montant" required inputMode="numeric" placeholder="250 000" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Date de l'opération">
          <input name="date" type="date" required max={aujourdhui} defaultValue={aujourdhui} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Libellé" precision="Ce qu'on lira au relevé.">
          <input name="libelle" placeholder={definition.libelle} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle={banque ? "Référence de la banque" : "Référence"} precision="Numéro de virement, de chèque ou de transaction.">
          <input name="reference" placeholder={banque ? "VIR 2026-10-0458" : "Wave 8KJ2…"} className={CLASSE_CHAMP} />
        </Champ>
        {banque && definition.sens === "sortie" && role && (
          <Champ libelle="RIB du bénéficiaire" precision="Reporté sur l'ordre de virement.">
            <input name="ribBeneficiaire" placeholder="CI008 01001 012345678901 23" className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
        )}
      </div>
    </FormulaireRepliable>
  );
}
