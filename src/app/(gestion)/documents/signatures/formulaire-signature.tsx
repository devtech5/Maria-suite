"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import {
  demanderSignature,
  type EtatSignature,
} from "@/modules/documents/actions";
import { Fenetre } from "@/components/ui/fenetre";

export interface OptionDocument {
  id: string;
  nom: string;
}

/** Trois lignes de signataires : au-delà, on ajoute une demande, pas un champ. */
const LIGNES = [0, 1, 2];

/**
 * Ouverture d'une demande de signature.
 *
 * Le code à six chiffres se transmet HORS du canal d'envoi — de vive voix, par
 * un autre numéro. C'est lui qui empêche un tiers ayant accès au message de
 * signer à la place du destinataire. Sans lui, le lien seul suffit à engager.
 */
export function FormulaireSignature({
  documents,
}: {
  documents: OptionDocument[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action, enCours] = useActionState<EtatSignature, FormData>(
    demanderSignature,
    {},
  );

  const [dernier, setDernier] = useState(etat.reference);
  if (etat.reference !== dernier) {
    setDernier(etat.reference);
    if (etat.reference) setOuvert(false);
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.reference && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.reference}</span> ouverte.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={documents.length === 0}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          Demander une signature
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouvelle demande" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Document">
              <select name="documentId" className={CLASSE_CHAMP}>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.nom}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ
              libelle="Validité"
              precision="En jours. Passé ce délai, la demande se relance depuis le début."
            >
              <input
                name="validiteJours"
                inputMode="numeric"
                defaultValue="7"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ
              libelle="Code de sécurité"
              precision="Six chiffres transmis de vive voix, hors du canal d'envoi."
            >
              <label className="flex h-cible items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="codeSecurite"
                  defaultChecked
                  className="size-4"
                />
                Exiger un code
              </label>
            </Champ>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-medium text-[var(--encre-faible)]">
              Signataires — une demande n&apos;aboutit que lorsque tous ont signé
            </legend>

            <div className="space-y-2">
              {LIGNES.map((ligne) => (
                <div key={ligne} className="flex flex-wrap items-center gap-3">
                  <input
                    name="signataireNom"
                    placeholder={
                      ligne === 0 ? "Koffi Bernard" : "Nom du signataire (facultatif)"
                    }
                    required={ligne === 0}
                    className={`${CLASSE_CHAMP} flex-1`}
                  />
                  <label className="flex h-cible items-center gap-2 text-sm">
                    {/* La case porte le RANG de la ligne, pas « on » : un
                        formulaire n'envoie que les cases cochées, et une valeur
                        commune ferait glisser l'attribut « interne » sur la
                        première ligne dès qu'une case du bas est seule cochée. */}
                    <input
                      type="checkbox"
                      name="signataireInterne"
                      value={ligne}
                      className="size-4"
                    />
                    Interne
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

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
              {enCours ? "Enregistrement…" : "Ouvrir la demande"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
