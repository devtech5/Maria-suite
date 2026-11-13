"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { LIBELLE_STATUT } from "@/modules/taches/calcul";
import {
  ajouterJours,
  COULEUR_STATUT,
  ecartJours,
  estWeekEnd,
  intervalleTache,
  ORDRE_STATUTS,
  plageFrise,
  rangerEnCouloirs,
  regrouper,
  type Intervalle,
  type Regroupement,
} from "@/modules/taches/vues";

import { useTaches } from "./contexte";
import { Avatar, jourCourt, titreBarre } from "./elements";
import type { TacheAffichee } from "./types";

type Zoom = "jours" | "semaines";
const LARGEUR_JOUR: Record<Zoom, number> = { jours: 36, semaines: 14 };
const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const INITIALE_JOUR = ["D", "L", "M", "M", "J", "V", "S"];
const HAUTEUR_LIGNE = 38;
const HAUTEUR_BARRE = 26;

interface Barre {
  t: TacheAffichee;
  i: Intervalle;
}

/**
 * Les deux frises.
 *
 *   gantt      — une ligne par tâche, rangées en groupes : la durée de
 *                chacune, du début prévu à l'échéance ;
 *   echeancier — une ligne par responsable, ses tâches en couloirs : on voit
 *                d'un coup d'œil qui est chargé, et quand.
 *
 * Une tâche sans aucune date n'a pas de place sur une frise : elle est
 * comptée sous le graphique et reste dans les autres vues.
 */
