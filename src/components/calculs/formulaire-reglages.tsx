"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { enregistrerReglagesCalculs } from "@/modules/calculs/actions";
import {
  AGGLOS,
  CLES_AGGLOS,
  CLES_OUVRAGES,
  OUVRAGES_BETON,
  REGLAGES_DEFAUT,
  centiemes,
  lireDecimal,
  type ReglagesCalculs,
} from "@/modules/calculs/regles";

/**
 * Ratios de l'entreprise. Chaque case est un entier ; seul « blocs par m² »
 * accepte deux décimales (12,5), stockées en centièmes. Une saisie illisible
 * part telle quelle (NaN devient null en JSON) et le serveur la refuse avec
 * son libellé.
 */

const BOUTON = "h-cible rounded-lg px-3.5 text-sm font-semibold disabled:opacity-50";
const PRINCIPAL = `${BOUTON} bg-marque-600 text-white hover:bg-marque-700`;
const SECONDAIRE = `${BOUTON} border border-[var(--filet)] bg-[var(--surface)] font-medium hover:bg-[var(--surface-creuse)]`;
const CASE = `${CLASSE_CHAMP} chiffres min-w-[5rem]`;

type Textes = Record<string, string>;

function versTextes(r: ReglagesCalculs): Textes {
  const t: Textes = {
    sacCimentKg: String(r.sacCimentKg),
    barreFerMm: String(r.barreFerMm),
    pertesBetonPct: String(r.pertesBetonPct),
    pertesAgglosPct: String(r.pertesAgglosPct),
    pertesCarrelagePct: String(r.pertesCarrelagePct),
    colleKgParM2: String(r.colleKgParM2),
    sacColleKg: String(r.sacColleKg),
    mortierCarrelageMm: String(r.mortierCarrelageMm),
    "mortier.cimentKg": String(r.mortier.cimentKg),
    "mortier.sableL": String(r.mortier.sableL),
    "mortier.eauL": String(r.mortier.eauL),
  };
  for (const k of CLES_OUVRAGES) for (const [c, v] of Object.entries(r.beton[k])) t[`beton.${k}.${c}`] = String(v);
  for (const k of CLES_AGGLOS) {
    t[`agglos.${k}.centiemesParM2`] = centiemes(r.agglos[k].centiemesParM2);
    t[`agglos.${k}.mortierLParM2`] = String(r.agglos[k].mortierLParM2);
  }
  return t;
}

function versValeurs(t: Textes): unknown {
  const e = (cle: string) => lireDecimal(t[cle] ?? "", 0) ?? NaN;
  return {
    sacCimentKg: e("sacCimentKg"),
    barreFerMm: e("barreFerMm"),
    pertesBetonPct: e("pertesBetonPct"),
    pertesAgglosPct: e("pertesAgglosPct"),
    pertesCarrelagePct: e("pertesCarrelagePct"),
    colleKgParM2: e("colleKgParM2"),
    sacColleKg: e("sacColleKg"),
    mortierCarrelageMm: e("mortierCarrelageMm"),
    mortier: { cimentKg: e("mortier.cimentKg"), sableL: e("mortier.sableL"), eauL: e("mortier.eauL") },
    beton: Object.fromEntries(
      CLES_OUVRAGES.map((k) => [
        k,
        { cimentKg: e(`beton.${k}.cimentKg`), sableL: e(`beton.${k}.sableL`), gravierL: e(`beton.${k}.gravierL`), eauL: e(`beton.${k}.eauL`), ferKg: e(`beton.${k}.ferKg`) },
      ]),
    ),
    agglos: Object.fromEntries(
      CLES_AGGLOS.map((k) => [k, { centiemesParM2: lireDecimal(t[`agglos.${k}.centiemesParM2`] ?? "", 2) ?? NaN, mortierLParM2: e(`agglos.${k}.mortierLParM2`) }]),
    ),
  };
}

