"use client";

import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { ecartAvancement, effectifTotal, LIBELLE_METEO, METEOS, NUMERO_REUNION_MAX, type DonneesChantier } from "@/modules/pv/regles";

const libelle = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";
const retirer = "grid size-8 place-items-center rounded-md text-[var(--encre-faible)] hover:bg-danger-50 hover:text-danger-600";
const ajouter = "mt-2 text-sm font-semibold text-marque-600 hover:underline";

/** Un entier saisi, ou `null` pour un champ vidé. */
const nombre = (v: string, min: number, max: number): number | null => {
  if (v.trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/**
 * Ce qu'un PV de chantier porte en plus : le projet et le n° de la réunion,
 * les conditions du jour (météo, effectifs par entreprise), l'avancement lot
 * par lot et la prochaine réunion.
 */
export function SectionChantier({
  projets,
  projetId,
  onProjet,
  numeroReunion,
  onNumero,
  valeur,
  onChange,
}: {
  projets: { id: string; code: string; nom: string }[];
  projetId: string | null;
  onProjet: (id: string | null) => void;
  numeroReunion: number | null;
  onNumero: (n: number | null) => void;
  valeur: DonneesChantier;
  onChange: (v: DonneesChantier) => void;
}) {
  const v = valeur;
  const effectifs = (e: DonneesChantier["effectifs"]) => onChange({ ...v, effectifs: e });
  const avancement = (a: DonneesChantier["avancement"]) => onChange({ ...v, avancement: a });
  const total = effectifTotal(v.effectifs);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <label className="block">
          <span className={libelle}>Projet (le chantier)</span>
          <select value={projetId ?? ""} onChange={(e) => onProjet(e.target.value || null)} className={CLASSE_CHAMP}>
            <option value="">Choisir le projet…</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={libelle}>Réunion n°</span>
          <input type="number" min={1} max={NUMERO_REUNION_MAX} value={numeroReunion ?? ""} onChange={(e) => onNumero(nombre(e.target.value, 1, NUMERO_REUNION_MAX))} className={CLASSE_CHAMP} />
        </label>
      </div>

      <fieldset>
        <legend className={libelle}>Météo du jour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {METEOS.map((m) => (
            <label key={m} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${v.meteo === m ? "border-marque-600 font-semibold ring-1 ring-marque-600" : "border-[var(--filet)] hover:bg-[var(--surface-creuse)]"}`}>
              <input type="radio" name="meteo" checked={v.meteo === m} onChange={() => onChange({ ...v, meteo: m })} className="sr-only" />
              {LIBELLE_METEO[m]}
            </label>
          ))}
          <label className="ml-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.intemperies} onChange={(e) => onChange({ ...v, intemperies: e.target.checked })} className="size-4" />
            Travaux interrompus par les intempéries
          </label>
        </div>
      </fieldset>

      <div>
        <p className={libelle}>Effectifs présents sur le chantier</p>
        <ul className="space-y-2">
          {v.effectifs.map((e, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_5.5rem_2rem] items-center gap-2">
              <input value={e.entreprise} onChange={(x) => effectifs(v.effectifs.map((y, j) => (j === i ? { ...y, entreprise: x.target.value } : y)))} placeholder="Entreprise ou équipe" aria-label={`Effectif ${i + 1} : entreprise`} className={`${CLASSE_CHAMP} h-9`} />
              <input value={e.lot} onChange={(x) => effectifs(v.effectifs.map((y, j) => (j === i ? { ...y, lot: x.target.value } : y)))} placeholder="Lot, corps d'état" aria-label={`Effectif ${i + 1} : lot`} className={`${CLASSE_CHAMP} h-9`} />
              <input
                type="number"
                min={0}
                value={e.nombre}
                onChange={(x) => effectifs(v.effectifs.map((y, j) => (j === i ? { ...y, nombre: nombre(x.target.value, 0, 100_000) ?? 0 } : y)))}
                aria-label={`Effectif ${i + 1} : nombre de personnes`}
                className={`${CLASSE_CHAMP} chiffres h-9 px-2 text-right`}
              />
              <button type="button" onClick={() => effectifs(v.effectifs.filter((_, j) => j !== i))} aria-label={`Retirer l'effectif ${i + 1}`} className={retirer}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => effectifs([...v.effectifs, { entreprise: "", lot: "", nombre: 0 }])} className={ajouter}>
            + Ajouter une entreprise
          </button>
          {v.effectifs.length > 0 && (
            <span className="chiffres mt-2 text-sm">
              Total : <strong>{total}</strong> personne{total > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div>
        <p className={libelle}>Avancement des travaux, lot par lot (en %)</p>
        <ul className="space-y-2">
          {v.avancement.map((a, i) => {
            const ecart = ecartAvancement(a);
            return (
              <li key={i} className="rounded-lg border border-[var(--filet)] p-2">
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_2rem] items-center gap-2">
                  <input value={a.lot} onChange={(x) => avancement(v.avancement.map((y, j) => (j === i ? { ...y, lot: x.target.value } : y)))} placeholder="Lot, ouvrage" aria-label={`Lot ${i + 1}`} className={`${CLASSE_CHAMP} h-9`} />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={a.prevu ?? ""}
                    onChange={(x) => avancement(v.avancement.map((y, j) => (j === i ? { ...y, prevu: nombre(x.target.value, 0, 100) } : y)))}
                    placeholder="Prévu"
                    title="Avancement prévu au planning, en %"
                    aria-label={`Lot ${i + 1} : prévu en %`}
                    className={`${CLASSE_CHAMP} chiffres h-9 px-2 text-right`}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={a.realise}
                    onChange={(x) => avancement(v.avancement.map((y, j) => (j === i ? { ...y, realise: nombre(x.target.value, 0, 100) ?? 0 } : y)))}
                    title="Avancement constaté, en %"
                    aria-label={`Lot ${i + 1} : réalisé en %`}
                    className={`${CLASSE_CHAMP} chiffres h-9 px-2 text-right font-semibold`}
                  />
                  <button type="button" onClick={() => avancement(v.avancement.filter((_, j) => j !== i))} aria-label={`Retirer le lot ${i + 1}`} className={retirer}>
                    ×
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-creuse)]">
                    <div className={`h-full rounded-full ${ecart?.retard ? "bg-alerte-500" : "bg-valide-500"}`} style={{ width: `${a.realise}%` }} />
                  </div>
                  {ecart && (
                    <span className={`chiffres text-xs font-semibold ${ecart.retard ? "text-alerte-600" : "text-[var(--encre-faible)]"}`}>
                      {ecart.points > 0 ? "+" : ""}
                      {ecart.points} pt{Math.abs(ecart.points) > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <input
                  value={a.observation}
                  onChange={(x) => avancement(v.avancement.map((y, j) => (j === i ? { ...y, observation: x.target.value } : y)))}
                  placeholder="Observation : travaux de la semaine, réserve, cause d'un retard…"
                  aria-label={`Lot ${i + 1} : observation`}
                  className={`${CLASSE_CHAMP} mt-2 h-9`}
                />
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => avancement([...v.avancement, { lot: "", prevu: null, realise: 0, observation: "" }])} className={ajouter}>
          + Ajouter un lot
        </button>
      </div>

      <fieldset>
        <legend className={libelle}>Prochaine réunion</legend>
        <div className="grid gap-2 sm:grid-cols-[10rem_7rem_minmax(0,1fr)]">
          <input type="date" value={v.prochaineReunion.date ?? ""} onChange={(e) => onChange({ ...v, prochaineReunion: { ...v.prochaineReunion, date: e.target.value || null } })} aria-label="Prochaine réunion : date" className={`${CLASSE_CHAMP} h-9 px-2`} />
          <input type="time" value={v.prochaineReunion.heure ?? ""} onChange={(e) => onChange({ ...v, prochaineReunion: { ...v.prochaineReunion, heure: e.target.value || null } })} aria-label="Prochaine réunion : heure" className={`${CLASSE_CHAMP} h-9 px-2`} />
          <input value={v.prochaineReunion.lieu} onChange={(e) => onChange({ ...v, prochaineReunion: { ...v.prochaineReunion, lieu: e.target.value } })} maxLength={120} placeholder="Lieu : base vie, bureau de chantier…" aria-label="Prochaine réunion : lieu" className={`${CLASSE_CHAMP} h-9`} />
        </div>
      </fieldset>
    </div>
  );
}