export function VueFrise({ taches, mode, regroupement }: { taches: TacheAffichee[]; mode: "gantt" | "echeancier"; regroupement: Regroupement }) {
  const { aujourdhui, ouvrir } = useTaches();
  const [zoom, setZoom] = useState<Zoom>("jours");
  const defilement = useRef<HTMLDivElement>(null);

  const barres: Barre[] = taches.flatMap((t) => {
    const i = intervalleTache(t);
    return i ? [{ t, i }] : [];
  });
  const sansDate = taches.length - barres.length;
  const plage = plageFrise(
    barres.map((b) => b.i),
    aujourdhui,
  );
  const nbJours = ecartJours(plage.debut, plage.fin) + 1;
  const px = LARGEUR_JOUR[zoom];
  const jours = Array.from({ length: nbJours }, (_, n) => ajouterJours(plage.debut, n));
  const decalageAujourdhui = ecartJours(plage.debut, aujourdhui);

  // À l'ouverture et au changement d'échelle, la frise se place sur aujourd'hui.
  useEffect(() => {
    const zone = defilement.current;
    if (zone) zone.scrollLeft = Math.max(0, (decalageAujourdhui - 6) * px);
  }, [px, decalageAujourdhui]);

  const position = (i: Intervalle) => ({ left: ecartJours(plage.debut, i.debut) * px + 2, width: (ecartJours(i.debut, i.fin) + 1) * px - 4 });

  const barre = (b: Barre, haut: number) => {
    const { left, width } = position(b.i);
    return (
      <button
        key={b.t.id}
        type="button"
        onClick={() => ouvrir(b.t.id)}
        title={`${b.t.titre} — ${LIBELLE_STATUT[b.t.statut]} — ${jourCourt(b.i.debut)}${b.i.fin !== b.i.debut ? ` → ${jourCourt(b.i.fin)}` : ""}`}
        className={`absolute flex items-center overflow-hidden rounded-full px-2.5 text-left text-xs font-medium text-white shadow-sm hover:brightness-110 ${titreBarre(b.t)}`}
        style={{ left, width, top: haut, height: HAUTEUR_BARRE, background: COULEUR_STATUT[b.t.statut] }}
      >
        <span className="truncate">{width > 60 ? b.t.titre : ""}</span>
      </button>
    );
  };

  // Lignes de la frise : un titre à gauche, un contenu sur la frise.
  const lignes: { cle: string; gauche: ReactNode; hauteur: number; contenu: ReactNode; entete?: string }[] = [];
  if (mode === "gantt") {
    for (const g of regrouper(barres.map((b) => ({ ...b.t, barre: b })), regroupement, aujourdhui)) {
      if (g.taches.length === 0) continue;
      lignes.push({
        cle: `g-${g.cle}`,
        entete: g.couleur,
        hauteur: 32,
        gauche: (
          <span className="truncate font-semibold" style={{ color: g.couleur }}>
            {g.libelle} <span className="font-normal text-[var(--encre-faible)]">({g.taches.length})</span>
          </span>
        ),
        contenu: null,
      });
      for (const t of g.taches) {
        lignes.push({
          cle: t.id,
          hauteur: HAUTEUR_LIGNE,
          gauche: (
            <button type="button" onClick={() => ouvrir(t.id)} className={`block w-full truncate border-l-4 pl-2 text-left text-sm hover:text-marque-600 ${titreBarre(t)}`} style={{ borderLeftColor: g.couleur }}>
              {t.titre}
            </button>
          ),
          contenu: barre(t.barre, (HAUTEUR_LIGNE - HAUTEUR_BARRE) / 2),
        });
      }
    }
  } else {
    const personnes = [...new Set(barres.map((b) => b.t.assignee))].sort((a, b) => a.localeCompare(b, "fr"));
    for (const nom of personnes) {
      const siennes = barres.filter((b) => b.t.assignee === nom);
      const { couloirs, nombre } = rangerEnCouloirs(siennes.map((b) => b.i));
      const hauteur = nombre * (HAUTEUR_BARRE + 6) + 10;
      const ouvertes = siennes.filter((b) => b.t.statut === "a_faire" || b.t.statut === "en_cours").length;
      lignes.push({
        cle: nom,
        hauteur,
        gauche: (
          <span className="flex items-center gap-2">
            <Avatar nom={nom} taille={26} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{nom}</span>
              <span className="block text-xs text-[var(--encre-faible)]">
                {ouvertes} ouverte{ouvertes > 1 ? "s" : ""}
              </span>
            </span>
          </span>
        ),
        contenu: siennes.map((b, n) => barre(b, 5 + couloirs[n] * (HAUTEUR_BARRE + 6))),
      });
    }
  }

  // En-tête des mois : un bandeau par mois couvert.
  const mois: { cle: string; debut: number; nombre: number }[] = [];
  jours.forEach((j, n) => {
    const cle = j.slice(0, 7);
    if (mois.at(-1)?.cle === cle) mois.at(-1)!.nombre++;
    else mois.push({ cle, debut: n, nombre: 1 });
  });

  const largeur = nbJours * px;
  const hauteurCorps = lignes.reduce((h, l) => h + l.hauteur, 0);

  return (
    <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--filet)] px-3 py-2">
        <div className="flex rounded-lg bg-[var(--surface-creuse)] p-0.5 text-sm">
          {(["jours", "semaines"] as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={`rounded-md px-3 py-1 font-medium ${zoom === z ? "bg-[var(--surface)] shadow-sm" : "text-[var(--encre-douce)]"}`}
            >
              {z === "jours" ? "Jours" : "Semaines"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => defilement.current?.scrollTo({ left: Math.max(0, (decalageAujourdhui - 6) * px), behavior: "smooth" })}
          className="h-8 rounded-lg border border-[var(--filet)] px-3 text-sm font-medium hover:bg-[var(--surface-creuse)]"
        >
          Aujourd&apos;hui
        </button>
        <span className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {ORDRE_STATUTS.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: COULEUR_STATUT[s] }} />
              {LIBELLE_STATUT[s]}
            </span>
          ))}
        </span>
      </div>

      {lignes.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--encre-faible)]">
          Aucune tâche datée. Donnez une échéance ou un début prévu à une tâche pour la voir sur la frise.
        </p>
      ) : (
        <div className="flex">
          {/* Colonne des titres, fixe. */}
          <div className="w-44 shrink-0 border-r border-[var(--filet)] sm:w-64">
            <div className="h-[52px] border-b border-[var(--filet)] px-3 pt-2 text-xs font-medium text-[var(--encre-douce)]">
              {mode === "gantt" ? "Tâche" : "Responsable"}
            </div>
            {lignes.map((l) => (
              <div
                key={l.cle}
                className={`flex items-center border-b border-[var(--filet)] px-3 ${l.entete ? "bg-[var(--surface-creuse)]/60" : ""}`}
                style={{ height: l.hauteur }}
              >
                {l.gauche}
              </div>
            ))}
          </div>

          {/* La frise, qui défile de côté. */}
          <div ref={defilement} className="min-w-0 flex-1 overflow-x-auto">
            <div style={{ width: largeur }} className="relative">
              <div className="flex h-6 border-b border-[var(--filet)]">
                {mois.map((m) => (
                  <div key={m.cle} className="border-r border-[var(--filet)] text-xs font-semibold leading-6" style={{ width: m.nombre * px }}>
                    {/* Collant : le nom du mois reste lisible quand son début sort de l'écran. */}
                    <span className="sticky left-0 inline-block whitespace-nowrap px-2 first-letter:uppercase">{MOIS.format(new Date(`${m.cle}-01T00:00:00Z`))}</span>
                  </div>
                ))}
              </div>
              <div className="flex h-[28px] border-b border-[var(--filet)]">
                {jours.map((j) => {
                  const jourSemaine = new Date(`${j}T00:00:00Z`).getUTCDay();
                  const affiche = zoom === "jours" || jourSemaine === 1;
                  return (
                    <div
                      key={j}
                      className={`chiffres shrink-0 text-center text-[10px] leading-[14px] ${j === aujourdhui ? "font-bold text-[#579bfc]" : "text-[var(--encre-faible)]"} ${
                        zoom === "jours" || jourSemaine === 1 ? "border-l border-[var(--filet)]/60" : ""
                      }`}
                      style={{ width: px }}
                    >
                      {affiche && (
                        <>
                          {zoom === "jours" && <span className="block">{INITIALE_JOUR[jourSemaine]}</span>}
                          <span className="block">{Number(j.slice(8))}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="relative" style={{ height: hauteurCorps }}>
                {/* Fond : week-ends grisés, trait d'aujourd'hui. */}
                <div aria-hidden className="absolute inset-0 flex">
                  {jours.map((j) => (
                    <div key={j} className={`shrink-0 ${estWeekEnd(j) ? "bg-[var(--surface-creuse)]/70" : ""}`} style={{ width: px }} />
                  ))}
                </div>
                {decalageAujourdhui >= 0 && decalageAujourdhui < nbJours && (
                  <div aria-hidden className="absolute inset-y-0 z-[1] w-0.5 bg-[#579bfc]" style={{ left: decalageAujourdhui * px + px / 2 }} />
                )}
                {lignes.map((l, n) => {
                  const haut = lignes.slice(0, n).reduce((h, x) => h + x.hauteur, 0);
                  return (
                    <div key={l.cle} className={`absolute inset-x-0 z-[2] border-b border-[var(--filet)] ${l.entete ? "bg-[var(--surface-creuse)]/60" : ""}`} style={{ top: haut, height: l.hauteur }}>
                      {l.contenu}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {sansDate > 0 && (
        <p className="border-t border-[var(--filet)] px-3 py-2 text-xs text-[var(--encre-faible)]">
          {sansDate} tâche{sansDate > 1 ? "s" : ""} sans début ni échéance n&apos;apparai{sansDate > 1 ? "ssent" : "t"} pas sur la frise.
        </p>
      )}
    </div>
  );
}
