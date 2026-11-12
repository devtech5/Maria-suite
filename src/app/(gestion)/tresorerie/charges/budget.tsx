"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { fmt } from "@/lib/format";
import { definirBudget } from "@/modules/tresorerie/actions-charges";
import { Fenetre } from "@/components/ui/fenetre";

/**
 * Enveloppe mensuelle d'une famille, modifiable sur place par qui gère les
 * charges. Vider le champ retire l'enveloppe.
 */
export function CelluleBudget({ famille, budget, modifiable }: { famille: string; budget: number | null; modifiable: boolean }) {
  const [edition, setEdition] = useState(false);
  const { resultat, enCours, lancer } = useOperation();

  if (!modifiable) return <span className="chiffres">{budget ? fmt(budget) : "—"}</span>;

  return (
    <>
      <span className="inline-flex flex-col items-end">
        <button
          type="button"
          onClick={() => setEdition(true)}
          title="Fixer l'enveloppe mensuelle"
          className="chiffres rounded px-1 underline decoration-dotted underline-offset-4 hover:bg-[var(--surface-creuse)]"
        >
          {budget ? fmt(budget) : "Fixer"}
        </button>
        {resultat && !resultat.ok && <Retour resultat={resultat} />}
      </span>
      <Fenetre ouverte={edition} titre={`Enveloppe mensuelle — ${famille}`} onFermer={() => setEdition(false)}>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const saisie = String(new FormData(e.currentTarget).get("montant") ?? "");
        lancer(() => definirBudget(famille, saisie), () => setEdition(false));
      }}
      className="space-y-4 px-5 py-4"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Budget mensuel (FCFA) — vider le champ retire l&apos;enveloppe</span>
      <input
        name="montant"
        autoFocus
        inputMode="numeric"
        defaultValue={budget ? String(budget) : ""}
        placeholder="0"
        aria-label="Budget mensuel en FCFA"
        onKeyDown={(e) => e.key === "Escape" && setEdition(false)}
        className="chiffres h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-right text-sm outline-none focus:border-marque-500"
      />
      </label>
      {resultat && !resultat.ok && <Retour resultat={resultat} />}
      <div className="flex justify-end">
        <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          Enregistrer
        </button>
      </div>
    </form>
      </Fenetre>
    </>
  );
}
