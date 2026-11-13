"use client";

import { useState } from "react";

import { CLASSE_CHAMP } from "@/components/ui/primitives";

export interface Membre {
  userId: string;
  nom: string;
  role: string | null;
}

/**
 * Champs d'un dossier partagé : nom, visibilité, membres désignés, dépôt.
 *
 * Les cases portent `name="membres"` : le formulaire part tel quel vers
 * l'action serveur, qui remplace les désignations d'un bloc.
 */
export function ChampsDossier({
  membres,
  initial,
}: {
  membres: Membre[];
  initial?: {
    nom: string;
    description: string | null;
    visibilite: "tous" | "selection";
    depotOuvert: boolean;
    designes: string[];
    deposants?: string[];
  };
}) {
  const [visibilite, setVisibilite] = useState<"tous" | "selection">(initial?.visibilite ?? "selection");
  const [designes, setDesignes] = useState<string[]>(initial?.designes ?? []);
  // Qui dépose : les administrateurs seuls, tous ceux qui voient, ou certains membres cochés un à un.
  const [depot, setDepot] = useState<"admins" | "tous" | "certains">(initial?.depotOuvert ? "tous" : (initial?.deposants?.length ?? 0) > 0 ? "certains" : "admins");
  const [deposants, setDeposants] = useState<string[]>(initial?.deposants ?? []);

  const basculer = (id: string) =>
    setDesignes((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  // Déposer suppose de voir : cocher « dépose » ajoute le membre aux désignés d'un dossier à sélection.
  const basculerDepot = (id: string) => {
    setDeposants((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
    if (visibilite === "selection") setDesignes((v) => (v.includes(id) ? v : [...v, id]));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Nom du dossier</span>
          <input name="nom" required minLength={2} maxLength={80} defaultValue={initial?.nom} placeholder="Contrats fournisseurs, Notes de service…" className={CLASSE_CHAMP} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Description</span>
          <input name="description" maxLength={500} defaultValue={initial?.description ?? ""} placeholder="Ce qu'on y range" className={CLASSE_CHAMP} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-[var(--encre-faible)]">Qui voit ce dossier ?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["selection", "Les membres choisis", "Personne de coché : dossier masqué, visible des seuls administrateurs."],
              ["tous", "Tous les membres", "Y compris ceux qui rejoindront l'entreprise plus tard."],
            ] as const
          ).map(([valeur, titre, aide]) => (
            <label
              key={valeur}
              className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 ${
                visibilite === valeur ? "border-marque-500 bg-[var(--surface-creuse)]" : "border-[var(--filet)]"
              }`}
            >
              <input
                type="radio"
                name="visibilite"
                value={valeur}
                checked={visibilite === valeur}
                onChange={() => setVisibilite(valeur)}
                className="mt-0.5 accent-marque-600"
              />
              <span>
                <span className="block text-sm font-medium">{titre}</span>
                <span className="block text-xs text-[var(--encre-faible)]">{aide}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {visibilite === "selection" && (
        <fieldset className="rounded-lg border border-[var(--filet)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--encre-faible)]">
            Visible de {designes.length} membre{designes.length > 1 ? "s" : ""} sur {membres.length}
          </legend>
          <div className="mb-2 flex gap-3 text-xs">
            <button type="button" onClick={() => setDesignes(membres.map((m) => m.userId))} className="font-semibold text-marque-600 hover:underline">
              Tout cocher
            </button>
            <button type="button" onClick={() => setDesignes([])} className="font-semibold text-[var(--encre-faible)] hover:underline">
              Masquer à tous
            </button>
          </div>
          <ul className="grid max-h-60 gap-1 overflow-y-auto sm:grid-cols-2">
            {membres.map((m) => (
              <li key={m.userId}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--surface-creuse)]">
                  <input
                    type="checkbox"
                    name="membres"
                    value={m.userId}
                    checked={designes.includes(m.userId)}
                    onChange={() => basculer(m.userId)}
                    className="accent-marque-600"
                  />
                  <span className="min-w-0 truncate text-sm">
                    {m.nom}
                    {m.role && <span className="text-xs text-[var(--encre-faible)]"> · {m.role}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-[var(--encre-faible)]">Qui peut y déposer ?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["admins", "Les administrateurs", "Lecture seule pour tous les autres."],
              ["certains", "Certains membres", "Vous cochez qui dépose ; les autres lisent."],
              ["tous", "Tous ceux qui le voient", "Chacun de ceux qui le voient peut y déposer."],
            ] as const
          ).map(([valeur, titre, aide]) => (
            <label
              key={valeur}
              className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 ${depot === valeur ? "border-marque-500 bg-[var(--surface-creuse)]" : "border-[var(--filet)]"}`}
            >
              <input type="radio" name="depot" value={valeur} checked={depot === valeur} onChange={() => setDepot(valeur)} className="mt-0.5 accent-marque-600" />
              <span>
                <span className="block text-sm font-medium">{titre}</span>
                <span className="block text-xs text-[var(--encre-faible)]">{aide}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {depot === "certains" && (
        <fieldset className="rounded-lg border border-[var(--filet)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--encre-faible)]">
            {deposants.length} membre{deposants.length > 1 ? "s" : ""} déposent sur {membres.length}
          </legend>
          <div className="mb-2 flex gap-3 text-xs">
            <button type="button" onClick={() => setDeposants([])} className="font-semibold text-[var(--encre-faible)] hover:underline">
              Personne
            </button>
          </div>
          <ul className="grid max-h-60 gap-1 overflow-y-auto sm:grid-cols-2">
            {membres.map((m) => (
              <li key={m.userId}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--surface-creuse)]">
                  <input type="checkbox" name="deposants" value={m.userId} checked={deposants.includes(m.userId)} onChange={() => basculerDepot(m.userId)} className="accent-marque-600" />
                  <span className="min-w-0 truncate text-sm">
                    {m.nom}
                    {m.role && <span className="text-xs text-[var(--encre-faible)]"> · {m.role}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--encre-faible)]">Un membre qui dépose voit aussi le dossier.</p>
        </fieldset>
      )}
    </div>
  );
}
