"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { decouperQuestion, libelleAction } from "@/lib/questions";

import { CLASSE_CHAMP } from "./primitives";

/**
 * Les fenêtres de confirmation, de saisie et d'avis de l'application, à la
 * place de `window.confirm`, `window.prompt` et `window.alert` : la boîte du
 * navigateur porte le nom du site, ignore la charte et ne se lit pas sur un
 * téléphone.
 *
 * Chaque fonction rend une promesse, résolue au choix de la personne :
 *
 *   if (!(await confirmer(`Supprimer le bon ${numero} ?`))) return;
 *
 * `<Dialogues />` est monté une fois, dans la mise en page racine. Les
 * demandes passent une à une, dans l'ordre. Sans lui (un test, une page
 * hors application), on retombe sur la boîte du navigateur.
 */

export interface OptionsConfirmation {
  /** Défaut : la question, coupée après son premier « ? » ; la suite devient le détail. */
  titre?: string;
  detail?: string;
  /** Défaut : le verbe de la question (« Supprimer »), sinon « Confirmer ». */
  action?: string;
  /** Défaut : vrai pour un verbe qui détruit ou défait (supprimer, retirer, annuler…). */
  danger?: boolean;
}

export interface OptionsSaisie {
  titre: string;
  detail?: string;
  /** Intitulé du champ. */
  libelle?: string;
  valeur?: string;
  placeholder?: string;
  /** Longueur minimale, espaces de bord ôtés. 0 : le champ peut rester vide. */
  minimum?: number;
  maximum?: number;
  type?: "text" | "url";
  /** Champ à copier, pas à remplir : un seul bouton, « Fermer ». */
  lectureSeule?: boolean;
  action?: string;
}

type Demande =
  | { id: number; genre: "confirmation"; titre: string; detail: string | null; action: string; danger: boolean; resoudre: (ok: boolean) => void }
  | ({ id: number; genre: "saisie"; resoudre: (valeur: string | null) => void } & OptionsSaisie)
  | { id: number; genre: "avis"; titre: string; detail: string | null; resoudre: () => void };

let file: readonly Demande[] = [];
let suivant = 1;
const abonnes = new Set<() => void>();

function publier(nouvelle: readonly Demande[]) {
  file = nouvelle;
  abonnes.forEach((f) => f());
}

function ajouter(demande: Demande) {
  publier([...file, demande]);
}

function retirer(id: number) {
  publier(file.filter((d) => d.id !== id));
}

const sAbonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

/** Une question oui ou non. Vrai si la personne confirme. */
export function confirmer(question: string, options: OptionsConfirmation = {}): Promise<boolean> {
  if (abonnes.size === 0) return Promise.resolve(window.confirm(question));
  const coupee = decouperQuestion(question);
  const titre = options.titre ?? coupee.titre;
  const verbe = libelleAction(titre);
  return new Promise((resoudre) =>
    ajouter({
      id: suivant++,
      genre: "confirmation",
      titre,
      detail: options.detail ?? (options.titre ? null : coupee.detail),
      action: options.action ?? verbe.libelle,
      danger: options.danger ?? verbe.danger,
      resoudre,
    }),
  );
}

/** Un texte à saisir : la saisie, espaces de bord ôtés, ou null si la personne renonce. */
export function saisir(options: OptionsSaisie): Promise<string | null> {
  if (abonnes.size === 0) return Promise.resolve(window.prompt(options.titre, options.valeur ?? ""));
  return new Promise((resoudre) => ajouter({ ...options, id: suivant++, genre: "saisie", resoudre }));
}

/** Un avis à lire, avec un seul bouton. */
export function avertir(message: string, titre?: string): Promise<void> {
  if (abonnes.size === 0) {
    window.alert(message);
    return Promise.resolve();
  }
  return new Promise((resoudre) => ajouter({ id: suivant++, genre: "avis", titre: titre ?? message, detail: titre ? message : null, resoudre }));
}

const BOUTON = "h-cible rounded-lg px-4 text-sm font-semibold disabled:opacity-50";
const SECONDAIRE = `${BOUTON} border border-[var(--filet)] hover:bg-[var(--surface-creuse)]`;
const PRINCIPAL = `${BOUTON} bg-marque-600 text-white hover:bg-marque-700`;
const DANGER = `${BOUTON} bg-danger-500 text-white hover:bg-danger-600`;

