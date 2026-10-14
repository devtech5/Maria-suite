"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { agirSurReunion, enregistrerCompteRendu, inviter } from "@/modules/meeting/actions";
import type { Geste } from "@/modules/meeting/calcul";

/** Terminer pour tous, ou annuler avec un motif. */
export function GestesReunion({ reunionId, gestes }: { reunionId: string; gestes: Geste[] }) {
  const op = useOperation();
  const [motif, setMotif] = useState<string | null>(null);

  if (gestes.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {gestes.includes("terminer") && (
          <button
            type="button"
            disabled={op.enCours}
            onClick={() => {
              if (confirm("Terminer la réunion pour tous les participants ?")) op.lancer(() => agirSurReunion(reunionId, "terminer"));
            }}
            className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50"
          >
            Terminer pour tous
          </button>
        )}
        {gestes.includes("annuler") && motif === null && (
          <button
            type="button"
            onClick={() => setMotif("")}
            className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium text-danger-600 hover:bg-[var(--surface-creuse)]"
          >
            Annuler la réunion
          </button>
        )}
      </div>
      {motif !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => agirSurReunion(reunionId, "annuler", motif), () => setMotif(null));
          }}
          className="flex w-full max-w-md gap-2"
        >
          <input value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} maxLength={1000} placeholder="Motif de l'annulation" className={CLASSE_CHAMP} autoFocus />
          <button type="submit" disabled={op.enCours} className="h-cible shrink-0 rounded-lg bg-danger-600 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
            Annuler
          </button>
        </form>
      )}
      <Retour resultat={op.resultat} />
    </div>
  );
}

/** Inviter d'autres membres à une réunion qui n'est pas close. */
export function InviterMembres({ reunionId, candidats }: { reunionId: string; candidats: { userId: string; nom: string }[] }) {
  const op = useOperation();
  const [choisis, setChoisis] = useState<string[]>([]);
  if (candidats.length === 0) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        op.lancer(() => inviter(reunionId, choisis), () => setChoisis([]));
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <label className="block min-w-48 flex-1">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Inviter d&apos;autres membres</span>
        <select
          multiple
          value={choisis}
          onChange={(e) => setChoisis(Array.from(e.target.selectedOptions, (o) => o.value))}
          className={`${CLASSE_CHAMP} h-24 py-1`}
        >
          {candidats.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={op.enCours || choisis.length === 0} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
        Inviter
      </button>
      <div className="w-full">
        <Retour resultat={op.resultat} />
      </div>
    </form>
  );
}

/** Compte rendu, rédigé par qui pilote la réunion. */
export function CompteRendu({ reunionId, initial }: { reunionId: string; initial: string | null }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => enregistrerCompteRendu(reunionId, donnees));
      }}
    >
      <textarea
        name="compteRendu"
        rows={8}
        maxLength={20_000}
        defaultValue={initial ?? ""}
        placeholder={"Décisions prises, qui fait quoi et pour quand…"}
        className={`${CLASSE_CHAMP} h-auto py-2`}
      />
      <div className="mt-2 flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Enregistrer le compte rendu"}
        </button>
      </div>
    </form>
  );
}
