"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import {
  chargerSuivi,
  cocherDansMessage,
  joindreFichierTache,
  ouvrirFichierTache,
  retirerFichierTache,
  retirerMessage,
} from "@/modules/taches/actions";
import type { SuiviTache } from "@/modules/taches/suivi";
import { avancement, FICHIER_MAX_OCTETS, tailleLisible, TYPES_FICHIER } from "@/modules/taches/suivi-regles";

import { useTaches } from "./contexte";
import { CorpsMessage } from "@/components/ui/texte-mis-en-forme";
import { Editeur } from "./editeur";
import { Avatar, CellulePriorite, CelluleStatut, depuis } from "./elements";
import { FicheTache } from "./fiche-tache";
import { PileAvatars } from "./intervenants-ui";
import { ListeSousTaches } from "./sous-taches";
import type { TacheAffichee } from "./types";

export type Onglet = "mises-a-jour" | "sous-taches" | "fichiers" | "activites" | "details";

/**
 * Le panneau d'une tâche, ouvert à droite du tableau qui reste visible —
 * comme sur un tableau de suivi. Demandé expressément pour les tâches : c'est
 * la seule fenêtre latérale de l'application, les autres restent des modales.
 *
 * Mises à jour (le fil de l'équipe), sous-tâches, fichiers, activités (le
 * journal, dit en français) et détails. Le fil, les fichiers et le journal
 * se lisent à l'ouverture et après chaque changement de la tâche.
 *
 * Sous le voile du verrou d'inactivité (z-60 contre z-1000) : rien ne reste
 * lisible quand l'écran se verrouille.
 */
export function PanneauTache({ tache: t, ongletInitial, fermer }: { tache: TacheAffichee; ongletInitial: Onglet; fermer: () => void }) {
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial);
  const [suivi, setSuivi] = useState<SuiviTache | null>(null);
  const [rechargement, setRechargement] = useState(0);
  const panneau = useRef<HTMLDivElement>(null);
  const progres = avancement(t.sousTaches);

  // Relu à l'ouverture, à chaque écriture du panneau, et quand la tâche a bougé ailleurs.
  useEffect(() => {
    let actif = true;
    chargerSuivi(t.id).then((s) => {
      if (actif) setSuivi(s);
    });
    return () => {
      actif = false;
    };
  }, [t.id, t.majLeIso, rechargement]);

  useEffect(() => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panneau.current?.focus();
    return () => avant?.focus();
  }, []);

  const onglets: { cle: Onglet; libelle: string; nombre?: number }[] = [
    { cle: "mises-a-jour", libelle: "Mises à jour", nombre: suivi?.messages.length ?? t.nbMessages },
    { cle: "sous-taches", libelle: "Sous-tâches", nombre: progres.total },
    { cle: "fichiers", libelle: "Fichiers", nombre: suivi?.fichiers.length },
    { cle: "activites", libelle: "Activités" },
    { cle: "details", libelle: "Détails" },
  ];

  return createPortal(
    <div
      ref={panneau}
      role="dialog"
      aria-modal="false"
      aria-label={`Tâche ${t.numero} : ${t.titre}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          fermer();
        }
      }}
      className="fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-[var(--filet)] bg-[var(--surface)] shadow-[-12px_0_32px_rgba(15,34,54,0.18)] outline-none sm:w-[min(46rem,94vw)] print:hidden"
    >
      <header className="border-b border-[var(--filet)] px-4 pt-3 sm:px-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer le panneau"
            title="Fermer (Échap)"
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg text-xl text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
          >
            ×
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold leading-tight sm:text-2xl">{t.titre}</h2>
            <p className="chiffres mt-0.5 text-xs text-[var(--encre-faible)]">
              {t.numero}
              {progres.total > 0 && ` · ${progres.faites} / ${progres.total} sous-tâches faites`}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2 pt-1">
            <span title={`Responsable : ${t.assignee}`}>
              <Avatar nom={t.assignee} taille={32} sansCompte={t.sansCompte} />
            </span>
            {t.intervenants.length > 0 && <PileAvatars personnes={t.intervenants} taille={28} />}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="h-8 w-36 overflow-hidden rounded-md">
            <CelluleStatut t={t} />
          </span>
          <span className="h-8 w-32 overflow-hidden rounded-md">
            <CellulePriorite t={t} />
          </span>
        </div>
        <nav role="tablist" aria-label="Contenu de la tâche" className="-mb-px mt-3 flex gap-1 overflow-x-auto">
          {onglets.map((o) => (
            <button
              key={o.cle}
              type="button"
              role="tab"
              aria-selected={onglet === o.cle}
              onClick={() => setOnglet(o.cle)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                onglet === o.cle ? "border-[#1f76f0] text-[var(--encre)]" : "border-transparent text-[var(--encre-douce)] hover:text-[var(--encre)]"
              }`}
            >
              {o.libelle}
              {o.nombre ? <span className="ml-1.5 rounded-full bg-[var(--surface-creuse)] px-1.5 text-xs text-[var(--encre-douce)]">{o.nombre}</span> : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {onglet === "mises-a-jour" && <MisesAJour t={t} suivi={suivi} relire={() => setRechargement((n) => n + 1)} />}
        {onglet === "sous-taches" && (
          <div className="px-4 py-4 sm:px-6">
            <ListeSousTaches t={t} />
          </div>
        )}
        {onglet === "fichiers" && <Fichiers t={t} suivi={suivi} relire={() => setRechargement((n) => n + 1)} />}
        {onglet === "activites" && <Activites suivi={suivi} />}
        {onglet === "details" && <FicheTache tache={t} sansEnTete />}
      </div>
    </div>,
    document.body,
  );
}

