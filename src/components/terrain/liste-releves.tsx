"use client";

import { useEffect, useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { Pastille, type TonPastille } from "@/components/ui/primitives";
import { examinerReleve, signerPreuves } from "@/modules/projets/terrain-actions";
import { LIBELLE_PREUVE, LIBELLE_STATUT_RELEVE, lienCarte, libellePosition, type NaturePreuve, type StatutReleve } from "@/modules/projets/terrain-regles";

export interface ReleveAffiche {
  id: string;
  auteur: string;
  saisiPar: string | null;
  libelle: string;
  note: string | null;
  avancement: number | null;
  latitudeMicro: number;
  longitudeMicro: number;
  precisionM: number | null;
  /** ISO : la date passe en texte, le navigateur la met à l'heure d'Abidjan. */
  priseLe: string;
  statut: StatutReleve;
  commentaire: string | null;
  revisePar: string | null;
  preuves: { id: string; nature: NaturePreuve; nomFichier: string }[];
}

const TON: Record<StatutReleve, TonPastille> = { soumis: "alerte", valide: "valide", a_refaire: "danger" };

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Les relevés d'un projet, avec leurs preuves et leur position, et — pour
 * le superviseur, le chef de projet et l'encadrement — l'examen : valider,
 * ou renvoyer avec ce qu'il faut refaire.
 */
export function ListeReleves({ projetId, releves, peutExaminer }: { projetId: string; releves: ReleveAffiche[]; peutExaminer: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const cles = releves.flatMap((r) => r.preuves.map((p) => p.id)).join(",");

  // Les adresses signées se demandent une fois la page montée : posées dans le HTML, elles resteraient valables pour qui retrouve la page en cache.
  useEffect(() => {
    const ids = cles ? cles.split(",") : [];
    if (ids.length === 0) return;
    let courant = true;
    void signerPreuves(ids).then((signees) => courant && setUrls(signees));
    return () => {
      courant = false;
    };
  }, [cles]);

  if (releves.length === 0) return null;
  return (
    <ul className="space-y-3">
      {releves.map((r) => (
        <li key={r.id} id={`releve-${r.id}`} className="scroll-mt-20 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold">{r.libelle}</h3>
              <p className="text-xs text-[var(--encre-faible)]">
                {r.auteur}
                {r.saisiPar && ` · saisi par ${r.saisiPar}`} · <span className="chiffres">{HEURE.format(new Date(r.priseLe))}</span>
              </p>
            </div>
            <Pastille ton={TON[r.statut]}>{LIBELLE_STATUT_RELEVE[r.statut]}</Pastille>
          </div>

          {r.avancement !== null && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="h-2 w-40 overflow-hidden rounded-full bg-[var(--surface-creuse)]" role="img" aria-label={`Avancement ${r.avancement} %`}>
                <span className="block h-full bg-marque-600" style={{ width: `${r.avancement}%` }} />
              </span>
              <span className="chiffres font-semibold">{r.avancement} %</span>
            </div>
          )}
          {r.note && <p className="mt-2 whitespace-pre-line text-sm text-[var(--encre-douce)]">{r.note}</p>}

          <p className="mt-2 text-xs">
            <a href={lienCarte(r.latitudeMicro, r.longitudeMicro)} target="_blank" rel="noopener noreferrer" className="chiffres font-semibold text-marque-600 hover:underline">
              {libellePosition(r.latitudeMicro, r.longitudeMicro)}
            </a>
            {r.precisionM !== null && <span className="text-[var(--encre-faible)]"> · précision {r.precisionM} m</span>}
            <span className="text-[var(--encre-faible)]"> · voir sur la carte</span>
          </p>

          <ul className="mt-3 flex flex-wrap gap-2">
            {r.preuves.map((p) => (
              <li key={p.id} className="w-28">
                {urls[p.id] ? (
                  <a href={urls[p.id]} target="_blank" rel="noopener noreferrer" title={`${LIBELLE_PREUVE[p.nature]} — ${p.nomFichier}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL signée de deux minutes : next/image la mettrait en cache */}
                    <img src={urls[p.id]} alt={`${LIBELLE_PREUVE[p.nature]} du relevé « ${r.libelle} »`} className="h-24 w-28 rounded-lg border border-[var(--filet)] object-cover" />
                  </a>
                ) : (
                  <span className="grid h-24 w-28 place-items-center rounded-lg border border-dashed border-[var(--filet)] text-[11px] text-[var(--encre-faible)]">{LIBELLE_PREUVE[p.nature]}</span>
                )}
                <span className="mt-0.5 block text-[11px] text-[var(--encre-faible)]">{LIBELLE_PREUVE[p.nature]}</span>
              </li>
            ))}
          </ul>

          {r.commentaire && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${r.statut === "a_refaire" ? "bg-danger-50 text-danger-600" : "bg-[var(--surface-creuse)]"}`}>
              {r.revisePar ? `${r.revisePar} : ` : ""}
              {r.commentaire}
            </p>
          )}

          {peutExaminer && r.statut !== "valide" && <Examen projetId={projetId} releveId={r.id} />}
        </li>
      ))}
    </ul>
  );
}

function Examen({ projetId, releveId }: { projetId: string; releveId: string }) {
  const op = useOperation();
  const [commentaire, setCommentaire] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-[var(--filet)] pt-3">
      <input
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        placeholder="Commentaire — obligatoire pour renvoyer"
        aria-label="Commentaire d'examen"
        className="h-9 min-w-56 flex-1 rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-sm"
      />
      <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => examinerReleve(projetId, releveId, "valide", commentaire))} className="h-9 rounded-lg bg-valide-500 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
        Valider
      </button>
      <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => examinerReleve(projetId, releveId, "a_refaire", commentaire))} className="h-9 rounded-lg border border-danger-500 px-3.5 text-sm font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50">
        À refaire
      </button>
      {op.resultat && !op.resultat.ok && (
        <span className="basis-full">
          <Retour resultat={op.resultat} />
        </span>
      )}
    </div>
  );
}
