"use client";

import { useState } from "react";

import { useApercu } from "@/components/ui/apercu";
import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { annulerPermission, deciderPermission, demanderPermission, ouvrirJustificatifPermission } from "@/modules/presences/actions";
import {
  GENRES_PERMISSION,
  MOTIFS_PERMISSION,
  REGULARISATION_JOURS,
  TRAITEMENTS_PERMISSION,
  type GenrePermission,
  type TraitementPermission,
} from "@/modules/presences/permissions";

import type { OptionSalarie } from "./formulaires";

const BOUTON = "h-9 rounded-lg px-3 text-sm font-semibold disabled:opacity-50";

function ChoixTraitement({ name = "traitement", value, onChange }: { name?: string; value?: string; onChange?: (v: TraitementPermission) => void }) {
  return (
    <select
      name={name}
      required
      {...(onChange ? { value, onChange: (e) => onChange(e.target.value as TraitementPermission) } : { defaultValue: "" })}
      className={CLASSE_CHAMP}
    >
      <option value="" disabled>
        Choisir…
      </option>
      {Object.entries(TRAITEMENTS_PERMISSION).map(([cle, l]) => (
        <option key={cle} value={cle}>
          {l}
        </option>
      ))}
    </select>
  );
}

/**
 * Demande de permission (quelques heures) ou d'absence (journées) ; avec la
 * liste des salariés, saisie par un responsable, accordée d'office.
 */
