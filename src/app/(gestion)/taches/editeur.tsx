"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { joindreFichierTache, publierMessage } from "@/modules/taches/actions";
import { FICHIER_MAX_OCTETS, MESSAGE_MAX, TYPES_FICHIER } from "@/modules/taches/suivi-regles";

import { useTaches } from "./contexte";
import { CorpsMessage } from "./corps-message";
import type { TacheAffichee } from "./types";

const EMOJIS = ["👍", "👏", "🙏", "✅", "⚠️", "❗", "🔥", "🎉", "📌", "📎", "🚚", "🏗️", "💰", "📅", "⏳", "😊"];

/** Petits dessins de la barre d'outils, au trait. */
const DESSINS: Record<string, ReactNode> = {
  numerotee: <path d="M6 4h8M6 8h8M6 12h8M2 3.5h1v2M2 7h1.5L2 9h1.5M2 11h1.5v2H2" />,
  puces: <path d="M6 4h8M6 8h8M6 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />,
  coche: <path d="M2 3h4v4H2zM3 5l.8.8L5.3 4M8 5h6M2 9h4v4H2zM8 11h6" />,
  lien: <path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5L8 4.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l1-1" />,
  filet: <path d="M2 8h12" />,
  mention: <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 0v1a1.5 1.5 0 0 0 3 0V8a5.5 5.5 0 1 0-2.2 4.4" />,
  trombone: <path d="M11 5 6.5 9.5a1.4 1.4 0 0 0 2 2L13 7a2.8 2.8 0 0 0-4-4L4.5 7.5a4.2 4.2 0 0 0 6 6L14 10" />,
  emoji: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM5.5 9.5a3 3 0 0 0 5 0M6 6.5h.01M10 6.5h.01" />,
};

function Dessin({ nom }: { nom: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {DESSINS[nom]}
    </svg>
  );
}

