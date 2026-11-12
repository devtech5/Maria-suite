"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { UNITES } from "@/lib/quantite";
import { creerArticle, type EtatArticle } from "@/modules/catalogue/actions";
import { Fenetre } from "@/components/ui/fenetre";

export interface OptionListe {
  id: string;
  nom: string;
}

export function FormulaireArticle({
  familles,
  fournisseurs,
}: {
  familles: OptionListe[];
  fournisseurs: OptionListe[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<"marchandise" | "service">("marchandise");
  const [etat, action, enCours] = useActionState<EtatArticle, FormData>(
    creerArticle,
    {},
  );

  // Refermé dès que l'article est créé, pendant le rendu plutôt que dans un
  // effet : un effet afficherait le formulaire encore ouvert le temps d'un
  // rendu supplémentaire.
  const [dernierCree, setDernierCree] = useState(etat.cree);
  if (etat.cree !== dernierCree) {
    setDernierCree(etat.cree);
    if (etat.cree) setOuvert(false);
  }

  const service = type === "service";

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.cree && (
          <span className="text-sm text-valide-600">
            Article {etat.cree} enregistré.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          Nouvel article
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouvel article" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Désignation">
              <input
                name="designation"
                autoFocus
                required
                placeholder="Riz parfumé 5 kg"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ
              libelle="Référence"
              precision="Laissée vide, elle est attribuée automatiquement."
            >
              <input
                name="reference"
                placeholder="RIZ-PAR-5K"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            {/* Marchandise ou service : ce choix commande le compte de produit,
                le régime de TVA et le fait que l'article se stocke ou non. */}
            <Champ
              libelle="Nature"
              precision={
                service
                  ? "Un service ne se stocke pas et se ventile en 706."
                  : "Une marchandise se stocke et se ventile en 701."
              }
            >
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as "marchandise" | "service")}
                className={CLASSE_CHAMP}
              >
                <option value="marchandise">Marchandise</option>
                <option value="service">Prestation de service</option>
              </select>
            </Champ>

            <Champ libelle="Famille">
              <select name="familleId" defaultValue="" className={CLASSE_CHAMP}>
                <option value="">Aucune</option>
                {familles.map((famille) => (
                  <option key={famille.id} value={famille.id}>
                    {famille.nom}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ libelle="Prix de vente" precision="En francs entiers, par unité.">
              <input
                name="prixVente"
                inputMode="numeric"
                defaultValue="0"
                required
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ libelle="Prix d'achat">
              <input
                name="prixAchat"
                inputMode="numeric"
                defaultValue="0"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            {!service && (
              <>
                {/* La grandeur décide si l'article accepte une fraction : on vend
                    du poisson au kilo, pas une demi-bouteille. */}
                <Champ libelle="Unité de vente">
                  <select name="unite" defaultValue="piece" className={CLASSE_CHAMP}>
                    {Object.values(UNITES).map((unite) => (
                      <option key={unite.code} value={unite.code}>
                        {unite.libelle}
                        {unite.fractionnable ? " — fractionnable" : ""}
                      </option>
                    ))}
                  </select>
                </Champ>

                <Champ
                  libelle="Conditionnement"
                  precision="Libellé d'affichage seulement : sac, boîte, bouteille."
                >
                  <input name="conditionnement" placeholder="sac" className={CLASSE_CHAMP} />
                </Champ>

                <Champ
                  libelle="Seuil d'alerte"
                  precision="Dans l'unité de l'article, pas en valeur."
                >
                  <input
                    name="seuilAlerte"
                    inputMode="decimal"
                    defaultValue="0"
                    className={`${CLASSE_CHAMP} chiffres`}
                  />
                </Champ>

                <Champ
                  libelle="Fournisseur habituel"
                  precision="Celui que proposera le réapprovisionnement."
                >
                  <select name="fournisseurId" defaultValue="" className={CLASSE_CHAMP}>
                    <option value="">Aucun</option>
                    {fournisseurs.map((fournisseur) => (
                      <option key={fournisseur.id} value={fournisseur.id}>
                        {fournisseur.nom}
                      </option>
                    ))}
                  </select>
                </Champ>
              </>
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
              {enCours ? "Enregistrement…" : "Enregistrer l'article"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