export function FormulaireReglagesCalculs({ reglages, verifie }: { reglages: ReglagesCalculs; verifie: boolean }) {
  const op = useOperation();
  const [textes, setTextes] = useState<Textes>(() => versTextes(reglages));
  const [atteste, setAtteste] = useState(verifie);

  const valeur = (cle: string, libelle: string) => (
    <input aria-label={libelle} inputMode="decimal" value={textes[cle] ?? ""} onChange={(ev) => setTextes((t) => ({ ...t, [cle]: ev.target.value }))} className={CASE} />
  );

  const ligne = (libelle: string, cle: string, unite: string) => (
    <label className="grid grid-cols-[1fr_7rem_3.5rem] items-center gap-2 text-sm">
      <span>{libelle}</span>
      {valeur(cle, libelle)}
      <span className="text-xs text-[var(--encre-faible)]">{unite}</span>
    </label>
  );

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        op.lancer(() => enregistrerReglagesCalculs(JSON.stringify(versValeurs(textes)), atteste));
      }}
      className="space-y-6 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5"
    >
      <section>
        <h2 className="text-sm font-semibold">Béton, par m³ en place</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--encre-faible)]">
                <th className="py-1 pr-2 font-medium">Ouvrage</th>
                <th className="px-1 font-medium">Ciment (kg)</th>
                <th className="px-1 font-medium">Sable (L)</th>
                <th className="px-1 font-medium">Gravier (L)</th>
                <th className="px-1 font-medium">Eau (L)</th>
                <th className="px-1 font-medium">Fer (kg)</th>
              </tr>
            </thead>
            <tbody>
              {CLES_OUVRAGES.map((k) => (
                <tr key={k}>
                  <td className="py-1 pr-2">{OUVRAGES_BETON[k]}</td>
                  {(["cimentKg", "sableL", "gravierL", "eauL", "ferKg"] as const).map((c) => (
                    <td key={c} className="px-1 py-1">
                      {valeur(`beton.${k}.${c}`, `${OUVRAGES_BETON[k]}, ${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 sm:max-w-md">
          {ligne("Pertes au coulage", "pertesBetonPct", "%")}
          {ligne("Sac de ciment", "sacCimentKg", "kg")}
          {ligne("Barre de fer", "barreFerMm", "mm")}
        </div>
      </section>

      <section className="border-t border-[var(--filet)] pt-4">
        <h2 className="text-sm font-semibold">Agglos et mortier</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--encre-faible)]">
                <th className="py-1 pr-2 font-medium">Agglo</th>
                <th className="px-1 font-medium">Blocs par m²</th>
                <th className="px-1 font-medium">Mortier (L/m²)</th>
              </tr>
            </thead>
            <tbody>
              {CLES_AGGLOS.map((k) => (
                <tr key={k}>
                  <td className="py-1 pr-2">{AGGLOS[k]}</td>
                  <td className="px-1 py-1">{valeur(`agglos.${k}.centiemesParM2`, `${AGGLOS[k]}, blocs par m²`)}</td>
                  <td className="px-1 py-1">{valeur(`agglos.${k}.mortierLParM2`, `${AGGLOS[k]}, mortier`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 sm:max-w-md">
          {ligne("Casse et coupes des agglos", "pertesAgglosPct", "%")}
          {ligne("Mortier : ciment par m³", "mortier.cimentKg", "kg")}
          {ligne("Mortier : sable par m³", "mortier.sableL", "L")}
          {ligne("Mortier : eau par m³", "mortier.eauL", "L")}
        </div>
      </section>

      <section className="border-t border-[var(--filet)] pt-4">
        <h2 className="text-sm font-semibold">Carrelage</h2>
        <div className="mt-3 grid gap-2 sm:max-w-md">
          {ligne("Coupes et casse", "pertesCarrelagePct", "%")}
          {ligne("Colle par m²", "colleKgParM2", "kg")}
          {ligne("Sac de colle", "sacColleKg", "kg")}
          {ligne("Lit de mortier (pose au mortier)", "mortierCarrelageMm", "mm")}
        </div>
      </section>

      <section className="border-t border-[var(--filet)] pt-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={atteste} onChange={(ev) => setAtteste(ev.target.checked)} className="mt-0.5" />
          <span>
            J&apos;atteste que ces ratios correspondent à la pratique de nos chantiers.
            <span className="block text-xs text-[var(--encre-faible)]">Sans attestation, les calculs affichent « ratios à vérifier ». Changer un ratio demande de l&apos;attester de nouveau.</span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="button" onClick={() => setTextes(versTextes(REGLAGES_DEFAUT))} className={SECONDAIRE}>
          Revenir aux valeurs de départ
        </button>
        <button type="submit" disabled={op.enCours} className={PRINCIPAL}>
          {op.enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
