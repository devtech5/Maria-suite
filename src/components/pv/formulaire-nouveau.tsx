"use client";

import { useState, useTransition } from "react";

import { Retour, type Resultat } from "@/components/ui/operations";
import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerPv } from "@/modules/pv/actions";
import { LIBELLE_TYPE, OBJET_MAX, TYPES_PV, type TypePv } from "@/modules/pv/regles";

/** Le type, l'objet, la date et le lieu ; la réunion Meeting dont on rend compte, s'il y en a une. */
export function FormulaireNouveauPv({ reunions, reunionInitiale, aujourdhui }: { reunions: { id: string; numero: string; titre: string; jour: string }[]; reunionInitiale: string; aujourdhui: string }) {
  const [reunion, setReunion] = useState(reunionInitiale);
  const [type, setType] = useState<TypePv>("reunion");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const choisie = reunions.find((r) => r.id === reunion);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        setResultat(null);
        demarrer(async () => {
          const r = await creerPv(donnees);
          if (r && !r.ok) setResultat(r);
        });
      }}
      className="max-w-3xl space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5"
    >
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">Nature du document</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES_PV.map((t) => (
            <label key={t} className={`cursor-pointer rounded-lg border p-3 text-sm font-semibold ${type === t ? "border-marque-600 ring-1 ring-marque-600" : "border-[var(--filet)] hover:bg-[var(--surface-creuse)]"}`}>
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
              {LIBELLE_TYPE[t]}
            </label>
          ))}
        </div>
      </fieldset>

      {reunions.length > 0 && (
        <Champ libelle="Réunion Meeting (facultatif)" precision="Le PV en reprend l'objet, les présents et les absents, et le compte rendu déjà écrit.">
          <select name="reunionId" value={reunion} onChange={(e) => setReunion(e.target.value)} className={CLASSE_CHAMP}>
            <option value="">Aucune — saisie libre</option>
            {reunions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.numero} — {r.titre} ({r.jour.split("-").reverse().join("/")})
              </option>
            ))}
          </select>
        </Champ>
      )}

      <Champ libelle="Objet" precision={choisie ? "Laissé vide, il reprend le titre de la réunion." : undefined}>
        <input name="objet" maxLength={OBJET_MAX} required={!choisie} placeholder={choisie?.titre ?? "Réunion de chantier n° 4 — Bingerville"} className={CLASSE_CHAMP} />
      </Champ>

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Date de la séance">
          <input key={choisie?.jour ?? aujourdhui} type="date" name="dateSeance" required defaultValue={choisie?.jour ?? aujourdhui} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Lieu (facultatif)">
          <input name="lieu" maxLength={120} placeholder="Siège, Cocody Angré" className={CLASSE_CHAMP} />
        </Champ>
      </div>

      <Retour resultat={resultat} />
      <div className="flex justify-end">
        <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          {enCours ? "Ouverture…" : "Ouvrir le brouillon"}
        </button>
      </div>
    </form>
  );
}
