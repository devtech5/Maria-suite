"use client";

import { useState } from "react";

import { Fenetre } from "@/components/ui/fenetre";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { formaterQuantite, type CodeUnite } from "@/lib/quantite";
import { annulerCommande, envoyerCommande, recevoir } from "@/modules/achats/actions";

export function EnvoyerAnnuler({ commandeId, envoyable, annulable }: { commandeId: string; envoyable: boolean; annulable: boolean }) {
  const op = useOperation();
  const [motif, setMotif] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {envoyable && (
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => envoyerCommande(commandeId))} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
            Marquer comme envoyée
          </button>
        )}
        {annulable && motif === null && (
          <button type="button" onClick={() => setMotif("")} className="h-cible rounded-lg px-3 text-sm font-semibold text-danger-600 hover:bg-danger-50">
            Annuler la commande
          </button>
        )}
      </div>
      <Fenetre ouverte={motif !== null} titre="Annuler la commande" onFermer={() => setMotif(null)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => annulerCommande(commandeId, motif ?? ""), () => setMotif(null));
          }}
          className="space-y-4 px-5 py-4"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Motif de l&apos;annulation</span>
            <input autoFocus value={motif ?? ""} onChange={(e) => setMotif(e.target.value)} className={CLASSE_CHAMP} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMotif(null)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
              Retour
            </button>
            <button type="submit" disabled={op.enCours || (motif ?? "").trim().length < 3} className="h-cible rounded-lg bg-danger-500 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
              Annuler la commande
            </button>
          </div>
        </form>
      </Fenetre>
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}

export interface LigneARecevoir {
  id: string;
  designation: string;
  unite: CodeUnite;
  reste: number;
}

/** Bon de réception : on saisit ce qui est réellement arrivé, ligne par ligne. */
export function FormulaireReception({
  commandeId,
  lignes,
  depots,
  depotParDefaut,
  aujourdhui,
}: {
  commandeId: string;
  lignes: LigneARecevoir[];
  depots: { id: string; nom: string }[];
  depotParDefaut: string | null;
  aujourdhui: string;
}) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [date, setDate] = useState(aujourdhui);
  const [depotId, setDepotId] = useState(depotParDefaut ?? depots[0]?.id ?? "");
  const [bordereau, setBordereau] = useState("");

  return (
    <>
      <div>
        <button
          type="button"
          onClick={() => {
            setOuvert(true);
            // Par défaut on propose tout le reste : le cas courant est la livraison complète.
            setQuantites(Object.fromEntries(lignes.map((l) => [l.id, String(l.reste / 1000)])));
          }}
          className="h-cible rounded-lg bg-valide-500 px-3.5 text-sm font-semibold text-white"
        >
          Réceptionner
        </button>
        {op.resultat && <Retour resultat={op.resultat} />}
      </div>
      <Fenetre ouverte={ouvert} titre="Bon de réception" presentation="ample" onFermer={() => setOuvert(false)}>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const converties = Object.fromEntries(
          Object.entries(quantites).map(([id, v]) => [id, Math.round((Number(v.replace(",", ".")) || 0) * 1000)]),
        );
        op.lancer(() => recevoir(commandeId, { date, depotId: depotId || null, bordereau: bordereau || null, quantites: converties }), () => setOuvert(false));
      }}
      className="px-5 py-4"
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CLASSE_CHAMP} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Dépôt</span>
          <select value={depotId} onChange={(e) => setDepotId(e.target.value)} className={CLASSE_CHAMP}>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Bordereau du fournisseur</span>
          <input value={bordereau} onChange={(e) => setBordereau(e.target.value)} maxLength={80} className={CLASSE_CHAMP} />
        </label>
      </div>
      <ul className="divide-y divide-[var(--filet)] rounded-lg border border-[var(--filet)]">
        {lignes.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 text-sm">
              {l.designation}
              <span className="chiffres block text-xs text-[var(--encre-faible)]">reste à recevoir : {formaterQuantite(l.reste, l.unite)}</span>
            </span>
            <input
              inputMode="decimal"
              value={quantites[l.id] ?? ""}
              onChange={(e) => setQuantites({ ...quantites, [l.id]: e.target.value })}
              aria-label={`Quantité reçue — ${l.designation}`}
              className={`${CLASSE_CHAMP_COMPACT} chiffres h-9 w-28 text-right`}
            />
          </li>
        ))}
      </ul>
      {op.resultat && <Retour resultat={op.resultat} />}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-valide-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Enregistrer la réception"}
        </button>
      </div>
    </form>
      </Fenetre>
    </>
  );
}
