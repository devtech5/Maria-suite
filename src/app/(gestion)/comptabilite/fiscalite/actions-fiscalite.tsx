"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { cloturerExercice, declarerTva, payerTva } from "@/modules/fiscalite/actions";
import { Fenetre } from "@/components/ui/fenetre";

interface Compte {
  id: string;
  nom: string;
  nature: string;
  solde: number;
}

/**
 * Le geste du mois : déclarer — avec confirmation, la déclaration verrouille
 * le mois — ou payer ce qu'elle a liquidé.
 */
export function ActionTva({
  mois,
  geste,
  aPayer,
  comptes,
  aujourdhui,
}: {
  mois: string;
  geste: "declarer" | "payer";
  aPayer: number;
  comptes: Compte[];
  aujourdhui: string;
}) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [compte, setCompte] = useState(comptes.find((c) => c.nature === "banque")?.id ?? comptes[0]?.id ?? "");
  const [date, setDate] = useState(aujourdhui);

  if (geste === "declarer") {
    return (
      <div className="flex flex-col items-end gap-1">
        {!ouvert ? (
          <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg bg-marque-600 px-3 text-xs font-semibold text-white">
            Déclarer
          </button>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="text-alerte-600">Le mois sera verrouillé pour la TVA.</span>
            <button
              type="button"
              disabled={op.enCours}
              onClick={() => op.lancer(() => declarerTva(mois), () => setOuvert(false))}
              className="h-9 rounded-lg bg-marque-600 px-3 font-semibold text-white disabled:opacity-50"
            >
              {op.enCours ? "Dépôt…" : "Confirmer"}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-[var(--encre-faible)] hover:underline">
              Retour
            </button>
          </span>
        )}
        {op.resultat && <Retour resultat={op.resultat} />}
      </div>
    );
  }

  if (comptes.length === 0) return <span className="text-xs text-alerte-600">Aucun compte de trésorerie</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg bg-valide-500 px-3 text-xs font-semibold text-white">
        Payer {fmt(aPayer)} F
      </button>
      <Fenetre ouverte={ouvert} titre={`Payer la TVA — ${fmt(aPayer)} F`} onFermer={() => setOuvert(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => payerTva(mois, { compteTresorerieId: compte, date }), () => setOuvert(false));
          }}
          className="space-y-4 px-5 py-4"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Payé depuis</span>
            <select value={compte} onChange={(e) => setCompte(e.target.value)} className={CLASSE_CHAMP}>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} — {fmt(c.solde)} F
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Date du paiement</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CLASSE_CHAMP} />
          </label>
          {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOuvert(false)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
              Retour
            </button>
            <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-valide-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {op.enCours ? "Paiement…" : "Payer"}
            </button>
          </div>
        </form>
      </Fenetre>
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}

/** Clôturer un exercice : irréversible, donc confirmé. */
export function CloturerExercice({ exercice, resultat }: { exercice: string; resultat: number }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      {!ouvert ? (
        <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg border border-[var(--filet)] px-3 text-xs font-semibold hover:bg-[var(--surface-creuse)]">
          Clôturer {exercice}
        </button>
      ) : (
        <span className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-alerte-500 bg-alerte-50 px-3 py-2 text-xs text-alerte-600">
          {resultat >= 0 ? `Bénéfice de ${fmt(resultat)} F porté en 131` : `Perte de ${fmt(-resultat)} F portée en 139`}. Plus aucune écriture ne pourra être datée de {exercice}.
          <button
            type="button"
            disabled={op.enCours}
            onClick={() => op.lancer(() => cloturerExercice(exercice), () => setOuvert(false))}
            className="rounded-lg bg-marque-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            {op.enCours ? "Clôture…" : "Confirmer la clôture"}
          </button>
          <button type="button" onClick={() => setOuvert(false)} className="hover:underline">
            Retour
          </button>
        </span>
      )}
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}
