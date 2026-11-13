"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { Fenetre } from "@/components/ui/fenetre";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import {
  agirSurTache,
  ajouterIntervenant,
  creerTache,
  definirValeur,
  deplacerColonne,
  modifierTache,
  retirerIntervenant,
  supprimerColonne,
} from "@/modules/taches/actions";
import type { Resultat as ResultatAction } from "@/modules/taches/actions";
import { gestesPossibles, type Geste, type Priorite } from "@/modules/taches/calcul";
import { estClose } from "@/modules/taches/vues";

import { valeurExecutant, type Salarie } from "./champs-tache";
import { FormulaireColonne } from "./colonnes-ui";
import { PanneauTache, type Onglet } from "./panneau-tache";
import type { ColonneAffichee, Mentionnable, PersonnePossible, TacheAffichee } from "./types";

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
  /** Ouvre le panneau de la tâche, sur un onglet au besoin. */
  ouvrir: (id: string, onglet?: Onglet) => void;
  geste: (t: TacheAffichee, g: Geste) => void;
  retoucher: (t: TacheAffichee, r: Retouche) => void;
  creerRapide: (titre: string) => void;
  /** Contenu, échéance et exécutant se modifient : créateur ou qui attribue, tâche ouverte. */
  modifiable: (t: TacheAffichee) => boolean;
  gestes: (t: TacheAffichee) => Geste[];
  /** Colonnes personnalisées, de gauche à droite. */
  colonnes: ColonneAffichee[];
  /** Les colonnes se remplissent par l'exécutant, le créateur ou qui attribue. */
  peutRemplir: (t: TacheAffichee) => boolean;
  definir: (t: TacheAffichee, colonne: ColonneAffichee, valeur: string | null) => void;
  /** Composer les colonnes : qui attribue. */
  gererColonnes: boolean;
  composerColonne: (colonne: ColonneAffichee | null) => void;
  deplacerColonne: (colonne: ColonneAffichee, sens: -1 | 1) => void;
  retirerColonne: (colonne: ColonneAffichee) => void;
  /** Collaborateurs et intervenants qu'on peut mettre sur une tâche. */
  personnesPossibles: PersonnePossible[];
  basculerIntervenant: (t: TacheAffichee, ref: string) => void;
  mentionnables: Mentionnable[];
  /** Lance une action serveur : retour affiché, page rafraîchie. */
  lancer: (action: () => Promise<ResultatAction>, apres?: () => void) => void;
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
  colonnes,
  personnesPossibles,
  mentionnables,
  children,
}: {
  taches: TacheAffichee[];
  colonnes: ColonneAffichee[];
  personnesPossibles: PersonnePossible[];
  mentionnables: Mentionnable[];
  moi: string;
  attribue: boolean;
  executer: boolean;
  personnel: Salarie[];
  aujourdhui: string;
  maintenantIso: string;
  children: ReactNode;
}) {
  const [ouverte, setOuverte] = useState<{ id: string; onglet: Onglet } | null>(null);
  const [saisie, setSaisie] = useState<{ tache: TacheAffichee; geste: "terminer" | "annuler"; texte: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  // `null` : pas de fenêtre ; « nouvelle » : création ; sinon la colonne qu'on règle.
  const [composee, setComposee] = useState<ColonneAffichee | "nouvelle" | null>(null);
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
    ouvrir: (id, onglet = "mises-a-jour") => setOuverte({ id, onglet }),
    mentionnables,
    lancer,
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
    colonnes,
    peutRemplir: (t) =>
      executer && (attribue || t.creeParUserId === moi || t.assigneeUserId === moi || t.intervenants.some((i) => i.userId === moi)),
    personnesPossibles,
    basculerIntervenant(t, ref) {
      if (!modifiable(t)) return;
      const present = t.intervenants.some((i) => i.ref === ref);
      lancer(() => (present ? retirerIntervenant(t.id, ref) : ajouterIntervenant(t.id, ref)));
    },
    definir(t, colonne, valeur) {
      if ((t.valeurs[colonne.id] ?? null) === valeur) return;
      lancer(() => definirValeur(t.id, colonne.id, valeur));
    },
    gererColonnes: attribue,
    composerColonne: (c) => setComposee(c ?? "nouvelle"),
    deplacerColonne: (c, sens) => lancer(() => deplacerColonne(c.id, sens)),
    retirerColonne(c) {
      if (!window.confirm(`Retirer la colonne « ${c.libelle} » ? Elle disparaît du tableau pour toute l'équipe ; ses valeurs restent au journal.`)) return;
      lancer(() => supprimerColonne(c.id));
    },
    creerRapide(titre) {
      const donnees = new FormData();
      donnees.set("titre", titre);
      donnees.set("priorite", "normale");
      lancer(() => creerTache(donnees));
    },
  };

  const tacheOuverte = ouverte ? (taches.find((t) => t.id === ouverte.id) ?? null) : null;

  return (
    <ContexteTaches.Provider value={contexte}>
      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}
      {children}

      {tacheOuverte && ouverte && (
        <PanneauTache key={tacheOuverte.id} tache={tacheOuverte} ongletInitial={ouverte.onglet} fermer={() => setOuverte(null)} />
      )}

      <Fenetre
        ouverte={composee !== null}
        titre={composee === "nouvelle" ? "Nouvelle colonne" : composee ? `Colonne « ${composee.libelle} »` : "Colonne"}
        sousTitre="Commune à tout le tableau des tâches de l'entreprise."
        presentation="ample"
        onFermer={() => setComposee(null)}
      >
        {composee !== null && (
          <FormulaireColonne
            key={composee === "nouvelle" ? "nouvelle" : composee.id}
            colonne={composee === "nouvelle" ? null : composee}
            lancer={lancer}
            fermer={() => setComposee(null)}
          />
        )}
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
