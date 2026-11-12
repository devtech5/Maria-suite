"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerMission, type EtatMission } from "@/modules/missions/actions";
import { GABARITS, LIBELLE_NATURE, LIBELLE_PREUVE } from "@/modules/missions/suivi";
import type { NatureMission } from "@/modules/missions/schema";

export interface OptionsFormulaire {
  employes: { id: string; nom: string }[];
  intervenants: { id: string; nom: string }[];
  clients: { id: string; nom: string }[];
  actifs: { id: string; libelle: string }[];
}

const NATURES = Object.keys(LIBELLE_NATURE) as NatureMission[];

/**
 * Ouverture d'une mission.
 *
 * Les étapes viennent du gabarit de la nature choisie et sont montrées avant
 * l'enregistrement : le gérant voit ce que le terrain devra rapporter — la
 * signature à la remise, la photo du lot — au lieu de le découvrir le jour du
 * litige.
 */
export function FormulaireMission({ options }: { options: OptionsFormulaire }) {
  const [ouvert, setOuvert] = useState(false);
  const [nature, setNature] = useState<NatureMission>("livraison");
  const [etat, action, enCours] = useActionState<EtatMission, FormData>(creerMission, {});

  const [derniere, setDerniere] = useState(etat.reference);
  if (etat.reference !== derniere) {
    setDerniere(etat.reference);
    if (etat.reference) setOuvert(false);
  }

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {etat.reference && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.reference}</span> ouverte.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          Nouvelle mission
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
        <h2 className="text-sm font-semibold">Nouvelle mission</h2>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Annuler
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Nature">
          <select
            name="nature"
            value={nature}
            onChange={(e) => setNature(e.target.value as NatureMission)}
            className={CLASSE_CHAMP}
          >
            {NATURES.map((n) => (
              <option key={n} value={n}>
                {LIBELLE_NATURE[n]}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="Titre">
          <input
            name="titre"
            required
            placeholder="Colis — 3 cartons électroménager"
            className={CLASSE_CHAMP}
          />
        </Champ>

        <Champ libelle="Lieu">
          <input name="lieu" placeholder="Cocody Angré, Abidjan" className={CLASSE_CHAMP} />
        </Champ>

        <Champ
          libelle="Collaborateur"
          precision="Un collaborateur OU un intervenant, jamais les deux."
        >
          <select name="employeId" defaultValue="" className={CLASSE_CHAMP}>
            <option value="">— aucun —</option>
            {options.employes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="Intervenant" precision="Livreur, maçon, tâcheron payé à la mission.">
          <select name="intervenantId" defaultValue="" className={CLASSE_CHAMP}>
            <option value="">— aucun —</option>
            {options.intervenants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="Client" precision="Renseigné : la mission se facture.">
          <select name="clientId" defaultValue="" className={CLASSE_CHAMP}>
            <option value="">— mission interne —</option>
            {options.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="Montant facturé" precision="En francs entiers.">
          <input
            name="montant"
            inputMode="numeric"
            defaultValue="0"
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        <Champ libelle="Échéance">
          <input
            name="echeance"
            type="datetime-local"
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        <Champ libelle="Véhicule ou engin" precision="Relie la mission au coût du parc.">
          <select name="actifId" defaultValue="" className={CLASSE_CHAMP}>
            <option value="">— aucun —</option>
            {options.actifs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      <div className="mt-4 rounded-lg bg-[var(--surface-creuse)] p-3">
        <p className="mb-2 text-xs font-semibold text-[var(--encre-douce)]">
          Étapes et preuves exigées
        </p>
        <ol className="space-y-1 text-sm">
          {GABARITS[nature].map((etape, index) => (
            <li key={etape.libelle} className="flex flex-wrap items-baseline gap-x-2">
              <span className="chiffres text-[var(--encre-faible)]">{index + 1}.</span>
              <span>{etape.libelle}</span>
              <span className="text-xs text-[var(--encre-faible)]">
                {etape.preuves.map((p) => LIBELLE_PREUVE[p].toLowerCase()).join(", ")}
              </span>
            </li>
          ))}
        </ol>
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
          {enCours ? "Enregistrement…" : "Ouvrir la mission"}
        </button>
      </div>
    </form>
  );
}