/** Un bouton de la barre d'outils : il ne prend pas le focus, la sélection du texte reste. */
function Bouton({ titre, action, actif = false, desactive = false, large = false, children }: { titre: string; action: () => void; actif?: boolean; desactive?: boolean; large?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      aria-pressed={actif || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
      disabled={desactive}
      className={`grid h-8 place-items-center rounded-md text-sm text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)] disabled:opacity-30 ${large ? "px-2" : "w-8"} ${
        actif ? "bg-[var(--surface-creuse)] text-[var(--encre)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

/**
 * L'éditeur d'une mise à jour. Le texte reste du texte : chaque bouton pose
 * une marque autour de la sélection (`**gras**`) ou en tête des lignes
 * choisies (`[ ] ` pour la check-list). « Aperçu » montre le rendu ; la
 * publication prévient le responsable, les intervenants, le créateur et
 * les comptes mentionnés.
 */
export function Editeur({ t, relire }: { t: TacheAffichee; relire: () => void }) {
  const { mentionnables, peutRemplir } = useTaches();
  const [texte, setTexte] = useState("");
  const [apercu, setApercu] = useState(false);
  const [menu, setMenu] = useState<"mention" | "emoji" | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const routeur = useRouter();

  /**
   * Remplace la sélection et place le curseur, d'un coup, dans le champ
   * lui-même : une frappe rapide qui suit le bouton tombe au bon endroit.
   * L'état reprend ensuite la valeur du champ, identique, que React laisse.
   */
  const remplacer = (debut: number, fin: number, insere: string, curseurDebut: number, curseurFin = curseurDebut) => {
    const z = zone.current;
    if (!z) {
      setTexte(texte.slice(0, debut) + insere + texte.slice(fin));
      return;
    }
    z.focus();
    z.setRangeText(insere, debut, fin, "end");
    z.setSelectionRange(debut + curseurDebut, debut + curseurFin);
    setTexte(z.value);
  };

  const entourer = (marque: string, exemple: string) => {
    const z = zone.current;
    const valeur = z?.value ?? texte;
    const debut = z?.selectionStart ?? valeur.length;
    const fin = z?.selectionEnd ?? valeur.length;
    const choisi = valeur.slice(debut, fin) || exemple;
    remplacer(debut, fin, `${marque}${choisi}${marque}`, marque.length, marque.length + choisi.length);
  };

  /** Préfixe chaque ligne de la sélection : puce, numéro, case. */
  const prefixer = (prefixe: (n: number) => string) => {
    const z = zone.current;
    const valeur = z?.value ?? texte;
    const selDebut = z?.selectionStart ?? valeur.length;
    const selFin = z?.selectionEnd ?? valeur.length;
    const debut = valeur.lastIndexOf("\n", selDebut - 1) + 1;
    const finLigne = valeur.indexOf("\n", selFin);
    const fin = finLigne === -1 ? valeur.length : finLigne;
    const lignes = valeur.slice(debut, fin).split("\n");
    const insere = lignes.map((l, i) => `${prefixe(i + 1)}${l.replace(/^\s*(?:[-•]|\d{1,3}[.)]|\[[ xX]\])\s?/, "")}`).join("\n");
    remplacer(debut, fin, insere, insere.length);
  };

  const inserer = (morceau: string) => {
    const z = zone.current;
    const debut = z?.selectionStart ?? (z?.value ?? texte).length;
    const fin = z?.selectionEnd ?? (z?.value ?? texte).length;
    remplacer(debut, fin, morceau, morceau.length);
  };

  const publier = () => {
    if (!texte.trim()) return;
    setResultat(null);
    demarrer(async () => {
      const r = await publierMessage(t.id, texte);
      setResultat(r.ok ? null : r);
      if (r.ok) {
        setTexte("");
        setApercu(false);
      }
      relire();
      routeur.refresh();
    });
  };

  const joindre = (f: File) => {
    if (f.size > FICHIER_MAX_OCTETS) return setResultat({ ok: false, message: "Fichier trop lourd : 10 Mo au plus." });
    const donnees = new FormData();
    donnees.set("tacheId", t.id);
    donnees.set("fichier", f);
    setResultat(null);
    demarrer(async () => {
      const r = await joindreFichierTache(donnees);
      setResultat(r.ok ? null : r);
      // Le fichier rejoint l'onglet Fichiers ; la mise à jour le cite.
      if (r.ok) inserer(`📎 ${f.name}`);
      relire();
      routeur.refresh();
    });
  };

  if (!peutRemplir(t)) return null;

  return (
    <div className="rounded-xl border-2 border-[#1f76f0]/70 bg-[var(--surface)] focus-within:border-[#1f76f0]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--filet)] px-2 py-1.5" role="toolbar" aria-label="Mise en forme">
        <Bouton titre="Gras" desactive={apercu} action={() => entourer("**", "texte en gras")}><b>B</b></Bouton>
        <Bouton titre="Italique" desactive={apercu} action={() => entourer("*", "texte en italique")}><i className="font-serif">I</i></Bouton>
        <Bouton titre="Souligné" desactive={apercu} action={() => entourer("__", "texte souligné")}><u>U</u></Bouton>
        <Bouton titre="Barré" desactive={apercu} action={() => entourer("~~", "texte barré")}><s>S</s></Bouton>
        <span className="mx-1 h-5 w-px bg-[var(--filet)]" />
        <Bouton titre="Liste numérotée" desactive={apercu} action={() => prefixer((n) => `${n}. `)}><Dessin nom="numerotee" /></Bouton>
        <Bouton titre="Liste à puces" desactive={apercu} action={() => prefixer(() => "- ")}><Dessin nom="puces" /></Bouton>
        <Bouton titre="Check-list" desactive={apercu} action={() => prefixer(() => "[ ] ")}><Dessin nom="coche" /></Bouton>
        <span className="mx-1 h-5 w-px bg-[var(--filet)]" />
        <Bouton
          titre="Lien"
          desactive={apercu}
          action={() => {
            const adresse = window.prompt("Adresse du lien (https://…)");
            if (adresse) inserer(/^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`);
          }}
        >
          <Dessin nom="lien" />
        </Bouton>
        <Bouton titre="Filet de séparation" desactive={apercu} action={() => inserer(`${texte && !texte.endsWith("\n") ? "\n" : ""}---\n`)}><Dessin nom="filet" /></Bouton>
        <span className="ml-auto" />
        <Bouton titre="Aperçu" actif={apercu} action={() => setApercu((a) => !a)} large><span className="text-xs font-semibold">Aperçu</span></Bouton>
      </div>

      {apercu ? (
        <div className="min-h-28 px-4 py-3">
          {texte.trim() ? <CorpsMessage corps={texte} /> : <p className="text-sm text-[var(--encre-faible)]">Rien à afficher.</p>}
        </div>
      ) : (
        <textarea
          ref={zone}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              publier();
            }
          }}
          maxLength={MESSAGE_MAX}
          rows={4}
          placeholder="Écrivez une mise à jour et mentionnez d'autres personnes avec @"
          aria-label="Mise à jour"
          className="block min-h-28 w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed outline-none"
        />
      )}

      <div className="relative flex items-center gap-0.5 px-2 pb-2">
        {mentionnables.length > 0 && (
          <Bouton titre="Mentionner un collaborateur" desactive={apercu} actif={menu === "mention"} action={() => setMenu((m) => (m === "mention" ? null : "mention"))}>
            <Dessin nom="mention" />
          </Bouton>
        )}
        <Bouton titre="Joindre un fichier" desactive={apercu || enCours} action={() => fichier.current?.click()}><Dessin nom="trombone" /></Bouton>
        <Bouton titre="Emoji" desactive={apercu} actif={menu === "emoji"} action={() => setMenu((m) => (m === "emoji" ? null : "emoji"))}><Dessin nom="emoji" /></Bouton>
        <input
          ref={fichier}
          type="file"
          hidden
          accept={Object.keys(TYPES_FICHIER).join(",")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) joindre(f);
          }}
        />
        <span className="ml-auto text-[11px] text-[var(--encre-faible)]">Ctrl + Entrée</span>
        <button
          type="button"
          onClick={publier}
          disabled={enCours || !texte.trim()}
          className="ml-2 h-9 rounded-lg bg-[#1f76f0] px-4 text-sm font-semibold text-white hover:bg-[#1a63cc] disabled:opacity-40"
        >
          {enCours ? "Envoi…" : "Mettre à jour"}
        </button>

        {menu === "mention" && (
          <div role="listbox" aria-label="Mentionner" className="absolute bottom-full left-2 z-10 mb-1 max-h-56 w-64 overflow-y-auto rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-1.5 shadow-xl">
            {mentionnables.map((m) => (
              <button
                key={m.userId}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMenu(null);
                  inserer(`@[${m.nom.replace(/[[\]()]/g, "")}](u:${m.userId}) `);
                }}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-creuse)]"
              >
                @{m.nom}
              </button>
            ))}
          </div>
        )}
        {menu === "emoji" && (
          <div className="absolute bottom-full left-10 z-10 mb-1 grid w-56 grid-cols-8 gap-0.5 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-1.5 shadow-xl">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={e}
                onMouseDown={(x) => x.preventDefault()}
                onClick={() => {
                  setMenu(null);
                  inserer(e);
                }}
                className="grid size-6 place-items-center rounded text-base hover:bg-[var(--surface-creuse)]"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {resultat && (
        <div className="px-3 pb-3">
          <Retour resultat={resultat} />
        </div>
      )}
    </div>
  );
}
