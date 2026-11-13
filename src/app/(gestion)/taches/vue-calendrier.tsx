"use client";

import { useState } from "react";

import { LIBELLE_STATUT } from "@/modules/taches/calcul";
import { COULEUR_STATUT, deplacerEcheance, estWeekEnd, grilleMois, moisVoisin, ORDRE_STATUTS } from "@/modules/taches/vues";

import { useTaches } from "./contexte";
import type { TacheAffichee } from "./types";

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Puces par case avant le « + N autres ». */
const PUCES_VISIBLES = 3;

/**
 * Le mois en semaines du lundi au dimanche, chaque tâche à son échéance, de
 * la couleur de son état. Une tâche qu'on peut modifier se glisse vers un
 * autre jour : son échéance suit, et son début prévu garde l'écart.
 */
export function VueCalendrier({ taches }: { taches: TacheAffichee[] }) {
  const { aujourdhui, ouvrir, modifiable, retoucher, enCours } = useTaches();
  const [mois, setMois] = useState(aujourdhui.slice(0, 7));
  const [glissee, setGlissee] = useState<TacheAffichee | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [deplie, setDeplie] = useState<string | null>(null);

  const cases = grilleMois(mois);
  const parJour = new Map<string, TacheAffichee[]>();
  for (const t of taches) if (t.echeance) parJour.set(t.echeance, [...(parJour.get(t.echeance) ?? []), t]);
  const sansEcheance = taches.filter((t) => !t.echeance);

  return (
    <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg font-semibold first-letter:uppercase">{MOIS.format(new Date(`${mois}-01T00:00:00Z`))}</h3>
        <button type="button" onClick={() => setMois(aujourdhui.slice(0, 7))} className="h-9 rounded-lg border border-[var(--filet)] px-3 text-sm font-medium hover:bg-[var(--surface-creuse)]">
          Aujourd&apos;hui
        </button>
        <button type="button" aria-label="Mois précédent" onClick={() => setMois((m) => moisVoisin(m, -1))} className="grid size-9 place-items-center rounded-lg border border-[var(--filet)] hover:bg-[var(--surface-creuse)]">
          ‹
        </button>
        <button type="button" aria-label="Mois suivant" onClick={() => setMois((m) => moisVoisin(m, 1))} className="grid size-9 place-items-center rounded-lg border border-[var(--filet)] hover:bg-[var(--surface-creuse)]">
          ›
        </button>
      </div>

      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="grid min-w-[48rem] grid-cols-7 border-l border-t border-[var(--filet)]">
          {JOURS.map((j) => (
            <div key={j} className="border-b border-r border-[var(--filet)] px-2 py-1.5 text-xs text-[var(--encre-douce)]">
              {j}
            </div>
          ))}
          {cases.map(({ jour, duMois }) => {
            const liste = parJour.get(jour) ?? [];
            const tout = deplie === jour;
            const visibles = tout ? liste : liste.slice(0, PUCES_VISIBLES);
            return (
              <div
                key={jour}
                data-jour={jour}
                onDragOver={(e) => {
                  if (!glissee) return;
                  e.preventDefault();
                  if (survol !== jour) setSurvol(jour);
                }}
                onDragLeave={() => setSurvol((s) => (s === jour ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const t = glissee;
                  setGlissee(null);
                  setSurvol(null);
                  if (t && t.echeance !== jour) retoucher(t, deplacerEcheance(t, jour));
                }}
                className={`min-h-[6.5rem] border-b border-r border-[var(--filet)] p-1.5 ${estWeekEnd(jour) ? "bg-[var(--surface-creuse)]/50" : ""} ${
                  survol === jour ? "bg-marque-50 outline outline-2 -outline-offset-2 outline-marque-400" : ""
                }`}
              >
                <p className="mb-1 text-right text-xs">
                  <span
                    className={`chiffres inline-grid min-w-6 place-items-center rounded-full px-1 py-0.5 ${
                      jour === aujourdhui ? "bg-[#579bfc] font-semibold text-white" : duMois ? "" : "text-[var(--encre-faible)]/60"
                    }`}
                  >
                    {Number(jour.slice(8))}
                  </span>
                </p>
                <div className="space-y-1">
                  {visibles.map((t) => {
                    const mobile = modifiable(t) && !enCours;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        draggable={mobile}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", t.id);
                          setGlissee(t);
                        }}
                        onDragEnd={() => {
                          setGlissee(null);
                          setSurvol(null);
                        }}
                        onClick={() => ouvrir(t.id)}
                        title={`${t.titre} — ${LIBELLE_STATUT[t.statut]}`}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-white ${mobile ? "cursor-grab" : ""} ${
                          t.statut === "terminee" || t.statut === "annulee" ? "line-through opacity-80" : ""
                        } ${glissee?.id === t.id ? "opacity-40" : ""}`}
                        style={{ background: COULEUR_STATUT[t.statut] }}
                      >
                        {t.titre}
                      </button>
                    );
                  })}
                  {liste.length > PUCES_VISIBLES && (
                    <button type="button" onClick={() => setDeplie(tout ? null : jour)} className="w-full text-left text-xs font-semibold text-marque-600 hover:underline">
                      {tout ? "Réduire" : `+ ${liste.length - PUCES_VISIBLES} autre${liste.length - PUCES_VISIBLES > 1 ? "s" : ""}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        {ORDRE_STATUTS.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: COULEUR_STATUT[s] }} />
            {LIBELLE_STATUT[s]}
          </span>
        ))}
      </div>

      {sansEcheance.length > 0 && (
        <div className="mt-4 border-t border-[var(--filet)] pt-3">
          <p className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">
            Sans échéance ({sansEcheance.length}) — glissez-en une sur un jour pour la planifier
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sansEcheance.map((t) => (
              <button
                key={t.id}
                type="button"
                draggable={modifiable(t) && !enCours}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", t.id);
                  setGlissee(t);
                }}
                onDragEnd={() => {
                  setGlissee(null);
                  setSurvol(null);
                }}
                onClick={() => ouvrir(t.id)}
                className="max-w-[16rem] truncate rounded px-2 py-1 text-xs font-medium text-white"
                style={{ background: COULEUR_STATUT[t.statut] }}
              >
                {t.titre}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
