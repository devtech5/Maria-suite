"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { confirmer } from "@/components/ui/dialogues";
import { FormulaireRepliable, Retour } from "@/components/ui/operations";
import { basculerActif, effacerLigne, mettreALaCorbeille, modifierLigne, restaurerLigne } from "@/modules/donnees/actions";
import type { Resultat } from "@/modules/donnees/operations";

const BOUTON = "rounded-lg border border-[var(--filet)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50";
const DANGER = "rounded-lg px-3 py-1.5 text-sm font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50";

/** Modifier, désactiver, supprimer, restaurer, effacer : seulement les gestes que la ligne permet. */
export function GestesLigne({
  table,
  id,
  titre,
  modifiable,
  actif,
  aLaCorbeille,
  supprimable,
  refusEffacement,
  champs,
}: {
  table: string;
  id: string;
  titre: string;
  modifiable: boolean;
  /** Nul : la table ne se désactive pas, ou la ligne est figée. */
  actif: boolean | null;
  aLaCorbeille: boolean;
  supprimable: boolean;
  /** Pourquoi l'effacement définitif est refusé ; nul s'il est permis. */
  refusEffacement: string | null;
  champs: ReactNode;
}) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  function lancer(action: () => Promise<Resultat>, apres?: () => void) {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok && apres) apres();
      else routeur.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {modifiable && (
          <FormulaireRepliable libelle="Modifier" titre={`Modifier — ${titre}`} action={modifierLigne} variante="discret">
            <input type="hidden" name="table" value={table} />
            <input type="hidden" name="id" value={id} />
            {champs}
          </FormulaireRepliable>
        )}
        {actif !== null && (
          <button
            type="button"
            disabled={enCours}
            className={BOUTON}
            onClick={async () => {
              const question = actif
                ? "Désactiver cette ligne ? Elle reste enregistrée mais n'est plus proposée dans les listes de son module."
                : "Réactiver cette ligne ?";
              if (await confirmer(question, { action: actif ? "Désactiver" : "Réactiver", danger: false })) lancer(() => basculerActif(table, id));
            }}
          >
            {actif ? "Désactiver" : "Réactiver"}
          </button>
        )}
        {supprimable && !aLaCorbeille && (
          <button
            type="button"
            disabled={enCours}
            className={DANGER}
            onClick={async () => {
              if (await confirmer("Supprimer cette ligne ? Elle passe à la corbeille, d'où vous pourrez la restaurer.")) lancer(() => mettreALaCorbeille(table, id));
            }}
          >
            Supprimer
          </button>
        )}
        {aLaCorbeille && (
          <>
            <button type="button" disabled={enCours} className={BOUTON} onClick={() => lancer(() => restaurerLigne(table, id))}>
              Restaurer
            </button>
            <button
              type="button"
              disabled={enCours || refusEffacement !== null}
              title={refusEffacement ?? undefined}
              className={DANGER}
              onClick={async () => {
                const ok = await confirmer("Effacer définitivement cette ligne ? Elle ne pourra plus revenir ; seul le journal d'activité gardera son contenu.", {
                  action: "Effacer",
                  danger: true,
                });
                if (ok) lancer(() => effacerLigne(table, id), () => routeur.push(`/donnees/${table}?corbeille=1`));
              }}
            >
              Effacer définitivement
            </button>
          </>
        )}
      </div>
      {aLaCorbeille && refusEffacement && <p className="text-xs text-[var(--encre-faible)]">Effacement définitif impossible : {refusEffacement}</p>}
      {resultat && <Retour resultat={resultat} />}
    </div>
  );
}
