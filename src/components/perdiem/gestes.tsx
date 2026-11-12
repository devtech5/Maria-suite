"use client";

import { useState } from "react";

import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Champ } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { ajouterBareme, annulerPerdiem, attribuerPerdiem, modifierBareme, payerPerdiem, supprimerBareme } from "@/modules/perdiem/actions";
import { MOYENS, montantAttribution } from "@/modules/perdiem/regles";

export interface BaremeAffiche {
  id: string;
  libelle: string;
  montantJournalier: number;
  notes: string | null;
  actif: boolean;
  utilisations: number;
}

/** Les champs d'une ligne du barème, à l'ajout comme à la modification. */
function ChampsBareme({ initial }: { initial?: BaremeAffiche }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <Champ libelle="Libellé" precision="Abidjan, Intérieur du pays, Zone minière, International…">
          <input name="libelle" required minLength={2} maxLength={120} defaultValue={initial?.libelle} autoFocus className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Montant par jour" precision="En francs, entier.">
          <input name="montant" required inputMode="numeric" defaultValue={initial ? String(initial.montantJournalier) : ""} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
      </div>
      <Champ libelle="Notes" precision="Ce que couvre le montant : repas, hébergement, transport local…">
        <textarea name="notes" rows={2} maxLength={500} defaultValue={initial?.notes ?? ""} className={`${CLASSE_CHAMP} h-auto py-2`} />
      </Champ>
      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="actif" defaultChecked={initial.actif} className="size-4 accent-marque-600" /> Proposée à l&apos;attribution
        </label>
      )}
    </div>
  );
}

export function AjoutBareme() {
  return (
    <FormulaireRepliable libelle="Ajouter un montant" titre="Nouvelle ligne du barème" action={ajouterBareme} presentation="modale">
      <ChampsBareme />
    </FormulaireRepliable>
  );
}

/** Modifier, supprimer : la comptable tient le barème. Une ligne déjà utilisée se retire au lieu de s'effacer. */
export function GestesBareme({ ligne }: { ligne: BaremeAffiche }) {
  const op = useOperation();
  return (
    <div className="flex items-center justify-end gap-3">
      <FormulaireRepliable libelle="Modifier" titre={`Modifier — ${ligne.libelle}`} action={(d) => modifierBareme(ligne.id, d)} presentation="modale">
        <ChampsBareme initial={ligne} />
        <p className="mt-3 text-xs text-[var(--encre-faible)]">Les perdiem déjà attribués gardent le montant du jour qu&apos;ils avaient à leur attribution.</p>
      </FormulaireRepliable>
      <button
        type="button"
        disabled={op.enCours}
        onClick={() =>
          window.confirm(
            ligne.utilisations > 0
              ? `« ${ligne.libelle} » a déjà servi ${ligne.utilisations} fois : elle sera retirée du barème, ses perdiem gardent leur montant. Continuer ?`
              : `Supprimer « ${ligne.libelle} » du barème ?`,
          ) && op.lancer(() => supprimerBareme(ligne.id))
        }
        className="text-xs font-semibold text-danger-600 hover:underline"
      >
        Supprimer
      </button>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
    </div>
  );
}

export interface ChoixAttribution {
  collaborateurs: { id: string; nom: string; poste: string }[];
  bareme: { id: string; libelle: string; montant: number }[];
  missions: { id: string; libelle: string }[];
}

/** Attribuer un perdiem : le montant du jour vient du barème, le total se calcule sous les yeux. */
export function AttributionPerdiem({ choix, aujourdhui }: { choix: ChoixAttribution; aujourdhui: string }) {
  return (
    <FormulaireRepliable libelle="Attribuer un perdiem" titre="Attribuer un perdiem" action={attribuerPerdiem} presentation="ample" desactive={choix.bareme.length === 0}>
      <ChampsAttribution choix={choix} aujourdhui={aujourdhui} />
    </FormulaireRepliable>
  );
}

