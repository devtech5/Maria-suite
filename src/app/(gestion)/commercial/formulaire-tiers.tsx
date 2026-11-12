"use client";

import { useState } from "react";

import { ChoixOrigine } from "@/components/tiers/choix-origine";
import { FormulaireRepliable } from "@/components/ui/operations";
import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { referentielPays } from "@/lib/pays";
import { enregistrerTiers } from "@/modules/tiers/actions";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS } from "@/modules/tiers/natures";
import { type OrigineTiers } from "@/modules/tiers/origine";

/**
 * Création d'un client ou d'un fournisseur, dans une modale centrée.
 *
 * Même fenêtre partout dans l'application : elle garde la saisie si on la
 * ferme par erreur, se vide une fois le tiers enregistré, et laisse la liste
 * derrière elle pour vérifier qu'il n'existe pas déjà.
 */
export function FormulaireTiers({ role, paysEntreprise }: { role: "client" | "fournisseur"; paysEntreprise: string }) {
  const libelle = role === "client" ? "client" : "fournisseur";
  return (
    <FormulaireRepliable libelle={`Nouveau ${libelle}`} titre={`Nouveau ${libelle}`} action={enregistrerTiers} presentation="ample">
      <ChampsTiers role={role} paysEntreprise={paysEntreprise} />
    </FormulaireRepliable>
  );
}

function ChampsTiers({ role, paysEntreprise }: { role: "client" | "fournisseur"; paysEntreprise: string }) {
  const [origine, setOrigine] = useState<OrigineTiers>("local");
  const [pays, setPays] = useState("");
  // Le libellé de l'identifiant fiscal suit le pays du tiers, pas un référentiel codé en dur :
  // « NCC » pour un fournisseur ivoirien, le sigle de son pays pour un étranger.
  const fiscal = referentielPays(origine === "international" ? pays : paysEntreprise);

  return (
    <div className="space-y-4">
      {role === "fournisseur" && (
        <ChoixOrigine libelle="Type de fournisseur" paysEntreprise={paysEntreprise} origine={origine} pays={pays} onOrigine={setOrigine} onPays={setPays} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Nom">
          <input name="nom" autoFocus required placeholder={role === "client" ? "Pharmacie du Plateau" : "Nestlé CI"} className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle={role === "client" ? "Type de client" : "Nature"}>
          <select name="nature" defaultValue="entreprise" className={CLASSE_CHAMP}>
            {NATURES_TIERS.map((n) => (
              <option key={n} value={n}>
                {LIBELLE_NATURE_TIERS[n]}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="Téléphone">
          <input name="telephone" inputMode="tel" placeholder={origine === "international" ? "+33 1 00 00 00 00" : "+225 07 00 00 00 00"} className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle="E-mail">
          <input name="email" type="email" className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle="Ville">
          <input name="ville" placeholder={origine === "international" ? "Paris" : "Abidjan"} className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle={fiscal.identifiantFiscalLong} precision={`Identifiant fiscal (${fiscal.identifiantFiscal})`}>
          <input name="identifiantFiscal" placeholder={origine === "international" ? "" : "CI-2020-0000000 A"} className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle="Secteur">
          <input name="secteur" placeholder={role === "client" ? "Pharmacie" : "Alimentaire"} className={CLASSE_CHAMP} />
        </Champ>

        {role === "client" ? (
          <>
            <Champ libelle="Encours autorisé" precision="Zéro = paiement comptant, le cas par défaut.">
              <input name="plafondEncours" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Délai de règlement" precision="En jours.">
              <input name="delaiReglementJours" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
          </>
        ) : (
          <Champ libelle="Délai de livraison" precision="En jours. Sert au calcul du réapprovisionnement.">
            <input name="delaiLivraisonJours" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
        )}
      </div>

      {/* Les deux rôles sont indépendants : le grossiste qui livre la boutique
          lui rachète parfois ses invendus. Une seule fiche, deux comptes. */}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Rôles</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="estClient" defaultChecked={role === "client"} className="size-4 accent-marque-600" />
            Client — compte 411
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="estFournisseur" defaultChecked={role === "fournisseur"} className="size-4 accent-marque-600" />
            Fournisseur — compte 401
          </label>
        </div>
      </fieldset>
    </div>
  );
}