export function FormulairePermission({ salaries, aujourdhui, debutMin }: { salaries?: OptionSalarie[]; aujourdhui: string; debutMin: string }) {
  const [genre, setGenre] = useState<GenrePermission>("heures");
  const [motif, setMotif] = useState<keyof typeof MOTIFS_PERMISSION>("medical");
  return (
    <FormulaireRepliable
      libelle={salaries ? "Saisir une permission" : "Demander une permission"}
      titre={salaries ? "Saisir une permission ou une absence (accordée d'office)" : "Demander une permission ou une absence"}
      action={demanderPermission}
    >
      <fieldset className="mb-3 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Durée</legend>
        {(Object.keys(GENRES_PERMISSION) as GenrePermission[]).map((g) => (
          <label
            key={g}
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm ${
              genre === g ? "border-or bg-or-50 ring-1 ring-or" : "border-[var(--filet)] hover:bg-[var(--surface-creuse)]"
            }`}
          >
            <input type="radio" name="genre" value={g} checked={genre === g} onChange={() => setGenre(g)} className="mt-0.5 accent-marque-600" />
            <span>
              <span className="block font-semibold">{GENRES_PERMISSION[g]}</span>
              <span className="block text-xs text-[var(--encre-faible)]">
                {g === "heures" ? "Sortir quelques heures dans la journée : départ et retour." : "Ne pas venir un ou plusieurs jours entiers."}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {salaries && (
          <Champ libelle="Salarié">
            <select name="employeeId" required defaultValue="" className={CLASSE_CHAMP}>
              <option value="" disabled>
                Choisir…
              </option>
              {salaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}
        {genre === "heures" ? (
          <>
            <Champ libelle="Jour">
              <input name="debut" type="date" required defaultValue={aujourdhui} min={salaries ? undefined : debutMin} className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Départ">
              <input name="heureDebut" type="time" required className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Retour">
              <input name="heureFin" type="time" required className={CLASSE_CHAMP} />
            </Champ>
          </>
        ) : (
          <>
            <Champ libelle="Du">
              <input name="debut" type="date" required min={salaries ? undefined : debutMin} className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Au (inclus)">
              <input name="fin" type="date" required className={CLASSE_CHAMP} />
            </Champ>
          </>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Motif">
          <select name="motif" value={motif} onChange={(e) => setMotif(e.target.value as keyof typeof MOTIFS_PERMISSION)} className={CLASSE_CHAMP}>
            {Object.entries(MOTIFS_PERMISSION).map(([cle, l]) => (
              <option key={cle} value={cle}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle={motif === "autre" ? "Précision" : "Précision (facultatif)"}>
          <input name="precision" maxLength={300} required={motif === "autre"} placeholder="Clinique, mairie, école…" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Justificatif (facultatif)">
          <input name="justificatif" type="file" accept="image/*,application/pdf" className={`${CLASSE_CHAMP} py-1.5`} />
        </Champ>
        {salaries && (
          <Champ libelle="Traitement">
            <ChoixTraitement />
          </Champ>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--encre-faible)]">
        {salaries
          ? "Accordée d'office. « Déduite des congés » retire ce temps du solde du salarié."
          : `Votre responsable décide, et dit comment ce temps est traité : payé, à récupérer, déduit des congés ou non payé. Une permission oubliée se régularise dans les ${REGULARISATION_JOURS} jours.`}
      </p>
    </FormulaireRepliable>
  );
}

export function ActionsPermission({ id, peutDecider, peutAnnuler, aJustificatif }: { id: string; peutDecider: boolean; peutAnnuler: boolean; aJustificatif: boolean }) {
  const op = useOperation();
  const [mode, setMode] = useState<"accorder" | "refuser" | null>(null);
  const [traitement, setTraitement] = useState<TraitementPermission | "">("");
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const apercu = useApercu();
  const fermer = () => {
    setMode(null);
    setCommentaire("");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {aJustificatif && (
          <button
            type="button"
            className="text-sm text-marque-600 hover:underline"
            onClick={() => {
              setErreur(null);
              apercu.ouvrir({
                titre: "Justificatif de permission",
                signer: async () => {
                  const r = await ouvrirJustificatifPermission(id);
                  if (r.ok) return r.url;
                  setErreur(r.message);
                  return null;
                },
              });
            }}
          >
            Justificatif
          </button>
        )}
        {peutDecider && !mode && (
          <>
            <button type="button" disabled={op.enCours} onClick={() => setMode("accorder")} className={`${BOUTON} bg-valide-600 text-white`}>
              Accorder
            </button>
            <button type="button" disabled={op.enCours} onClick={() => setMode("refuser")} className={`${BOUTON} border border-[var(--filet)] bg-[var(--surface)] font-medium`}>
              Refuser
            </button>
          </>
        )}
        {peutAnnuler && !mode && (
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => annulerPermission(id))} className="text-sm text-danger-600 hover:underline">
            Annuler
          </button>
        )}
      </div>
      {mode === "accorder" && (
        <div className="flex w-full max-w-md flex-wrap justify-end gap-1.5">
          <div className="min-w-48 flex-1">
            <ChoixTraitement name="traitement-decision" value={traitement} onChange={setTraitement} />
          </div>
          <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Note (facultatif)" className={`${CLASSE_CHAMP} h-9 min-w-32 flex-1`} />
          <button
            type="button"
            disabled={op.enCours || !traitement}
            onClick={() => op.lancer(() => deciderPermission(id, "approuve", traitement || null, commentaire), fermer)}
            className={`${BOUTON} bg-valide-600 text-white`}
          >
            Accorder
          </button>
          <button type="button" onClick={fermer} aria-label="Fermer" className="text-sm text-[var(--encre-faible)]">
            ✕
          </button>
        </div>
      )}
      {mode === "refuser" && (
        <div className="flex w-full max-w-sm gap-1.5">
          <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Motif du refus" className={`${CLASSE_CHAMP} h-9`} autoFocus />
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => deciderPermission(id, "refuse", null, commentaire), fermer)} className={`${BOUTON} bg-danger-600 text-white`}>
            Refuser
          </button>
          <button type="button" onClick={fermer} aria-label="Fermer" className="text-sm text-[var(--encre-faible)]">
            ✕
          </button>
        </div>
      )}
      {erreur && <p className="text-xs text-danger-600">{erreur}</p>}
      <Retour resultat={op.resultat} />
      {apercu.fenetre}
    </div>
  );
}
