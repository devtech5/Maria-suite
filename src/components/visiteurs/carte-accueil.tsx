"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Champ, Pastille } from "@/components/ui/primitives";
import { affecterAgent, enregistrerAccueil } from "@/modules/visiteurs/actions";
import { Fenetre } from "@/components/ui/fenetre";

export interface AccueilAffiche {
  id: string;
  nom: string;
  lieu: string | null;
  pieceExigee: boolean;
  actif: boolean;
  agents: { userId: string; nom: string }[];
}

/** Un point d'accueil : nom, lieu, règle de la pièce, agents qui le tiennent. */
export function CarteAccueil({ accueil: a, membres }: { accueil: AccueilAffiche; membres: { id: string; nom: string }[] }) {
  const op = useOperation();
  const [edition, setEdition] = useState(false);
  const libres = membres.filter((m) => !a.agents.some((g) => g.userId === m.id));

  return (
    <article className={`rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm ${a.actif ? "" : "opacity-60"}`}>
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{a.nom}</h3>
              {a.lieu && <p className="text-sm text-[var(--encre-douce)]">{a.lieu}</p>}
            </div>
            {!a.actif && <Pastille>Fermé</Pastille>}
            {a.pieceExigee ? <Pastille ton="marque">Pièce exigée</Pastille> : <Pastille>Pièce facultative</Pastille>}
          </div>
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-[var(--encre-faible)]">Agents d&apos;accueil</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {a.agents.length === 0 && <li className="text-sm text-[var(--encre-faible)]">Aucun : seule la supervision voit ce registre.</li>}
            {a.agents.map((g) => (
              <li key={g.userId} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-creuse)] py-0.5 pl-2.5 pr-1 text-sm">
                {g.nom}
                <button type="button" aria-label={`Retirer ${g.nom}`} onClick={() => op.lancer(() => affecterAgent(a.id, g.userId, false))} className="rounded-full px-1.5 text-[var(--encre-faible)] hover:bg-[var(--filet)]">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {libres.length > 0 && (
              <select
                aria-label="Ajouter un agent"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  e.target.value = "";
                  if (id) op.lancer(() => affecterAgent(a.id, id, true));
                }}
                className={CLASSE_CHAMP_COMPACT}
              >
                <option value="">+ Ajouter un agent…</option>
                {libres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => setEdition(true)} className="ml-auto text-sm font-semibold text-marque-600 hover:underline">
              Modifier
            </button>
          </div>
        </>
      <Fenetre ouverte={edition} titre="Modifier le point d'accueil" onFermer={() => setEdition(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            op.lancer(() => enregistrerAccueil(d), () => setEdition(false));
          }}
          className="space-y-3 px-5 py-4"
        >
          <input type="hidden" name="id" value={a.id} />
          <Champ libelle="Nom">
            <input name="nom" required defaultValue={a.nom} maxLength={80} className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Lieu">
            <input name="lieu" defaultValue={a.lieu ?? ""} maxLength={160} className={CLASSE_CHAMP} />
          </Champ>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pieceExigee" defaultChecked={a.pieceExigee} className="accent-marque-600" /> Pièce d&apos;identité exigée à l&apos;arrivée
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="actif" defaultChecked={a.actif} className="accent-marque-600" /> Point d&apos;accueil ouvert
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEdition(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
              Annuler
            </button>
            <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
              Enregistrer
            </button>
          </div>
        </form>
      </Fenetre>
      <Retour resultat={op.resultat} />
    </article>
  );
}
