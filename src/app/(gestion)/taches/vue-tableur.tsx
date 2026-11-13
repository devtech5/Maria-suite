"use client";

import { useState } from "react";

import { LIBELLE_STATUT } from "@/modules/taches/calcul";
import { COULEUR_STATUT, estClose, regrouper, repartitionStatuts, type Regroupement } from "@/modules/taches/vues";

import { CelluleChamp, EnTeteColonne, PiedColonne } from "./colonnes-ui";
import { useTaches } from "./contexte";
import { CelluleDate, CellulePriorite, CelluleResponsable, CelluleStatut, depuis, jourCourt, TexteEcheance, titreBarre } from "./elements";
import type { TacheAffichee } from "./types";

/** La colonne du titre reste à gauche quand le tableau défile vers les colonnes ajoutées. */
const FIGEE = "sticky left-0 z-[1] bg-[var(--surface)] shadow-[1px_0_0_var(--filet)]";

const COLONNES = [
  { cle: "titre", libelle: "Tâche", largeur: "min-w-[18rem]" },
  { cle: "responsable", libelle: "Responsable", largeur: "w-[8rem]" },
  { cle: "statut", libelle: "État", largeur: "w-[9.5rem]" },
  { cle: "echeance", libelle: "Échéance", largeur: "w-[8.5rem]" },
  { cle: "priorite", libelle: "Priorité", largeur: "w-[8rem]" },
  { cle: "debut", libelle: "Début prévu", largeur: "w-[8rem]" },
  { cle: "maj", libelle: "Mise à jour", largeur: "w-[9rem]" },
  { cle: "numero", libelle: "N°", largeur: "w-[9.5rem]" },
] as const;

/**
 * Le tableau de suivi : un groupe par état, par échéance, par responsable ou
 * par priorité, chacun sous son filet de couleur. Chaque cellule se change sur
 * place — l'état par ses gestes, la priorité, les dates, le responsable — et
 * le titre ouvre la fiche. Le pied de groupe montre la part de chaque état.
 * Les colonnes personnalisées suivent, et « + » en ajoute une.
 */
