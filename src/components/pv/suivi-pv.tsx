"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { Pastille } from "@/components/ui/primitives";
import { dateEnLettres } from "@/modules/documents/courriers-calcul";
import { PiecesJointesPv, type PieceAffichee } from "@/components/pv/pieces-jointes";
import { accuserLecture, creerTacheAction, relancerPv, renvoyerPv, reviserPv } from "@/modules/pv/actions";
import { suiviLectures, type GestePv, type StatutPv } from "@/modules/pv/regles";
import { LIBELLE_STATUT as LIBELLE_STATUT_TACHE, type Statut } from "@/modules/taches/calcul";

const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

interface Action {
  id: string;
  libelle: string;
  responsable: string | null;
  echeance: string | null;
  tacheId: string | null;
  tacheNumero: string | null;
  tacheStatut: string | null;
}

/**
 * Ce qui entoure un PV publié : la prise de connaissance, les gestes, le suivi
 * des lectures et des actions (devenues tâches), les versions.
 */
export function SuiviPv({
  pvId,
  statut,
  gestes,
  redacteur,
  valideur,
  peutCreerTaches,
  accuseRequis,
  maLecture,
  lectures,
  actions,
  versions,
  derniereVersionPubliee,
  revision,
  pieces,
}: {
  pvId: string;
  statut: StatutPv;
  gestes: GestePv[];
  redacteur: boolean;
  valideur: boolean;
  peutCreerTaches: boolean;
  accuseRequis: boolean;
  maLecture: { luLeIso: string | null } | null;
  lectures: { userId: string; nom: string; luLeIso: string | null }[];
  actions: Action[];
  versions: { id: string; revision: number; statut: StatutPv; courante: boolean }[];
  derniereVersionPubliee: number;
  revision: number;
  pieces: PieceAffichee[];
}) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const lancer = (action: () => Promise<Resultat>) => {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      if (r) setResultat(r);
      routeur.refresh();
    });
  };
  const suivi = suiviLectures(lectures.map((l) => ({ ...l, luLe: l.luLeIso ? new Date(l.luLeIso) : null })));
  const remplacee = statut === "publie" && revision < derniereVersionPubliee;
  const carte = "rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4";
  const bouton = "h-cible w-full rounded-lg border border-[var(--filet)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50";

  return (
    <aside className="space-y-4">
      {remplacee && (
        <p className="rounded-xl border border-alerte-500/40 bg-alerte-50 px-4 py-3 text-sm">
          Cette version a été remplacée. {versions.filter((v) => v.statut === "publie" && v.revision === derniereVersionPubliee).map((v) => (
            <Link key={v.id} href={`/pv/${v.id}`} className="font-semibold text-marque-600 hover:underline">
              Lire la version {v.revision}
            </Link>
          ))}
        </p>
      )}

      {statut === "a_valider" && (
        <div className={carte}>
          <p className="text-sm font-semibold">En attente de validation</p>
          <p className="mt-1 text-sm text-[var(--encre-douce)]">La direction le relit : elle le publiera ou vous le renverra avec une remarque.</p>
          {gestes.includes("renvoyer") && redacteur && (
            <button type="button" disabled={enCours} onClick={() => lancer(() => renvoyerPv(pvId, null))} className={`${bouton} mt-3`}>
              Reprendre en brouillon
            </button>
          )}
        </div>
      )}

      {statut === "publie" && maLecture && (
        <div className={`${carte} ${!maLecture.luLeIso && accuseRequis ? "border-alerte-500/50 bg-alerte-50" : ""}`}>
          {maLecture.luLeIso ? (
            <p className="text-sm text-valide-600">Vous en avez pris connaissance le {MOMENT.format(new Date(maLecture.luLeIso))}.</p>
          ) : (
            <>
              <p className="text-sm font-semibold">{accuseRequis ? "Votre prise de connaissance est attendue." : "Diffusé à votre attention."}</p>
              <button
                type="button"
                disabled={enCours}
                onClick={() => lancer(() => accuserLecture(pvId))}
                className={`mt-3 h-cible w-full rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${accuseRequis ? "bg-marque-600 text-white hover:bg-marque-700" : "border border-[var(--filet)] hover:bg-[var(--surface-creuse)]"}`}
              >
                J&apos;ai pris connaissance
              </button>
            </>
          )}
        </div>
      )}

      <div className={`${carte} space-y-2`}>
        <Link href={`/imprimer/pv/${pvId}`} className={`${bouton} inline-flex items-center justify-center`}>
          Imprimer ou enregistrer en PDF
        </Link>
        {gestes.includes("reviser") && !remplacee && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => {
              if (window.confirm("Corriger ce procès-verbal ? Une nouvelle version s'ouvre en brouillon, sous le même numéro ; celle-ci reste lisible jusqu'à la publication de la suivante.")) lancer(() => reviserPv(pvId));
            }}
            className={bouton}
          >
            Corriger : nouvelle version
          </button>
        )}
        <Retour resultat={resultat} />
      </div>

      {pieces.length > 0 && (
        <div className={carte}>
          <h2 className="mb-2 text-sm font-bold">Pièces jointes ({pieces.length})</h2>
          <PiecesJointesPv pvId={pvId} pieces={pieces} modifiables={false} />
        </div>
      )}

      {actions.length > 0 && (
        <div className={carte}>
          <h2 className="mb-2 text-sm font-bold">Actions décidées</h2>
          <ul className="space-y-2.5">
            {actions.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="font-medium">{a.libelle}</p>
                <p className="text-xs text-[var(--encre-faible)]">
                  {a.responsable ?? "Sans responsable"}
                  {a.echeance ? ` · pour le ${dateEnLettres(a.echeance)}` : ""}
                </p>
                {a.tacheNumero ? (
                  <Link href="/taches?vue=toutes" className="mt-1 inline-flex items-center gap-2 text-xs">
                    <span className="chiffres font-semibold text-marque-600">{a.tacheNumero}</span>
                    <Pastille ton={a.tacheStatut === "terminee" ? "valide" : a.tacheStatut === "annulee" ? "danger" : a.tacheStatut === "en_cours" ? "marque" : "neutre"}>
                      {LIBELLE_STATUT_TACHE[(a.tacheStatut ?? "a_faire") as Statut]}
                    </Pastille>
                  </Link>
                ) : (
                  statut === "publie" &&
                  peutCreerTaches &&
                  !remplacee && (
                    <button type="button" disabled={enCours} onClick={() => lancer(() => creerTacheAction(a.id))} className="mt-1 text-xs font-semibold text-marque-600 hover:underline disabled:opacity-50">
                      + Créer la tâche
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(redacteur || valideur) && statut === "publie" && (
        <div className={carte}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Lectures</h2>
            <span className="chiffres text-xs text-[var(--encre-faible)]">
              {suivi.lus} / {suivi.total}
            </span>
          </div>
          {suivi.total === 0 ? (
            <p className="text-sm text-[var(--encre-faible)]">Aucun destinataire.</p>
          ) : (
            <>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-creuse)]">
                <div className="h-full rounded-full bg-valide-500" style={{ width: `${suivi.pourcent}%` }} />
              </div>
              {!accuseRequis && <p className="mb-2 text-xs text-[var(--encre-faible)]">Accusé de lecture non demandé : seuls ceux qui l&apos;ont confirmé d&apos;eux-mêmes figurent comme lecteurs.</p>}
              {suivi.enAttente.length > 0 && (
                <details className="mb-2">
                  <summary className="cursor-pointer text-sm">En attente ({suivi.enAttente.length})</summary>
                  <ul className="mt-1 space-y-0.5 pl-3 text-sm text-[var(--encre-douce)]">
                    {suivi.enAttente.map((l) => (
                      <li key={l.userId}>{l.nom}</li>
                    ))}
                  </ul>
                </details>
              )}
              {suivi.ontLu.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm">Ont pris connaissance ({suivi.ontLu.length})</summary>
                  <ul className="mt-1 space-y-0.5 pl-3 text-sm text-[var(--encre-douce)]">
                    {suivi.ontLu.map((l) => (
                      <li key={l.userId}>
                        {l.nom} <span className="text-xs text-[var(--encre-faible)]">— {MOMENT.format(l.luLe!)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {accuseRequis && suivi.enAttente.length > 0 && (
                <button type="button" disabled={enCours} onClick={() => lancer(() => relancerPv(pvId))} className={`${bouton} mt-3`}>
                  Relancer ceux qui n&apos;ont pas lu
                </button>
              )}
            </>
          )}
        </div>
      )}

      {versions.length > 1 && (
        <div className={carte}>
          <h2 className="mb-2 text-sm font-bold">Versions</h2>
          <ul className="space-y-1 text-sm">
            {versions.map((v) => (
              <li key={v.id}>
                {v.courante ? (
                  <span className="font-semibold">Version {v.revision} (affichée)</span>
                ) : (
                  <Link href={`/pv/${v.id}`} className="text-marque-600 hover:underline">
                    Version {v.revision}
                  </Link>
                )}{" "}
                <span className="text-xs text-[var(--encre-faible)]">{v.statut === "publie" ? "publiée" : "en cours"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
