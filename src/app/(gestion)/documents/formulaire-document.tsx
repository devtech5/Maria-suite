"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { deposerDocument, type EtatDocument } from "@/modules/documents/actions";
import type { TypeEntiteDocument } from "@/modules/documents/schema";
import { Fenetre } from "@/components/ui/fenetre";

export interface CibleDocument {
  id: string;
  libelle: string;
  type: TypeEntiteDocument;
}

const RATTACHEMENTS: { valeur: TypeEntiteDocument | ""; libelle: string }[] = [
  { valeur: "", libelle: "Aucun" },
  { valeur: "tiers", libelle: "Client ou fournisseur" },
  { valeur: "employe", libelle: "Collaborateur" },
  { valeur: "intervenant", libelle: "Intervenant" },
  { valeur: "actif", libelle: "Actif" },
  { valeur: "organisation", libelle: "L'entreprise" },
];

/**
 * Dépôt d'un document.
 *
 * Le rattachement se choisit en deux temps — la nature, puis l'élément — parce
 * qu'une liste unique mêlant clients, collaborateurs et véhicules deviendrait
 * illisible passé la centaine de fiches.
 *
 * La pièce jointe est FACULTATIVE. Une fiche sans fichier reste légitime : le
 * dépôt n'est pas configuré, ou l'original est un papier rangé dans un tiroir
 * dont on suit seulement l'échéance. Une police d'assurance expire aussi bien
 * dans un classeur.
 */
export function FormulaireDocument({
  cibles,
  stockageActif,
  premier = false,
}: {
  cibles: CibleDocument[];
  stockageActif: boolean;
  premier?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeEntiteDocument | "">("");
  const [etat, action, enCours] = useActionState<EtatDocument, FormData>(
    deposerDocument,
    {},
  );

  const [dernier, setDernier] = useState(etat.message);
  if (etat.message !== dernier) {
    setDernier(etat.message);
    if (etat.message) setOuvert(false);
  }

  const candidats = cibles.filter((cible) => cible.type === type);

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.message && (
          <span className="text-sm text-valide-600">{etat.message}</span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          {premier ? "Déposer le premier document" : "Ajouter un document"}
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouveau document" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          {!stockageActif && (
            <p className="mb-4 rounded-lg border-l-4 border-alerte-500 bg-alerte-50 px-3 py-2.5 text-sm text-alerte-600">
              <strong className="font-semibold">Dépôt de fichiers inactif.</strong> La
              fiche s&apos;enregistre, mais aucune pièce ne peut être jointe tant que{" "}
              <span className="chiffres">STOCKAGE_LOCAL</span> n&apos;est pas
              renseigné.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Nom du document">
              <input
                name="nom"
                required
                placeholder="Police d'assurance — Yamaha AG100"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ libelle="Catégorie" precision="Regroupement libre, pour s'y retrouver.">
              <input name="categorie" placeholder="Parc" className={CLASSE_CHAMP} />
            </Champ>

            <Champ
              libelle="Visibilité"
              precision="Privé pour une pièce personnelle ou un contrat de travail."
            >
              <select name="visibilite" defaultValue="equipe" className={CLASSE_CHAMP}>
                <option value="equipe">Toute l&apos;équipe</option>
                <option value="restreint">Restreint</option>
                <option value="prive">Privé</option>
              </select>
            </Champ>

            <Champ
              libelle="Rattaché à"
              precision="C'est le rattachement qui donne sa valeur au document."
            >
              <select
                name="entiteType"
                value={type}
                onChange={(e) => setType(e.target.value as TypeEntiteDocument | "")}
                className={CLASSE_CHAMP}
              >
                {RATTACHEMENTS.map((r) => (
                  <option key={r.valeur} value={r.valeur}>
                    {r.libelle}
                  </option>
                ))}
              </select>
            </Champ>

            {type !== "" && (
              <Champ
                libelle="Élément"
                precision={
                  candidats.length === 0 ? "Aucun élément de cette nature." : undefined
                }
              >
                <select
                  name="entiteId"
                  key={type}
                  className={CLASSE_CHAMP}
                  onChange={(event) => {
                    const form = event.target.form;
                    if (!form) return;
                    const choisi = candidats.find((c) => c.id === event.target.value);
                    (
                      form.elements.namedItem("entiteLibelle") as HTMLInputElement
                    ).value = choisi?.libelle ?? "";
                  }}
                >
                  {candidats.map((cible) => (
                    <option key={cible.id} value={cible.id}>
                      {cible.libelle}
                    </option>
                  ))}
                </select>
              </Champ>
            )}

            {/* Le libellé de l'entité est recopié à la fiche : un rattachement
                polymorphe ne se joint pas, et l'écran doit rester lisible même si
                l'objet visé est renommé plus tard. */}
            <input
              type="hidden"
              name="entiteLibelle"
              defaultValue={candidats[0]?.libelle ?? ""}
              key={`libelle-${type}`}
            />

            <Champ
              libelle="Expire le"
              precision="Assurance, agrément, visite. Vide si le document ne périme pas."
            >
              <input name="expireLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>

            <Champ
              libelle="Pièce jointe"
              precision="PDF, image ou bureautique. 10 Mo au maximum. Facultative."
            >
              <input
                name="fichier"
                type="file"
                disabled={!stockageActif}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
                className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-creuse)] file:px-3 file:py-2 file:text-sm file:font-semibold disabled:opacity-50"
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
              {enCours ? "Dépôt en cours…" : "Déposer"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