const FOCALISABLES = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])';

const vide: readonly Demande[] = [];

/** À monter une seule fois : la mise en page racine s'en charge. */
export function Dialogues() {
  const demandes = useSyncExternalStore(sAbonner, () => file, () => vide);
  const courante = demandes[0];
  if (!courante) return null;
  return createPortal(<Boite key={courante.id} demande={courante} />, document.body);
}

function Boite({ demande }: { demande: Demande }) {
  const panneau = useRef<HTMLDivElement>(null);
  const idTitre = useId();
  const idDetail = useId();
  const [valeur, setValeur] = useState(demande.genre === "saisie" ? (demande.valeur ?? "") : "");

  useEffect(() => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Le champ d'abord ; pour un geste qui détruit, « Retour » plutôt que le bouton rouge.
    const cible = panneau.current?.querySelector<HTMLElement>("[data-focus-initial]") ?? panneau.current;
    cible?.focus();
    if (cible instanceof HTMLInputElement) cible.select();
    const defilement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = defilement;
      if (avant?.isConnected) avant.focus();
    };
  }, []);

  function clore(reponse: "oui" | "non") {
    retirer(demande.id);
    if (demande.genre === "confirmation") demande.resoudre(reponse === "oui");
    else if (demande.genre === "avis") demande.resoudre();
    else demande.resoudre(reponse === "oui" && !demande.lectureSeule ? valeur.trim() : null);
  }

  const minimum = demande.genre === "saisie" ? (demande.minimum ?? 1) : 0;
  const saisieValide = demande.genre !== "saisie" || demande.lectureSeule || valeur.trim().length >= minimum;

  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      clore("non");
      return;
    }
    if (e.key !== "Tab" || !panneau.current) return;
    const elements = [...panneau.current.querySelectorAll<HTMLElement>(FOCALISABLES)];
    if (elements.length === 0) return;
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  const titre = demande.titre;
  const detail = demande.detail ?? null;
  const danger = demande.genre === "confirmation" && demande.danger;
  const action = demande.genre === "confirmation" ? demande.action : demande.genre === "saisie" ? (demande.action ?? "Valider") : "Compris";
  const seulBouton = demande.genre === "avis" || (demande.genre === "saisie" && demande.lectureSeule);

  return (
    // Au-dessus des fenêtres de formulaire (z-60), sous le voile du verrou d'inactivité (z-1000).
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-nuit-profond/55 p-4 sm:items-center print:hidden">
      <div
        ref={panneau}
        role={demande.genre === "confirmation" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={detail ? idDetail : undefined}
        tabIndex={-1}
        onKeyDown={auClavier}
        className="w-full max-w-md rounded-2xl bg-[var(--surface)] text-left shadow-2xl outline-none"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (saisieValide) clore("oui");
          }}
        >
          <div className="px-5 pb-4 pt-5">
            <h2 id={idTitre} className="text-base font-semibold leading-snug text-[var(--encre)]">
              {titre}
            </h2>
            {detail && (
              <p id={idDetail} className="mt-1.5 whitespace-pre-line text-sm text-[var(--encre-douce)]">
                {detail}
              </p>
            )}
            {demande.genre === "saisie" && (
              <label className="mt-3 block">
                {demande.libelle && <span className="mb-1 block text-sm font-medium">{demande.libelle}</span>}
                <input
                  data-focus-initial
                  type={demande.type ?? "text"}
                  value={valeur}
                  readOnly={demande.lectureSeule}
                  onChange={(e) => setValeur(e.target.value)}
                  placeholder={demande.placeholder}
                  maxLength={demande.maximum}
                  className={CLASSE_CHAMP}
                />
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--filet)] px-5 py-3">
            {seulBouton ? (
              <button type="submit" data-focus-initial={demande.genre === "avis" ? true : undefined} className={PRINCIPAL}>
                {demande.genre === "avis" ? action : "Fermer"}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => clore("non")} data-focus-initial={danger ? true : undefined} className={SECONDAIRE}>
                  Retour
                </button>
                <button type="submit" disabled={!saisieValide} data-focus-initial={!danger && demande.genre === "confirmation" ? true : undefined} className={danger ? DANGER : PRINCIPAL}>
                  {action}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
