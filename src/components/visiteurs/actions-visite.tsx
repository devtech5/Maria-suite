"use client";

import Link from "next/link";

import { Retour, useOperation } from "@/components/ui/operations";
import { annulerVisite, enregistrerSortie, renvoyerQr } from "@/modules/visiteurs/actions";

/** Boutons d'une visite dans une liste : sortie, badge ; pour un rendez-vous, annuler ou renvoyer le QR. */
export function ActionsVisite({ id, statut, accueillir, telephone }: { id: string; statut: string; accueillir: boolean; telephone?: boolean }) {
  const op = useOperation();
  const bouton = "h-9 rounded-lg px-3 text-sm font-semibold disabled:opacity-50";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {statut === "presente" && accueillir && (
          <>
            <Link href={`/imprimer/badge-visiteur/${id}`} target="_blank" className={`${bouton} inline-flex items-center border border-[var(--filet)] hover:bg-[var(--surface-creuse)]`}>
              Badge
            </Link>
            <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => enregistrerSortie(id))} className={`${bouton} bg-marque-600 text-white hover:bg-marque-700`}>
              Sortie
            </button>
          </>
        )}
        {statut === "attendue" && (
          <>
            {accueillir && (
              <Link href={`/visiteurs/${id}?arrivee=1`} className={`${bouton} inline-flex items-center bg-valide-600 text-white hover:brightness-110`}>
                Arrivée
              </Link>
            )}
            {telephone && (
              <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => renvoyerQr(id))} className={`${bouton} border border-[var(--filet)] hover:bg-[var(--surface-creuse)]`}>
                Renvoyer le QR
              </button>
            )}
            <button
              type="button"
              disabled={op.enCours}
              onClick={() => window.confirm("Annuler ce rendez-vous ?") && op.lancer(() => annulerVisite(id))}
              className={`${bouton} text-danger-600 hover:underline`}
            >
              Annuler
            </button>
          </>
        )}
      </div>
      <Retour resultat={op.resultat} />
    </div>
  );
}
