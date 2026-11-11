"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { enregistrerArriveeAttendue } from "@/modules/visiteurs/actions";

import { ChampsVisite, type ValeursVisite } from "./champs-visite";

/** Arrivée d'un visiteur attendu : on vérifie ce qui a été annoncé, on relève sa pièce. */
export function ArriveeAttendue({ visiteId, valeurs, personnes, pieceExigee }: { visiteId: string; valeurs: ValeursVisite; personnes: { id: string; nom: string }[]; pieceExigee: boolean }) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        demarrer(async () => {
          const r = await enregistrerArriveeAttendue(visiteId, donnees);
          setResultat(r);
          if (r.ok) routeur.replace(`/visiteurs/${visiteId}`);
        });
      }}
      className="space-y-4 rounded-2xl border border-valide-600/30 bg-[var(--surface)] p-5 shadow-sm"
    >
      <h2 className="text-lg font-bold">Enregistrer l&apos;arrivée</h2>
      <ChampsVisite personnes={personnes} valeurs={valeurs} arrivee pieceExigee={pieceExigee} />
      <Retour resultat={resultat} />
      <div className="flex justify-end">
        <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          {enCours ? "Enregistrement…" : "Enregistrer l'arrivée"}
        </button>
      </div>
    </form>
  );
}
