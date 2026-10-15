"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { enregistrerRegleImpot } from "@/modules/fiscalite/actions";
import { determinerImpot, fractionsImpot, type RegleImpotBenefices } from "@/modules/fiscalite/resultat";

const libelle = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";
/** Saisie en pour cent (25), stockage en points de base (2500). */
const versBp = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const depuisBp = (bp: number) => String(bp / 100).replace(".", ",");
const entier = (v: string) => Number(v.replace(/\s/g, "")) || 0;

/**
 * Règle d'impôt de l'entreprise. Un exemple se recalcule à chaque frappe :
 * c'est lui qu'on confronte à la déclaration de l'an dernier avant d'attester.
 */
export function EditeurRegleImpot({ initial, sourcePays }: { initial: RegleImpotBenefices; sourcePays: string }) {
  const op = useOperation();
  const [champs, setChamps] = useState({
    taux: depuisBp(initial.tauxBp),
    imfTaux: depuisBp(initial.imfTauxBp),
    imfMin: String(initial.imfMinimum),
    imfMax: String(initial.imfMaximum),
    echeances: initial.echeances.join(", "),
  });
  const [atteste, setAtteste] = useState(false);
  const [exemple, setExemple] = useState({ resultat: "20000000", ca: "300000000" });

  const regle: RegleImpotBenefices = {
    tauxBp: versBp(champs.taux),
    imfTauxBp: versBp(champs.imfTaux),
    imfMinimum: entier(champs.imfMin),
    imfMaximum: entier(champs.imfMax),
    echeances: champs.echeances
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean),
    source: initial.source,
  };
  let apercu: ReturnType<typeof determinerImpot> | null = null;
  try {
    apercu = determinerImpot({ resultatComptable: entier(exemple.resultat), reintegrations: 0, deductions: 0, chiffreAffaires: entier(exemple.ca) }, regle);
  } catch {
    apercu = null;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
        <p className="mb-4 rounded-lg bg-[var(--surface-creuse)] p-3 text-xs text-[var(--encre-douce)]">{sourcePays}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={libelle}>Taux de l&apos;impôt sur le résultat fiscal (%)</span>
            <input inputMode="decimal" value={champs.taux} onChange={(e) => setChamps({ ...champs, taux: e.target.value })} className={`${CLASSE_CHAMP} chiffres`} />
          </label>
          <label className="block">
            <span className={libelle}>Impôt minimum forfaitaire (% du chiffre d&apos;affaires)</span>
            <input inputMode="decimal" value={champs.imfTaux} onChange={(e) => setChamps({ ...champs, imfTaux: e.target.value })} className={`${CLASSE_CHAMP} chiffres`} />
          </label>
          <label className="block">
            <span className={libelle}>Minimum forfaitaire plancher (F)</span>
            <input inputMode="numeric" value={champs.imfMin} onChange={(e) => setChamps({ ...champs, imfMin: e.target.value })} className={`${CLASSE_CHAMP} chiffres`} />
          </label>
          <label className="block">
            <span className={libelle}>Minimum forfaitaire plafond (F, 0 : sans plafond)</span>
            <input inputMode="numeric" value={champs.imfMax} onChange={(e) => setChamps({ ...champs, imfMax: e.target.value })} className={`${CLASSE_CHAMP} chiffres`} />
          </label>
          <label className="block sm:col-span-2">
            <span className={libelle}>Échéances des fractions dans l&apos;année suivante (MM-JJ, séparées par des virgules)</span>
            <input value={champs.echeances} onChange={(e) => setChamps({ ...champs, echeances: e.target.value })} className={`${CLASSE_CHAMP} chiffres`} />
          </label>
        </div>

        <label className="mt-6 flex items-start gap-2.5 rounded-lg border border-alerte-500 bg-alerte-50 p-3 text-sm text-alerte-600">
          <input type="checkbox" checked={atteste} onChange={(e) => setAtteste(e.target.checked)} className="mt-0.5 accent-marque-600" />
          <span>
            J&apos;atteste avoir vérifié ce taux, ce minimum et ces échéances auprès de la DGI (ou de notre comptable), et les avoir confrontés à la dernière
            déclaration de l&apos;entreprise. Sans cette attestation, la règle est enregistrée mais aucun impôt ne peut être constaté.
          </span>
        </label>
        {op.resultat && <Retour resultat={op.resultat} />}
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => enregistrerRegleImpot(regle, atteste))} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
            {op.enCours ? "Enregistrement…" : atteste ? "Enregistrer et attester" : "Enregistrer sans attester"}
          </button>
        </div>
      </section>

      <aside className="h-fit rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 lg:sticky lg:top-6">
        <h2 className="text-base font-semibold">Exemple</h2>
        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className={libelle}>Résultat avant impôt (F)</span>
            <input inputMode="numeric" value={exemple.resultat} onChange={(e) => setExemple({ ...exemple, resultat: e.target.value })} className={`${CLASSE_CHAMP} chiffres`} />
          </label>
          <label className="block">
            <span className={libelle}>Chiffre d&apos;affaires (F)</span>
            <input inputMode="numeric" value={exemple.ca} onChange={(e) => setExemple({ ...exemple, ca: e.target.value })} className={`${CLASSE_CHAMP} chiffres`} />
          </label>
        </div>
        {apercu ? (
          <dl className="chiffres mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Impôt au taux</dt><dd>{fmt(apercu.impotTheorique)}</dd></div>
            <div className="flex justify-between"><dt>Minimum forfaitaire</dt><dd>{fmt(apercu.imf)}</dd></div>
            <div className="flex justify-between border-t border-[var(--filet)] pt-1 font-bold"><dt>Impôt dû</dt><dd>{fmt(apercu.impotDu)}</dd></div>
            {fractionsImpot("2026", apercu.impotDu, regle.echeances).map((f) => (
              <div key={f.rang} className="flex justify-between text-[var(--encre-faible)]">
                <dt>Fraction {f.rang} · {f.echeance.slice(8, 10)}/{f.echeance.slice(5, 7)}</dt>
                <dd>{fmt(f.montant)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-danger-600">Règle incomplète.</p>
        )}
      </aside>
    </div>
  );
}