/** Une action du panneau : retour affiché sur place, fil relu, tableau rafraîchi. */
function useAction(relire: () => void) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const lancer = (action: () => Promise<Resultat>, apres?: () => void) => {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r.ok ? null : r);
      if (r.ok) apres?.();
      relire();
      routeur.refresh();
    });
  };
  return { resultat, enCours, lancer };
}

function Vide({ titre, texte, dessin }: { titre: string; texte: string; dessin: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <svg viewBox="0 0 120 90" className="mx-auto mb-4 h-24 w-32" aria-hidden>
        {dessin}
      </svg>
      <p className="text-base font-semibold">{titre}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--encre-douce)]">{texte}</p>
    </div>
  );
}

// ------------------------------------------------------------------ mises à jour

function MisesAJour({ t, suivi, relire }: { t: TacheAffichee; suivi: SuiviTache | null; relire: () => void }) {
  const { moi, maintenantIso, peutRemplir } = useTaches();
  const { resultat, enCours, lancer } = useAction(relire);
  const partie = peutRemplir(t);
  return (
    <div className="px-4 py-4 sm:px-6">
      {partie ? (
        <Editeur t={t} relire={relire} />
      ) : (
        <p className="rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm text-[var(--encre-douce)]">
          Seuls le responsable, les intervenants, le créateur et qui attribue publient ici.
        </p>
      )}
      <Retour resultat={resultat} />

      {suivi === null ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Chargement…</p>
      ) : suivi.messages.length === 0 ? (
        <Vide
          titre="Aucune mise à jour pour l'instant"
          texte="Partagez les progrès, mentionnez un collaborateur ou joignez un fichier pour faire avancer les choses."
          dessin={
            <>
              <rect x="34" y="6" width="70" height="40" rx="6" fill="#cfe0ff" />
              <path d="M84 46l8 10V46z" fill="#cfe0ff" />
              <path d="M44 22h22M44 30h16" stroke="#323338" strokeWidth="3" strokeLinecap="round" />
              <rect x="76" y="16" width="20" height="20" rx="3" fill="#fff" />
              <path d="M78 33l6-8 5 6 3-3 3 5z" fill="#a1b8e8" />
              <rect x="14" y="40" width="52" height="42" rx="6" fill="#6161ff" />
              <path d="M22 54h30M22 62h22" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />
              <circle cx="60" cy="76" r="8" fill="#ffcb00" />
              <path d="M56 76a4 4 0 0 0 8 0" stroke="#323338" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </>
          }
        />
      ) : (
        <ul className="mt-5 space-y-4">
          {suivi.messages.map((m) => (
            <li key={m.id} className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2.5">
                <Avatar nom={m.auteur} taille={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{m.auteur}</span>
                  <span className="block text-xs text-[var(--encre-faible)]">{depuis(m.leIso, maintenantIso)}</span>
                </span>
                {m.auteurUserId === moi && (
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => {
                      if (window.confirm("Retirer cette mise à jour ?")) lancer(() => retirerMessage(m.id));
                    }}
                    className="rounded-md px-2 py-1 text-xs text-[var(--encre-faible)] hover:bg-danger-50 hover:text-danger-600"
                  >
                    Retirer
                  </button>
                )}
              </div>
              <CorpsMessage corps={m.corps} cocher={partie ? (rang) => lancer(() => cocherDansMessage(m.id, rang)) : undefined} desactive={enCours} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ fichiers

function Fichiers({ t, suivi, relire }: { t: TacheAffichee; suivi: SuiviTache | null; relire: () => void }) {
  const { moi, attribue, maintenantIso, peutRemplir } = useTaches();
  const { resultat, enCours, lancer } = useAction(relire);
  const choix = useRef<HTMLInputElement>(null);

  const deposer = (fichier: File) => {
    if (fichier.size > FICHIER_MAX_OCTETS) return window.alert("Fichier trop lourd : 10 Mo au plus.");
    const donnees = new FormData();
    donnees.set("tacheId", t.id);
    donnees.set("fichier", fichier);
    lancer(() => joindreFichierTache(donnees));
  };

  return (
    <div className="px-4 py-4 sm:px-6">
      {peutRemplir(t) && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) deposer(f);
          }}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--filet)] px-4 py-6 text-center"
        >
          <p className="text-sm text-[var(--encre-douce)]">Glissez un fichier ici, ou</p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => choix.current?.click()}
            className="h-9 rounded-lg bg-[#1f76f0] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enCours ? "Envoi…" : "Joindre un fichier"}
          </button>
          <p className="text-xs text-[var(--encre-faible)]">PDF, image, Word, Excel, PowerPoint, texte — 10 Mo au plus.</p>
          <input
            ref={choix}
            type="file"
            hidden
            accept={Object.keys(TYPES_FICHIER).join(",")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) deposer(f);
            }}
          />
        </div>
      )}
      <Retour resultat={resultat} />
      {suivi === null ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Chargement…</p>
      ) : suivi.fichiers.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Aucun fichier joint à cette tâche.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)]">
          {suivi.fichiers.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-creuse)] text-[10px] font-bold uppercase text-[var(--encre-douce)]">
                {TYPES_FICHIER[f.typeMime] ?? "?"}
              </span>
              <span className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={async () => {
                    const url = await ouvrirFichierTache(f.id);
                    if (url) window.open(url, "_blank", "noopener");
                  }}
                  className="block max-w-full truncate text-left text-sm font-medium text-[#1f76f0] hover:underline"
                >
                  {f.nom}
                </button>
                <span className="block text-xs text-[var(--encre-faible)]">
                  {tailleLisible(f.taille)} · {f.deposePar} · {depuis(f.leIso, maintenantIso)}
                </span>
              </span>
              {(attribue || f.deposeParUserId === moi) && (
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => {
                    if (window.confirm(`Retirer « ${f.nom} » ?`)) lancer(() => retirerFichierTache(f.id));
                  }}
                  className="rounded-md px-2 py-1 text-xs text-[var(--encre-faible)] hover:bg-danger-50 hover:text-danger-600"
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ activités

function Activites({ suivi }: { suivi: SuiviTache | null }) {
  const { maintenantIso } = useTaches();
  if (suivi === null) return <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Chargement…</p>;
  if (suivi.activites.length === 0) return <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Rien au journal.</p>;
  return (
    <ol className="divide-y divide-[var(--filet)] px-4 sm:px-6">
      {suivi.activites.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-3 text-sm">
          <Avatar nom={a.auteur} taille={28} />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{a.auteur}</span> {a.phrase}
          </span>
          <time className="shrink-0 text-xs text-[var(--encre-faible)]" dateTime={a.leIso}>
            {depuis(a.leIso, maintenantIso)}
          </time>
        </li>
      ))}
    </ol>
  );
}