export function VueTableur({ taches, regroupement }: { taches: TacheAffichee[]; regroupement: Regroupement }) {
  const { aujourdhui, colonnes, gererColonnes, composerColonne } = useTaches();
  const groupes = regrouper(taches, regroupement, aujourdhui);
  // Les groupes clos se replient d'eux-mêmes : on les ouvre quand on les cherche.
  const [replies, setReplies] = useState<Record<string, boolean>>({});
  const replie = (cle: string) => replies[cle] ?? (cle === "terminee" || cle === "annulee" || cle === "closes");

  return (
    <div className="space-y-6">
      {groupes.map((g) => (
        <section key={g.cle} aria-label={g.libelle}>
          <h3 className="mb-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReplies((r) => ({ ...r, [g.cle]: !replie(g.cle) }))}
              aria-expanded={!replie(g.cle)}
              className="flex items-center gap-2 rounded-md px-1 py-0.5 text-base font-semibold hover:bg-[var(--surface-creuse)]"
              style={{ color: g.couleur }}
            >
              <span aria-hidden className={`inline-block text-xs transition-transform ${replie(g.cle) ? "-rotate-90" : ""}`}>
                ▼
              </span>
              {g.libelle}
            </button>
            <span className="text-xs text-[var(--encre-faible)]">
              {g.taches.length} tâche{g.taches.length > 1 ? "s" : ""}
            </span>
          </h3>

          {!replie(g.cle) && (
            <div className="overflow-x-auto rounded-lg border border-[var(--filet)] bg-[var(--surface)]">
              <table className="w-full border-collapse text-sm" style={{ minWidth: `${69 + colonnes.length * 10 + (gererColonnes ? 3 : 0)}rem` }}>
                <thead>
                  <tr className="text-xs font-medium text-[var(--encre-douce)]">
                    {COLONNES.map((c, i) => (
                      <th
                        key={c.cle}
                        scope="col"
                        className={`${c.largeur} h-9 border-b border-[var(--filet)] px-2 font-medium ${i === 0 ? FIGEE + " border-l-[6px] text-left" : "border-l text-center"}`}
                        style={i === 0 ? { borderLeftColor: g.couleur } : undefined}
                      >
                        {c.libelle}
                      </th>
                    ))}
                    {colonnes.map((c, rang) => (
                      <th key={c.id} scope="col" className="h-9 w-[10rem] border-b border-l border-[var(--filet)] p-0 font-medium">
                        <EnTeteColonne colonne={c} rang={rang} total={colonnes.length} />
                      </th>
                    ))}
                    {gererColonnes && (
                      <th scope="col" className="h-9 w-[3rem] border-b border-l border-[var(--filet)] p-0">
                        <button
                          type="button"
                          onClick={() => composerColonne(null)}
                          title="Ajouter une colonne"
                          aria-label="Ajouter une colonne"
                          className="grid h-9 w-full place-items-center text-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
                        >
                          +
                        </button>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {g.taches.length === 0 ? (
                    <tr>
                      <td colSpan={COLONNES.length + colonnes.length + (gererColonnes ? 1 : 0)} className="h-10 border-l-[6px] px-3 text-xs text-[var(--encre-faible)]" style={{ borderLeftColor: `${g.couleur}80` }}>
                        Aucune tâche dans ce groupe.
                      </td>
                    </tr>
                  ) : (
                    g.taches.map((t) => <Ligne key={t.id} t={t} couleur={g.couleur} />)
                  )}
                </tbody>
                {g.taches.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="border-l-[6px] border-t border-[var(--filet)]" style={{ borderLeftColor: "transparent" }} />
                      <td className="border-t border-[var(--filet)]" />
                      <td className="border-l border-t border-[var(--filet)] p-1.5">
                        <BarreRepartition taches={g.taches} />
                      </td>
                      <td className="border-l border-t border-[var(--filet)] px-2 text-center text-xs text-[var(--encre-faible)]">
                        <PlageEcheances taches={g.taches} />
                      </td>
                      <td colSpan={4} className="border-t border-[var(--filet)]" />
                      {colonnes.map((c) => (
                        <td key={c.id} className="border-l border-t border-[var(--filet)] px-1 py-1.5">
                          <PiedColonne colonne={c} taches={g.taches} />
                        </td>
                      ))}
                      {gererColonnes && <td className="border-l border-t border-[var(--filet)]" />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Ligne({ t, couleur }: { t: TacheAffichee; couleur: string }) {
  const { ouvrir, aujourdhui, maintenantIso, colonnes, gererColonnes } = useTaches();
  const cellule = "h-10 border-l border-b border-[var(--filet)] p-0";
  return (
    <tr className="group hover:bg-[var(--surface-creuse)]/60">
      <td className={`${FIGEE} h-10 border-b border-l-[6px] border-[var(--filet)] px-3`} style={{ borderLeftColor: couleur }}>
        <button type="button" onClick={() => ouvrir(t.id)} className={`block w-full truncate text-left font-medium hover:text-marque-600 hover:underline ${titreBarre(t)}`} title={t.titre}>
          {t.titre}
        </button>
      </td>
      <td className={cellule}>
        <CelluleResponsable t={t} />
      </td>
      <td className={cellule}>
        <CelluleStatut t={t} />
      </td>
      <td className={`${cellule} text-center`}>
        <CelluleDate t={t} champ="echeance">
          <TexteEcheance t={t} aujourdhui={aujourdhui} />
        </CelluleDate>
      </td>
      <td className={cellule}>
        <CellulePriorite t={t} />
      </td>
      <td className={`${cellule} text-center text-[var(--encre-douce)]`}>
        <CelluleDate t={t} champ="dateDebut">
          {t.dateDebut ? jourCourt(t.dateDebut) : <span className="text-[var(--encre-faible)]">—</span>}
        </CelluleDate>
      </td>
      <td className={`${cellule} px-2 text-center text-xs text-[var(--encre-douce)]`}>{depuis(t.majLeIso, maintenantIso)}</td>
      <td className={`${cellule} chiffres whitespace-nowrap px-2 text-center text-xs text-[var(--encre-faible)]`}>{t.numero}</td>
      {colonnes.map((c) => (
        <td key={c.id} className={cellule}>
          <CelluleChamp t={t} colonne={c} />
        </td>
      ))}
      {gererColonnes && <td className={cellule} />}
    </tr>
  );
}

/** Une barre découpée à la part de chaque état, comme au pied d'un tableau de suivi. */
export function BarreRepartition({ taches }: { taches: { statut: TacheAffichee["statut"] }[] }) {
  const parts = repartitionStatuts(taches);
  const total = taches.length;
  return (
    <div className="flex h-6 w-full overflow-hidden rounded" role="img" aria-label={parts.map((p) => `${LIBELLE_STATUT[p.statut]} : ${p.nombre}`).join(", ")}>
      {parts.map((p) => (
        <span
          key={p.statut}
          title={`${LIBELLE_STATUT[p.statut]} : ${p.nombre} sur ${total}`}
          style={{ flexGrow: p.nombre, background: COULEUR_STATUT[p.statut] }}
        />
      ))}
    </div>
  );
}

function PlageEcheances({ taches }: { taches: TacheAffichee[] }) {
  const dates = taches.filter((t) => !estClose(t.statut) && t.echeance).map((t) => t.echeance!).sort();
  if (dates.length === 0) return null;
  const premiere = dates[0];
  const derniere = dates[dates.length - 1];
  return <span>{premiere === derniere ? jourCourt(premiere) : `${jourCourt(premiere)} – ${jourCourt(derniere)}`}</span>;
}
