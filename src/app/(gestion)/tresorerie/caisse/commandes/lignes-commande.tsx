"use client";

import { useState } from "react";

import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { lireLignes, montantLigne, totalCommande } from "@/modules/tresorerie/commandes-internes";

/** Ligne en cours de saisie : les nombres restent du texte tant qu'on tape. */
interface LigneSaisie {
  cle: number;
  rubrique: string;
  designation: string;
  quantite: string;
  prixUnitaire: string;
}

let compteur = 0;
const ligneVide = (rubrique = ""): LigneSaisie => ({ cle: compteur++, rubrique, designation: "", quantite: "1", prixUnitaire: "" });

/**
 * Lignes du bon : rubrique, désignation, quantité, prix unitaire. Le total
 * se calcule comme le serveur le refera ; les lignes partent en JSON dans
 * le champ caché `lignes`.
 */
export function LignesCommande() {
  const [lignes, setLignes] = useState<LigneSaisie[]>(() => [ligneVide()]);
  const maj = (cle: number, patch: Partial<LigneSaisie>) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)));
  const lues = lireLignes(lignes);
  const total = typeof lues === "string" ? null : totalCommande(lues);
  const rubriques = [...new Set(lignes.map((l) => l.rubrique.trim()).filter(Boolean))];

  return (
    <div className="space-y-2">
      <input type="hidden" name="lignes" value={JSON.stringify(lignes.map(({ rubrique, designation, quantite, prixUnitaire }) => ({ rubrique, designation, quantite, prixUnitaire })))} />
      <datalist id="rubriques-commande">
        {rubriques.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 text-xs font-semibold text-[var(--encre-faible)] md:grid">
        <span>Rubrique</span>
        <span>Désignation</span>
        <span>Qté</span>
        <span>Prix unitaire (F)</span>
        <span className="text-right">Montant</span>
        <span className="w-8" />
      </div>
      {lignes.map((l, i) => {
        const une = lireLignes([l]);
        const montant = typeof une === "string" ? null : montantLigne(une[0]);
        return (
          <div
            key={l.cle}
            className="grid gap-2 rounded-lg border border-[var(--filet)] p-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:border-0 md:p-0"
          >
            <input
              aria-label={`Rubrique, ligne ${i + 1}`}
              list="rubriques-commande"
              value={l.rubrique}
              onChange={(e) => maj(l.cle, { rubrique: e.target.value })}
              placeholder="Achat d'ordinateurs"
              maxLength={120}
              className={`${CLASSE_CHAMP} h-9 text-sm`}
            />
            <input
              aria-label={`Désignation, ligne ${i + 1}`}
              value={l.designation}
              onChange={(e) => maj(l.cle, { designation: e.target.value })}
              placeholder="Ordinateur — poste Technicien"
              maxLength={200}
              className={`${CLASSE_CHAMP} h-9 text-sm`}
            />
            <input aria-label={`Quantité, ligne ${i + 1}`} inputMode="numeric" value={l.quantite} onChange={(e) => maj(l.cle, { quantite: e.target.value })} className={`${CLASSE_CHAMP} chiffres h-9 text-right text-sm`} />
            <input aria-label={`Prix unitaire, ligne ${i + 1}`} inputMode="numeric" value={l.prixUnitaire} onChange={(e) => maj(l.cle, { prixUnitaire: e.target.value })} className={`${CLASSE_CHAMP} chiffres h-9 text-right text-sm`} />
            <span className="chiffres text-right text-sm font-semibold">{montant === null ? "—" : `${fmt(montant)} F`}</span>
            <button
              type="button"
              aria-label={`Retirer la ligne ${i + 1}`}
              disabled={lignes.length === 1}
              onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
              className="h-8 w-8 rounded-lg text-[var(--encre-faible)] hover:bg-danger-50 hover:text-danger-600 disabled:opacity-30"
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => setLignes((ls) => [...ls, ligneVide(ls.at(-1)?.rubrique ?? "")])}
          className="rounded-lg border border-[var(--filet)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
        >
          + Ajouter une ligne
        </button>
        <p className="text-sm">
          Total : <strong className="chiffres">{total === null ? "—" : `${fmt(total)} FCFA`}</strong>
        </p>
      </div>
      {typeof lues === "string" && lignes.some((l) => l.designation.trim()) && <p className="text-xs text-alerte-600">{lues}</p>}
    </div>
  );
}
