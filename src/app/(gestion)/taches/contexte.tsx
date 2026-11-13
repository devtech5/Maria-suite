"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { Fenetre } from "@/components/ui/fenetre";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { agirSurTache, creerTache, modifierTache } from "@/modules/taches/actions";
import { gestesPossibles, type Geste, type Priorite } from "@/modules/taches/calcul";
import { estClose } from "@/modules/taches/vues";

import { valeurExecutant, type Salarie } from "./champs-tache";
import { FicheTache } from "./fiche-tache";
import type { TacheAffichee } from "./types";

/** Ce qui se change d'un clic dans une cellule, sans ouvrir le formulaire. */
export interface Retouche {
  titre?: string;
  priorite?: Priorite;
  echeance?: string | null;
  dateDebut?: string | null;
  /** Valeur du choix d'exécutant : vide pour soi, `e:<collaborateur>`. */
  executant?: string;
}

interface Contexte {
  moi: string;
  attribue: boolean;
  executer: boolean;
  personnel: Salarie[];
  /** Jour ISO du serveur : le retard se juge à la même date pour tout le monde. */
  aujourdhui: string;
  /** Instant du rendu serveur : « il y a 2 h » se calcule pareil des deux côtés. */
  maintenantIso: string;
  enCours: boolean;
  ouvrir: (id: string) => void;
  geste: (t: TacheAffichee, g: Geste) => void;
  retoucher: (t: TacheAffichee, r: Retouche) => void;
  creerRapide: (titre: string) => void;
  /** Contenu, échéance et exécutant se modifient : créateur ou qui attribue, tâche ouverte. */
  modifiable: (t: TacheAffichee) => boolean;
  gestes: (t: TacheAffichee) => Geste[];
}

const ContexteTaches = createContext<Contexte | null>(null);

export function useTaches(): Contexte {
  const c = useContext(ContexteTaches);
  if (!c) throw new Error("useTaches hors de FournisseurTaches");
  return c;
}

/**
 * Le cœur commun des six vues : les gestes (commencer, terminer avec un
 * compte rendu, annuler avec un motif, rouvrir), les retouches d'une cellule,
 * la fiche d'une tâche en fenêtre. Chaque vue n'est qu'une façon de ranger les
 * mêmes tâches ; le serveur revérifie toujours qui a le droit de quoi.
 */
export function FournisseurTaches({
  taches,
  moi,
  attribue,
  executer,
  personnel,
  aujourdhui,
  maintenantIso,
  children,
}: {
  taches: TacheAffichee[];
  moi: string;
  attribue: boolean;
  executer: boolean;
  personnel: Salarie[];
  aujourdhui: string;
  maintenantIso: string;
  children: ReactNode;
}) {
  const [ouverteId, setOuverteId] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<{ tache: TacheAffichee; geste: "terminer" | "annuler"; texte: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  function lancer(action: () => Promise<Resultat>, apres?: () => void) {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok) apres?.();
      routeur.refresh();
    });
  }

  const modifiable = (t: TacheAffichee) => executer && (attribue || t.creeParUserId === moi) && !estClose(t.statut);

  const contexte: Contexte = {
    moi,
    attribue,
    executer,
    personnel,
    aujourdhui,
    maintenantIso,
    enCours,
    ouvrir: setOuverteId,
    modifiable,
    gestes: (t) => (executer ? gestesPossibles(t.statut, t, { userId: moi, attribue }) : []),
    geste(t, g) {
      if (g === "terminer" || g === "annuler") setSaisie({ tache: t, geste: g, texte: "" });
      else lancer(() => agirSurTache(t.id, g));
    },
    retoucher(t, r) {
      if (!modifiable(t)) return;
      const donnees = new FormData();
      donnees.set("titre", r.titre ?? t.titre);
      donnees.set("description", t.description ?? "");
      donnees.set("priorite", r.priorite ?? t.priorite);
      donnees.set("echeance", (r.echeance !== undefined ? r.echeance : t.echeance) ?? "");
      donnees.set("dateDebut", (r.dateDebut !== undefined ? r.dateDebut : t.dateDebut) ?? "");
      donnees.set("executant", r.executant ?? valeurExecutant(t, moi));
      lancer(() => modifierTache(t.id, donnees));
    },
    creerRapide(titre) {
      const donnees = new FormData();
      donnees.set("titre", titre);
      donnees.set("priorite", "normale");
      lancer(() => creerTache(donnees));
    },
  };

  const ouverte = ouverteId ? taches.find((t) => t.id === ouverteId) ?? null : null;

  return (
    <ContexteTaches.Provider value={contexte}>
      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}
      {children}

      <Fenetre ouverte={ouverte !== null} titre={ouverte ? ouverte.titre : "Tâche"} sousTitre={ouverte?.numero} presentation="ample" onFermer={() => setOuverteId(null)}>
        {ouverte && <FicheTache key={ouverte.id} tache={ouverte} lancer={lancer} />}
      </Fenetre>

      <Fenetre
        ouverte={saisie !== null}
        titre={saisie?.geste === "annuler" ? "Annuler la tâche" : "Terminer la tâche"}
        sousTitre={saisie ? `${saisie.tache.numero} — ${saisie.tache.titre}` : undefined}
        onFermer={() => setSaisie(null)}
      >
        {saisie && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lancer(() => agirSurTache(saisie.tache.id, saisie.geste, saisie.texte), () => setSaisie(null));
            }}
            className="space-y-3 px-5 py-4"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">
                {saisie.geste === "annuler" ? "Motif de l'annulation" : "Compte rendu : ce qui a été fait (facultatif)"}
              </span>
              <textarea
                autoFocus
                rows={3}
                maxLength={2000}
                value={saisie.texte}
                onChange={(e) => setSaisie({ ...saisie, texte: e.target.value })}
                className={`${CLASSE_CHAMP} h-auto py-2`}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSaisie(null)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
                Retour
              </button>
              <button
                type="submit"
                disabled={enCours || (saisie.geste === "annuler" && saisie.texte.trim().length < 3)}
                className={`h-cible rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50 ${saisie.geste === "annuler" ? "bg-danger-500" : "bg-valide-500"}`}
              >
                {saisie.geste === "annuler" ? "Annuler la tâche" : "Marquer terminée"}
              </button>
            </div>
          </form>
        )}
      </Fenetre>
    </ContexteTaches.Provider>
  );
}