function ChampsAttribution({ choix, aujourdhui }: { choix: ChoixAttribution; aujourdhui: string }) {
  const [baremeId, setBaremeId] = useState("");
  const [jours, setJours] = useState("1");
  const ligne = choix.bareme.find((b) => b.id === baremeId);
  const n = Number(jours);
  const total = ligne && Number.isInteger(n) && n > 0 ? montantAttribution(n, ligne.montant) : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Collaborateur">
          <select name="employeeId" required defaultValue="" className={CLASSE_CHAMP}>
            <option value="" disabled>
              — Choisir dans le personnel —
            </option>
            {choix.collaborateurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} — {c.poste}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Mission" precision="Facultatif : le perdiem se rattache à la mission.">
          <select name="missionId" defaultValue="" className={CLASSE_CHAMP}>
            <option value="">— aucune —</option>
            {choix.missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Barème">
          <select name="baremeId" required value={baremeId} onChange={(e) => setBaremeId(e.target.value)} className={CLASSE_CHAMP}>
            <option value="" disabled>
              — Choisir la ligne du barème —
            </option>
            {choix.bareme.map((b) => (
              <option key={b.id} value={b.id}>
                {b.libelle} — {fmt(b.montant)} F / jour
              </option>
            ))}
          </select>
        </Champ>
        <div className="grid grid-cols-2 gap-4">
          <Champ libelle="Nombre de jours">
            <input name="jours" required inputMode="numeric" value={jours} onChange={(e) => setJours(e.target.value)} className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
          <Champ libelle="À partir du">
            <input name="debut" type="date" defaultValue={aujourdhui} className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
        </div>
      </div>
      <Champ libelle="Motif" precision="Facultatif : destination, objet du déplacement.">
        <input name="motif" maxLength={500} className={CLASSE_CHAMP} />
      </Champ>
      <p className="rounded-xl bg-[var(--surface-creuse)] p-3 text-sm">
        Montant à payer :{" "}
        <span className="chiffres text-base font-bold">{total === null ? "—" : `${fmt(total)} F`}</span>
        {ligne && total !== null && (
          <span className="text-[var(--encre-faible)]">
            {" "}
            ({n} j × {fmt(ligne.montant)} F, figé à l&apos;attribution)
          </span>
        )}
      </p>
    </div>
  );
}

export function PayerPerdiem({ id, numero, montant, aujourdhui }: { id: string; numero: string; montant: number; aujourdhui: string }) {
  return (
    <FormulaireRepliable libelle="Payer" titre={`Payer ${numero} — ${fmt(montant)} F`} action={(d) => payerPerdiem(id, d)} presentation="modale">
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Date de paiement">
          <input name="payeLe" type="date" required defaultValue={aujourdhui} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Moyen">
          <select name="moyen" required defaultValue="especes" className={CLASSE_CHAMP}>
            {Object.entries(MOYENS).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </Champ>
        <div className="sm:col-span-2">
          <Champ libelle="Référence" precision="Facultatif : numéro de transaction, de virement, de bon.">
            <input name="reference" maxLength={120} className={CLASSE_CHAMP} />
          </Champ>
        </div>
      </div>
    </FormulaireRepliable>
  );
}

export function AnnulerPerdiem({ id }: { id: string }) {
  const op = useOperation();
  const [motif, setMotif] = useState("");
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="text-xs font-semibold text-[var(--encre-faible)] hover:text-danger-600 hover:underline">
        Annuler
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de l'annulation" aria-label="Motif de l'annulation" className={`${CLASSE_CHAMP_COMPACT} h-8 w-48 text-xs`} />
      <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => annulerPerdiem(id, motif))} className="h-8 rounded-lg border border-danger-500 px-2.5 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50">
        Confirmer
      </button>
      <button type="button" onClick={() => setOuvert(false)} className="text-xs text-[var(--encre-faible)] hover:underline">
        Non
      </button>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
    </span>
  );
}
