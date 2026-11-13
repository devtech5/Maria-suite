"use client";

import { useState } from "react";

import { BoutonApercu } from "@/components/ui/apercu";
import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { PrisePhoto } from "@/components/ui/prise-photo";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Champ } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { annulerIntervenant, confierIntervenant, fixerBudget, ouvrirDecharge, payerIntervenant } from "@/modules/missions/intervenants-actions";
import { MOYENS, NATURES_INTERVENANT, TACHES_COURANTES, estNature, type NatureIntervenant } from "@/modules/missions/budget";

export function FixerBudget({ missionId, budget }: { missionId: string; budget: number | null }) {
  return (
    <FormulaireRepliable libelle={budget === null ? "Fixer le budget" : "Modifier le budget"} titre="Budget des intervenants" action={(d) => fixerBudget(missionId, d)} presentation="modale">
      <Champ libelle="Budget" precision="En francs, entier. Les intervenants se confient et se paient dans cette limite ; il ne peut pas descendre sous ce qui est déjà confié.">
        <input name="budget" required inputMode="numeric" defaultValue={budget === null ? "" : String(budget)} autoFocus className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
    </FormulaireRepliable>
  );
}

export interface ChoixIntervenants {
  intervenants: { id: string; nom: string; telephone: string | null }[];
  prestataires: { id: string; nom: string; telephone: string | null }[];
}

/** Confier une tâche précise : manutention, vendeuse, entreprise, prestataire. */
export function ConfierIntervenant({ missionId, choix, reste, desactive }: { missionId: string; choix: ChoixIntervenants; reste: number | null; desactive: boolean }) {
  return (
    <FormulaireRepliable libelle="Confier une tâche" titre="Confier une tâche à un intervenant" action={(d) => confierIntervenant(missionId, d)} presentation="ample" desactive={desactive}>
      <ChampsIntervenant choix={choix} reste={reste} />
    </FormulaireRepliable>
  );
}

function ChampsIntervenant({ choix, reste }: { choix: ChoixIntervenants; reste: number | null }) {
  const [qui, setQui] = useState("");
  const [nature, setNature] = useState<NatureIntervenant>("intervenant");
  const libre = qui === "libre";
  return (
    <div className="space-y-4">
      <datalist id="taches-courantes">
        {TACHES_COURANTES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Tâche" precision="Une tâche précise.">
          <input name="tache" required minLength={3} maxLength={120} list="taches-courantes" placeholder="Manutention, vendeuse, nettoyage…" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Montant convenu" precision={reste === null ? undefined : `Il reste ${fmt(reste)} F au budget.`}>
          <input name="montant" required inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Qui intervient">
          <select name="qui" required value={qui} onChange={(e) => setQui(e.target.value)} className={CLASSE_CHAMP}>
            <option value="" disabled>
              — Choisir —
            </option>
            {choix.intervenants.length > 0 && (
              <optgroup label="Intervenants enregistrés">
                {choix.intervenants.map((i) => (
                  <option key={i.id} value={`w:${i.id}`}>
                    {i.nom}
                  </option>
                ))}
              </optgroup>
            )}
            {choix.prestataires.length > 0 && (
              <optgroup label="Prestataires">
                {choix.prestataires.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>
                    {p.nom}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="libre">+ Une autre personne ou entreprise…</option>
          </select>
        </Champ>
        <Champ libelle="Nature">
          <select name="nature" value={libre ? nature : qui.startsWith("p:") ? "prestataire" : "intervenant"} disabled={!libre} onChange={(e) => estNature(e.target.value) && setNature(e.target.value)} className={CLASSE_CHAMP}>
            {Object.entries(NATURES_INTERVENANT).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
          {/* Un champ désactivé ne part pas : la nature se renvoie en caché. */}
          {!libre && <input type="hidden" name="nature" value={qui.startsWith("p:") ? "prestataire" : "intervenant"} />}
        </Champ>
        {libre && (
          <>
            <Champ libelle="Nom">
              <input name="nom" required minLength={2} maxLength={120} className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Téléphone">
              <input name="telephone" inputMode="tel" className={CLASSE_CHAMP} />
            </Champ>
          </>
        )}
      </div>
    </div>
  );
}

export function PayerIntervenant({ id, nom, montant, aujourdhui }: { id: string; nom: string; montant: number; aujourdhui: string }) {
  return (
    <FormulaireRepliable libelle="Payer sur place" titre={`Payer ${nom} — ${fmt(montant)} F`} action={(d) => payerIntervenant(id, d)} presentation="ample">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ libelle="Date">
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
          <Champ libelle="Reçu par" precision="Tel qu'il signe la décharge.">
            <input name="recuPar" required minLength={2} maxLength={120} defaultValue={nom} className={CLASSE_CHAMP} />
          </Champ>
        </div>
        <fieldset className="rounded-xl border border-[var(--filet)] p-3">
          <legend className="px-1 text-sm font-medium">Décharge signée — obligatoire</legend>
          <p className="mb-3 text-xs text-[var(--encre-faible)]">La décharge est la preuve du paiement : sans elle, le paiement n&apos;est pas enregistré.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <PrisePhoto nom="decharge_photo" libelle="Photographier la décharge" />
            <div className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface-creuse)] p-3">
              <p className="text-sm font-medium">Ou joindre un fichier</p>
              <p className="text-xs text-[var(--encre-faible)]">PDF ou photo, 10 Mo au plus.</p>
              <input name="decharge" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" />
            </div>
          </div>
        </fieldset>
      </div>
    </FormulaireRepliable>
  );
}

export function AnnulerIntervenant({ id }: { id: string }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="text-xs font-semibold text-[var(--encre-faible)] hover:text-danger-600 hover:underline">
        Annuler
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de l'annulation" aria-label="Motif de l'annulation" className={`${CLASSE_CHAMP_COMPACT} h-8 w-44 text-xs`} />
      <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => annulerIntervenant(id, motif))} className="h-8 rounded-lg border border-danger-500 px-2.5 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50">
        Confirmer
      </button>
      <button type="button" onClick={() => setOuvert(false)} className="text-xs text-[var(--encre-faible)] hover:underline">
        Non
      </button>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
    </span>
  );
}

/** La décharge s'ouvre dans la plateforme, jamais dans un autre onglet. */
export function VoirDecharge({ id, nom }: { id: string; nom: string | null }) {
  return (
    <BoutonApercu piece={{ titre: "Décharge de paiement", nomFichier: nom, signer: () => ouvrirDecharge(id) }} className="text-xs font-semibold text-marque-600 hover:underline">
      Voir la décharge
    </BoutonApercu>
  );
}
