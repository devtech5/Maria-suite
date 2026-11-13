"use client";

import { useState, type CSSProperties } from "react";

import { comparerTaches, LIBELLE_STATUT, type Statut } from "@/modules/taches/calcul";
import { COULEUR_STATUT, gesteVers, ORDRE_STATUTS } from "@/modules/taches/vues";

import { useTaches } from "./contexte";
import { CorpsCarte, titreBarre } from "./elements";
import { Avancement } from "./sous-taches";
import type { TacheAffichee } from "./types";

const trier = (liste: TacheAffichee[]) =>
  [...liste].sort((a, b) => comparerTaches({ ...a, creeLe: a.creeLeIso }, { ...b, creeLe: b.creeLeIso }));

function EnTeteCarte({ t }: { t: TacheAffichee }) {
  const { ouvrir } = useTaches();
  return (
    <div className="mb-2.5 flex items-start gap-2">
      <button type="button" onClick={() => ouvrir(t.id)} className="min-w-0 flex-1 text-left" title="Ouvrir la fiche">
        <span className={`block text-[15px] font-bold leading-snug hover:text-marque-600 ${titreBarre(t)}`}>{t.titre}</span>
        <span className="chiffres mt-0.5 block text-xs text-[var(--encre-faible)]">{t.numero}</span>
      </button>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Avancement t={t} />
        {t.nbMessages > 0 && (
          <button type="button" onClick={() => ouvrir(t.id, "mises-a-jour")} className="text-[11px] font-semibold text-[#1f76f0] hover:underline">
            {t.nbMessages} mise{t.nbMessages > 1 ? "s" : ""} à jour
          </button>
        )}
      </span>
      <button
        type="button"
        onClick={() => ouvrir(t.id)}
        aria-label={`Ouvrir ${t.numero}`}
        className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--filet)] text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)]"
      >
        +
      </button>
    </div>
  );
}

/** Galerie : une fiche par tâche, ses champs en lignes, chacun modifiable sur place. */
export function VueFiches({ taches }: { taches: TacheAffichee[] }) {
  if (taches.length === 0) return <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Aucune tâche ici.</p>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
      {trier(taches).map((t) => (
        <article key={t.id} className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-3.5 shadow-sm">
          <div className="-mx-3.5 -mt-3.5 mb-3 h-1.5 rounded-t-xl" style={{ background: COULEUR_STATUT[t.statut] }} />
          <EnTeteCarte t={t} />
          <CorpsCarte t={t} />
        </article>
      ))}
    </div>
  );
}

/**
 * Kanban : une colonne par état. Glisser une carte dans une autre colonne
 * fait le geste correspondant — commencer, terminer (avec son compte rendu),
 * annuler (avec son motif), rouvrir. Seules les colonnes où le passage existe
 * et vous est permis s'éclairent ; les autres refusent le dépôt.
 */
export function VueKanban({ taches }: { taches: TacheAffichee[] }) {
  const { gestes, geste, enCours } = useTaches();
  const [glissee, setGlissee] = useState<TacheAffichee | null>(null);
  const [survol, setSurvol] = useState<Statut | null>(null);

  const accepte = (cible: Statut) => {
    if (!glissee) return false;
    const g = gesteVers(glissee.statut, cible);
    return g !== null && gestes(glissee).includes(g);
  };

  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2">
      <div className="flex min-w-max gap-3">
        {ORDRE_STATUTS.map((s) => {
          const colonne = trier(taches.filter((t) => t.statut === s));
          const ouverte = accepte(s);
          return (
            <section
              key={s}
              aria-label={LIBELLE_STATUT[s]}
              onDragOver={(e) => {
                if (!ouverte) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (survol !== s) setSurvol(s);
              }}
              onDragLeave={() => setSurvol((v) => (v === s ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setSurvol(null);
                const t = glissee;
                setGlissee(null);
                if (!t || !ouverte) return;
                const g = gesteVers(t.statut, s);
                if (g) geste(t, g);
              }}
              className={`flex w-[18rem] shrink-0 flex-col rounded-xl bg-[var(--surface-creuse)] transition ${
                glissee && !ouverte && glissee.statut !== s ? "opacity-50" : ""
              } ${survol === s ? "ring-2 ring-offset-2 ring-offset-[var(--fond)]" : ""}`}
              style={survol === s ? ({ "--tw-ring-color": COULEUR_STATUT[s] } as CSSProperties) : undefined}
            >
              <h3 className="rounded-t-xl px-3 py-2.5 text-sm font-semibold text-white" style={{ background: COULEUR_STATUT[s] }}>
                {LIBELLE_STATUT[s]} / {colonne.length}
              </h3>
              <div className="flex min-h-32 flex-1 flex-col gap-2.5 p-2.5">
                {colonne.map((t) => {
                  const mobile = gestes(t).length > 0 && !enCours;
                  return (
                    <article
                      key={t.id}
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
                      className={`rounded-lg border border-[var(--filet)] bg-[var(--surface)] p-3 shadow-sm ${mobile ? "cursor-grab active:cursor-grabbing" : ""} ${
                        glissee?.id === t.id ? "opacity-40" : ""
                      }`}
                    >
                      <EnTeteCarte t={t} />
                      <CorpsCarte t={t} compacte />
                    </article>
                  );
                })}
                {colonne.length === 0 && (
                  <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-[var(--filet)] p-4 text-center text-xs text-[var(--encre-faible)]">
                    {ouverte ? "Déposez ici" : "Aucune tâche"}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
