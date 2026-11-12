"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { UNITES, type CodeUnite } from "@/lib/quantite";
import {
  enregistrerMouvement,
  type EtatMouvement,
} from "@/modules/stock/actions";
import { Fenetre } from "@/components/ui/fenetre";

export interface OptionDepot {
  id: string;
  nom: string;
  code: string;
}

export interface OptionArticle {
  id: string;
  designation: string;
  unite: CodeUnite;
}

type Geste = "reception" | "transfert" | "ajustement" | "retour";

const GESTES: { valeur: Geste; libelle: string; precision: string }[] = [
  {
    valeur: "reception",
    libelle: "Réception",
    precision: "La marchandise arrive du fournisseur. Le prix payé fixe sa valeur.",
  },
  {
    valeur: "transfert",
    libelle: "Transfert",
    precision: "Deux lignes : une sortie ici, une entrée là-bas. La valeur suit.",
  },
  {
    valeur: "ajustement",
    libelle: "Ajustement d'inventaire",
    precision: "Casse, péremption, écart constaté. Le motif est obligatoire.",
  },
  {
    valeur: "retour",
    libelle: "Retour",
    precision: "La marchandise revient en stock, du client ou d'un chantier.",
  },
];

/**
 * Saisie manuelle d'un mouvement.
 *
 * La vente n'y figure pas. Elle vient de la caisse avec son ticket : la saisir
 * ici ferait sortir de la marchandise sans encaissement en face, et l'écart
 * n'apparaîtrait qu'au comptage suivant.
 */
export function FormulaireMouvement({
  depots,
  articles,
}: {
  depots: OptionDepot[];
  articles: OptionArticle[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [geste, setGeste] = useState<Geste>("reception");
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [etat, action, enCours] = useActionState<EtatMouvement, FormData>(
    enregistrerMouvement,
    {},
  );

  const [dernierePiece, setDernierePiece] = useState(etat.piece);
  if (etat.piece !== dernierePiece) {
    setDernierePiece(etat.piece);
    if (etat.piece) setOuvert(false);
  }

  const definition = GESTES.find((g) => g.valeur === geste) ?? GESTES[0];
  const article = articles.find((a) => a.id === articleId);
  const unite = article ? UNITES[article.unite] : UNITES.piece;

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.piece && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.piece}</span>
            {etat.message ? ` · ${etat.message}` : " enregistrée."}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={depots.length === 0 || articles.length === 0}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          Enregistrer un mouvement
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouveau mouvement" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Nature" precision={definition.precision}>
              <select
                name="type"
                value={geste}
                onChange={(e) => setGeste(e.target.value as Geste)}
                className={CLASSE_CHAMP}
              >
                {GESTES.map((g) => (
                  <option key={g.valeur} value={g.valeur}>
                    {g.libelle}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ libelle={geste === "transfert" ? "Dépôt de départ" : "Dépôt"}>
              <select name="depotId" defaultValue={depots[0]?.id} className={CLASSE_CHAMP}>
                {depots.map((depot) => (
                  <option key={depot.id} value={depot.id}>
                    {depot.nom}
                  </option>
                ))}
              </select>
            </Champ>

            {geste === "transfert" && (
              <Champ
                libelle="Dépôt d'arrivée"
                precision="Différent du départ : un transfert sur place n'existe pas."
              >
                <select
                  name="depotDestinationId"
                  defaultValue={depots[1]?.id ?? ""}
                  className={CLASSE_CHAMP}
                >
                  {depots.map((depot) => (
                    <option key={depot.id} value={depot.id}>
                      {depot.nom}
                    </option>
                  ))}
                </select>
              </Champ>
            )}

            <Champ libelle="Article">
              <select
                name="articleId"
                value={articleId}
                onChange={(e) => setArticleId(e.target.value)}
                className={CLASSE_CHAMP}
              >
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.designation}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ
              libelle="Quantité"
              precision={
                unite.fractionnable
                  ? `En ${unite.libelle.toLowerCase()}s, décimales admises.`
                  : `En ${unite.libelle.toLowerCase()}s entières.`
              }
            >
              <input
                name="quantite"
                inputMode={unite.fractionnable ? "decimal" : "numeric"}
                defaultValue="1"
                required
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            {/* Seul l'ajustement peut retrancher : l'inventaire trouve autant qu'il
                perd, et la casse doit pouvoir se saisir. */}
            {geste === "ajustement" ? (
              <Champ libelle="Sens" precision="Ce que l'inventaire constate.">
                <select name="sens" defaultValue="sortie" className={CLASSE_CHAMP}>
                  <option value="sortie">Manquant — retirer du stock</option>
                  <option value="entree">Excédent — ajouter au stock</option>
                </select>
              </Champ>
            ) : (
              <input type="hidden" name="sens" value="entree" />
            )}

            {geste === "reception" && (
              <Champ
                libelle="Prix d'achat unitaire"
                precision="Vide : le dernier prix d'achat connu de l'article."
              >
                <input
                  name="coutUnitaire"
                  inputMode="numeric"
                  placeholder="0"
                  className={`${CLASSE_CHAMP} chiffres`}
                />
              </Champ>
            )}

            <Champ
              libelle="Pièce"
              precision="Laissée vide, elle est numérotée automatiquement."
            >
              <input
                name="piece"
                placeholder="REC-2026-00012"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ
              libelle="Motif"
              precision={
                geste === "ajustement"
                  ? "Obligatoire : un écart sans motif ne s'explique plus."
                  : "Facultatif."
              }
            >
              <input
                name="motif"
                required={geste === "ajustement"}
                placeholder="Casse constatée à l'inventaire"
                className={CLASSE_CHAMP}
              />
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
              {enCours ? "Enregistrement…" : "Enregistrer le mouvement"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
