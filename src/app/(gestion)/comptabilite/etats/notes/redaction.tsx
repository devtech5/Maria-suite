"use client";

import { useState } from "react";

import { Fenetre } from "@/components/ui/fenetre";
import { Retour, useOperation } from "@/components/ui/operations";
import { Pastille } from "@/components/ui/primitives";
import { LONGUEUR_MAX_NOTE } from "@/lib/comptabilite/notes-redigees";
import { redigerNote, reprendreNotesPrecedentes } from "@/modules/comptabilite/actions-notes";

export interface NoteAffichee {
  numero: string;
  titre: string;
  aide: string;
  texte: string;
  neant: boolean;
  redigee: boolean;
  /** Dernière modification, déjà mise en forme. */
  modifiee: string | null;
}

const ZONE = "w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-marque-500";

/** Une note : son état, un aperçu, et la fenêtre où l'écrire. */
function CarteNote({ exercice, note, rediger }: { exercice: string; note: NoteAffichee; rediger: boolean }) {
  const op = useOperation();
  const [ouverte, setOuverte] = useState(false);
  const [texte, setTexte] = useState(note.texte);
  const [neant, setNeant] = useState(note.neant);
  const modifie = texte !== note.texte || neant !== note.neant;

  return (
    <li className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            Note {note.numero} — {note.titre}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--encre-faible)]">{note.aide}</p>
        </div>
        <span className="flex items-center gap-2">
          {note.neant ? <Pastille ton="neutre">Néant</Pastille> : note.redigee ? <Pastille ton="valide">Rédigée</Pastille> : <Pastille ton="alerte">À rédiger</Pastille>}
          {rediger && (
            <button type="button" onClick={() => setOuverte(true)} className="text-sm font-semibold text-marque-600 hover:underline">
              {note.redigee ? "Modifier" : "Rédiger"}
            </button>
          )}
        </span>
      </div>
      {note.redigee && !note.neant && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-[var(--encre-douce)]">{note.texte}</p>}
      {note.modifiee && <p className="mt-1.5 text-[11px] text-[var(--encre-faible)]">Modifiée le {note.modifiee}</p>}
      <Retour resultat={op.resultat} />

      <Fenetre ouverte={ouverte} titre={`Note ${note.numero} — ${note.titre}`} sousTitre={note.aide} large retenir={modifie} onFermer={() => setOuverte(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => redigerNote(exercice, note.numero, neant ? "" : texte, neant), () => setOuverte(false));
          }}
          className="space-y-4 px-5 py-4"
        >
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={neant} onChange={(e) => setNeant(e.target.checked)} />
            Néant : rien à déclarer pour {exercice}
          </label>
          {!neant && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Texte de la note · une ligne blanche sépare deux paragraphes</span>
              <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={14} maxLength={LONGUEUR_MAX_NOTE} className={ZONE} />
              <span className="chiffres mt-1 block text-right text-[11px] text-[var(--encre-faible)]">
                {texte.length} / {LONGUEUR_MAX_NOTE}
              </span>
            </label>
          )}
          {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOuverte(false)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
              Retour
            </button>
            <button type="submit" disabled={op.enCours || (!neant && !texte.trim())} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {op.enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </Fenetre>
    </li>
  );
}

/** Reprendre d'un coup les textes de l'exercice précédent qui manquent encore. */
export function ReprendrePrecedent({ exercice }: { exercice: string }) {
  const op = useOperation();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={op.enCours}
        onClick={() => op.lancer(() => reprendreNotesPrecedentes(exercice))}
        className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50"
      >
        {op.enCours ? "Reprise…" : `Reprendre les textes de ${Number(exercice) - 1}`}
      </button>
      <Retour resultat={op.resultat} />
    </div>
  );
}

export function RedactionNotes({ exercice, notes, rediger }: { exercice: string; notes: NoteAffichee[]; rediger: boolean }) {
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <CarteNote key={`${exercice}-${n.numero}`} exercice={exercice} note={n} rediger={rediger} />
      ))}
    </ul>
  );
}
