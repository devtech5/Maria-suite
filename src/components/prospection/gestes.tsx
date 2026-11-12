"use client";

import { useState, type ReactNode } from "react";

import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { annulerAction, changerStatutPlan, changerStatutProspect, convertirProspect, planifierAction, realiserAction } from "@/modules/prospection/actions";
import { LIBELLE_STATUT_PROSPECT, STATUTS_PROSPECT, passagePermis, type StatutProspect } from "@/modules/prospection/regles";

import { ChampsAction } from "./champs";

const SECONDAIRE = "h-9 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-xs font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50";
const PRINCIPAL = "h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50";

/**
 * Un geste déplié sous la fiche du prospect, pas dans une fenêtre : sur un
 * téléphone, le commercial garde sous les yeux ce qu'il a déjà noté.
 */
function Geste({ libelle, bouton, action, children }: { libelle: string; bouton: string; action: (d: FormData) => Promise<Resultat>; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const op = useOperation();
  if (!ouvert) {
    return (
      <span className="inline-flex items-center gap-2">
        <button type="button" onClick={() => setOuvert(true)} className={SECONDAIRE}>
          {libelle}
        </button>
        {op.resultat?.ok && <span className="text-xs text-valide-600">{op.resultat.message}</span>}
      </span>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => action(d), () => setOuvert(false));
      }}
      className="mt-2 w-full space-y-3 rounded-xl border border-[var(--filet)] bg-[var(--surface-creuse)] p-3"
    >
      {children}
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOuvert(false)} className={SECONDAIRE}>
          Fermer
        </button>
        <button type="submit" disabled={op.enCours} className={PRINCIPAL}>
          {op.enCours ? "Enregistrement…" : bouton}
        </button>
      </div>
    </form>
  );
}

/** Statuts que peut prendre le prospect depuis le sien (la conversion a son propre geste). */
const suivants = (de: StatutProspect) => STATUTS_PROSPECT.filter((s) => s !== "converti" && s !== de && passagePermis(de, s));

function ChoixStatut({ de, nom, avecInchange }: { de: StatutProspect; nom: string; avecInchange: boolean }) {
  const [choisi, setChoisi] = useState(avecInchange ? "" : (suivants(de)[0] ?? ""));
  return (
    <>
      <Champ libelle="Où en est le prospect ?">
        <select name={nom} value={choisi} onChange={(e) => setChoisi(e.target.value)} className={CLASSE_CHAMP}>
          {avecInchange && <option value="">Inchangé — {LIBELLE_STATUT_PROSPECT[de]}</option>}
          {suivants(de).map((s) => (
            <option key={s} value={s}>
              {LIBELLE_STATUT_PROSPECT[s]}
            </option>
          ))}
        </select>
      </Champ>
      {choisi === "perdu" && (
        <Champ libelle="Pourquoi la piste est perdue">
          <input name="motifPerte" required placeholder="Budget épuisé, déjà équipé, concurrent moins cher…" className={CLASSE_CHAMP} />
        </Champ>
      )}
    </>
  );
}

export function PlanifierAction({ prospectId, aujourdhui }: { prospectId: string; aujourdhui: string }) {
  return (
    <Geste libelle="Planifier une action" bouton="Planifier" action={(d) => planifierAction(prospectId, d)}>
      <ChampsAction aujourdhui={aujourdhui} />
    </Geste>
  );
}

export function ChangerStatut({ prospectId, statut }: { prospectId: string; statut: StatutProspect }) {
  if (suivants(statut).length === 0) return null;
  return (
    <Geste libelle={statut === "perdu" ? "Rouvrir la piste" : "Changer le statut"} bouton="Enregistrer" action={(d) => changerStatutProspect(prospectId, d)}>
      <ChoixStatut de={statut} nom="statut" avecInchange={false} />
    </Geste>
  );
}

export function Convertir({ prospectId, nom, clients }: { prospectId: string; nom: string; clients: { id: string; code: string; nom: string }[] }) {
  return (
    <Geste libelle="Devenu client" bouton="Enregistrer le client" action={(d) => convertirProspect(prospectId, d)}>
      <p className="text-sm">
        Une fiche client est créée pour <strong>{nom}</strong>, avec son type, sa référence et son compte 411 ; la personne rencontrée devient son contact.
      </p>
      <Champ libelle="Déjà au fichier clients ?" precision="Choisissez sa fiche pour la rattacher au lieu d'en créer une nouvelle.">
        <select name="tiersId" defaultValue="" className={CLASSE_CHAMP}>
          <option value="">Non — créer la fiche client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.nom}
            </option>
          ))}
        </select>
      </Champ>
    </Geste>
  );
}

export function CompteRendu({ actionId, statut, aujourdhui }: { actionId: string; statut: StatutProspect; aujourdhui: string }) {
  const [suite, setSuite] = useState(false);
  return (
    <Geste libelle="Compte rendu" bouton="Enregistrer le compte rendu" action={(d) => realiserAction(actionId, d)}>
      <Champ libelle="Compte rendu">
        <textarea name="compteRendu" required rows={3} placeholder="Ce qui a été dit, ce qui est convenu." className={`${CLASSE_CHAMP} h-auto py-2`} />
      </Champ>
      <ChoixStatut de={statut} nom="statutProspect" avecInchange />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={suite} onChange={(e) => setSuite(e.target.checked)} className="size-4 accent-marque-600" />
        Planifier l&apos;action suivante
      </label>
      {suite && <ChampsAction aujourdhui={aujourdhui} prefixe="suite" />}
    </Geste>
  );
}

export function AnnulerAction({ actionId }: { actionId: string }) {
  const op = useOperation();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={op.enCours}
        onClick={() => window.confirm("Annuler cette action ?") && op.lancer(() => annulerAction(actionId))}
        className="text-xs font-semibold text-[var(--encre-faible)] hover:text-danger-600 hover:underline"
      >
        Annuler
      </button>
      {op.resultat && !op.resultat.ok && <span className="text-xs text-danger-600">{op.resultat.message}</span>}
    </span>
  );
}

export function StatutPlan({ planId, statut }: { planId: string; statut: "ouvert" | "clos" }) {
  const op = useOperation();
  const vers = statut === "ouvert" ? "clos" : "ouvert";
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={op.enCours}
        onClick={() => (vers === "ouvert" || window.confirm("Clore ce plan ? Il ne se modifie plus, sauf à le rouvrir.")) && op.lancer(() => changerStatutPlan(planId, vers))}
        className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
      >
        {vers === "clos" ? "Clore le plan" : "Rouvrir le plan"}
      </button>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
    </span>
  );
}
