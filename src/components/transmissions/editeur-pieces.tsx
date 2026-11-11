"use client";

import { useRef, useState } from "react";

import { CLASSE_CHAMP } from "@/components/ui/primitives";

interface Ligne {
  cle: number;
  designation: string;
  reference: string;
  indice: string;
  exemplaires: number;
  original: boolean;
}

/**
 * Les pièces d'un bordereau, une ligne chacune : désignation, référence,
 * indice de révision (plans), nombre d'exemplaires, original ou copie. La
 * liste part dans un champ caché `pieces`, en JSON.
 */
export function EditeurPieces() {
  const prochaine = useRef(1);
  const [lignes, setLignes] = useState<Ligne[]>([{ cle: 0, designation: "", reference: "", indice: "", exemplaires: 1, original: false }]);
  const modifier = (cle: number, champ: keyof Ligne, valeur: string | number | boolean) => setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, [champ]: valeur } : x)));
  const ajouter = () => {
    const cle = prochaine.current++;
    setLignes((l) => [...l, { cle, designation: "", reference: "", indice: "", exemplaires: 1, original: false }]);
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name="pieces" value={JSON.stringify(lignes.map((l) => ({ designation: l.designation, reference: l.reference, indice: l.indice, exemplaires: l.exemplaires, original: l.original })))} />
      <div className="hidden grid-cols-[1fr_8rem_4rem_4.5rem_5rem_2rem] gap-2 text-xs font-semibold text-[var(--encre-faible)] sm:grid">
        <span>Pièce</span>
        <span>Référence</span>
        <span>Indice</span>
        <span>Ex.</span>
        <span>Original</span>
        <span />
      </div>
      {lignes.map((l, i) => (
        <div key={l.cle} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--filet)] p-2 sm:grid-cols-[1fr_8rem_4rem_4.5rem_5rem_2rem] sm:border-0 sm:p-0">
          <input
            value={l.designation}
            onChange={(e) => modifier(l.cle, "designation", e.target.value)}
            placeholder={i === 0 ? "Plan de masse, contrat, rapport d'essai…" : "Pièce"}
            maxLength={200}
            aria-label={`Pièce ${i + 1}`}
            className={`${CLASSE_CHAMP} col-span-2 sm:col-span-1`}
          />
          <input value={l.reference} onChange={(e) => modifier(l.cle, "reference", e.target.value)} placeholder="Réf." maxLength={80} aria-label={`Référence ${i + 1}`} className={CLASSE_CHAMP} />
          <input value={l.indice} onChange={(e) => modifier(l.cle, "indice", e.target.value.toUpperCase())} placeholder="A" maxLength={8} aria-label={`Indice ${i + 1}`} className={`${CLASSE_CHAMP} uppercase`} />
          <input
            type="number"
            min={1}
            max={999}
            value={l.exemplaires}
            onChange={(e) => modifier(l.cle, "exemplaires", Math.max(1, Number(e.target.value) || 1))}
            aria-label={`Exemplaires ${i + 1}`}
            className={`${CLASSE_CHAMP} chiffres`}
          />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={l.original} onChange={(e) => modifier(l.cle, "original", e.target.checked)} className="accent-marque-600" /> Original
          </label>
          <button
            type="button"
            aria-label={`Retirer la pièce ${i + 1}`}
            disabled={lignes.length === 1}
            onClick={() => setLignes((x) => x.filter((y) => y.cle !== l.cle))}
            className="text-lg text-[var(--encre-faible)] hover:text-danger-600 disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={ajouter} className="text-sm font-semibold text-marque-600 hover:underline">
        + Ajouter une pièce
      </button>
    </div>
  );
}
