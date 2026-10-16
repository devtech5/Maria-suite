"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerActif, type EtatActif } from "@/modules/actifs/actions";

export interface OptionPersonne {
  id: string;
  nom: string;
  /** `employe` ou `intervenant` : deux natures, deux colonnes. */
  nature: "employe" | "intervenant";
}

export interface OptionClient {
  id: string;
  nom: string;
}

const TYPES = [
  { valeur: "vehicule", libelle: "Véhicule", unite: "km" },
  { valeur: "engin", libelle: "Engin", unite: "h" },
  { valeur: "informatique", libelle: "Informatique", unite: "" },
  { valeur: "mobilier", libelle: "Mobilier et équipement", unite: "" },
  { valeur: "local", libelle: "Local (bureau, entrepôt, magasin)", unite: "" },
] as const;

type Type = (typeof TYPES)[number]["valeur"];

/**
 * Ouverture d'une fiche d'actif.
 *
 * Le propriétaire commande le reste : renseigné, l'actif est celui d'un
 * client, sa valeur d'acquisition disparaît du formulaire — elle ne figure pas
 * au bilan de l'entreprise — et ses interventions deviennent facturables.
 * C'est ce seul champ qui fait passer le moteur du parc automobile au garage.
 */
export function FormulaireActif({
  personnes,
  clients,
  premier = false,
}: {
  personnes: OptionPersonne[];
  clients: OptionClient[];
  premier?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<Type>("vehicule");
  const [proprietaire, setProprietaire] = useState("");
  const [etat, action, enCours] = useActionState<EtatActif, FormData>(
    creerActif,
    {},
  );

  const [dernier, setDernier] = useState(etat.code);
  if (etat.code !== dernier) {
    setDernier(etat.code);
    if (etat.code) setOuvert(false);
  }

  const definition = TYPES.find((t) => t.valeur === type) ?? TYPES[0];
  const aUnCompteur = definition.unite !== "";
  const auClient = proprietaire !== "";

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {etat.code && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.code}</span> ouvert.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          {premier ? "Ouvrir la première fiche" : "Nouvel actif"}
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mb-5 w-full rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Nouvel actif</h2>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Annuler
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Désignation">
          <input
            name="designation"
            required
            placeholder="Toyota Hilux — 1234 AB 01"
            className={CLASSE_CHAMP}
          />
        </Champ>

        <Champ
          libelle="Nature"
          precision={
            aUnCompteur
              ? `L'entretien peut suivre le compteur, en ${definition.unite}.`
              : "L'entretien suit le calendrier."
          }
        >
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as Type)}
            className={CLASSE_CHAMP}
          >
            {TYPES.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.libelle}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="État de service">
          <select name="statut" defaultValue="actif" className={CLASSE_CHAMP}>
            <option value="actif">En service</option>
            <option value="entretien">En entretien</option>
            <option value="immobilise">Immobilisé</option>
            <option value="cede">Cédé</option>
          </select>
        </Champ>

        <Champ
          libelle="Propriétaire"
          precision="Vide : l'actif est à l'entreprise. Un client, et ses interventions se facturent."
        >
          <select
            name="proprietaireId"
            value={proprietaire}
            onChange={(e) => setProprietaire(e.target.value)}
            className={CLASSE_CHAMP}
          >
            <option value="">L&apos;entreprise</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ
          libelle="Confié à"
          precision="Salarié ou intervenant. Une personne, pas deux."
        >
          <select
            name={
              // Deux colonnes distinctes en base : le nom du champ suit la
              // nature de la personne choisie.
              "personne"
            }
            defaultValue=""
            onChange={(event) => {
              const choisie = personnes.find((p) => p.id === event.target.value);
              const form = event.target.form;
              if (!form) return;
              (form.elements.namedItem("employeId") as HTMLInputElement).value =
                choisie?.nature === "employe" ? choisie.id : "";
              (
                form.elements.namedItem("intervenantId") as HTMLInputElement
              ).value = choisie?.nature === "intervenant" ? choisie.id : "";
            }}
            className={CLASSE_CHAMP}
          >
            <option value="">Personne</option>
            {personnes.map((personne) => (
              <option key={personne.id} value={personne.id}>
                {personne.nom}
                {personne.nature === "intervenant" ? " — intervenant" : ""}
              </option>
            ))}
          </select>
        </Champ>

        <input type="hidden" name="employeId" defaultValue="" />
        <input type="hidden" name="intervenantId" defaultValue="" />

        <Champ libelle="Site">
          <input name="site" placeholder="Abidjan" className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle="Date d'acquisition">
          <input
            name="dateAcquisition"
            type="date"
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        {!auClient && (
          <Champ
            libelle="Valeur d'acquisition"
            precision="En francs entiers. Entre dans la valeur du parc."
          >
            <input
              name="valeurAcquisition"
              inputMode="numeric"
              defaultValue="0"
              className={`${CLASSE_CHAMP} chiffres`}
            />
          </Champ>
        )}

        {aUnCompteur && (
          <>
            <Champ libelle="Unité du compteur">
              <input
                name="uniteCompteur"
                defaultValue={definition.unite}
                key={definition.unite}
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ
              libelle="Relevé de départ"
              precision="Premier constat daté, pas une valeur figée sur la fiche."
            >
              <input
                name="compteurInitial"
                inputMode="numeric"
                placeholder="0"
                className={`${CLASSE_CHAMP} chiffres`}
              />
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
          {enCours ? "Enregistrement…" : "Ouvrir la fiche"}
        </button>
      </div>
    </form>
  );
}
