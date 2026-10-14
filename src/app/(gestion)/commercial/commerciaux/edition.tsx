"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { enregistrerCommercial, payerCommission, reporterEnPaie, validerCommission } from "@/modules/commerciaux/actions";

interface Option {
  id: string;
  nom: string;
}

export interface FicheInitiale {
  id?: string;
  nom: string;
  telephone: string;
  userId: string;
  employeeId: string;
  base: "ca_ht" | "marge";
  tauxBp: number;
  paliers: { seuil: number; tauxBp: number }[];
  fixeMensuel: number;
  objectifMensuel: number;
  actif: boolean;
}

const VIDE: FicheInitiale = { nom: "", telephone: "", userId: "", employeeId: "", base: "ca_ht", tauxBp: 0, paliers: [], fixeMensuel: 0, objectifMensuel: 0, actif: true };

/** « 2,5 » → 250 points de base. NaN si illisible. */
const pourcentEnBp = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/\s|%/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
};
const bpEnPourcent = (bp: number) => String(bp / 100).replace(".", ",");
const entier = (s: string) => Number(s.replace(/[\s ]/g, "") || 0);

export function ChoixMois({ mois, max }: { mois: string; max: string }) {
  const routeur = useRouter();
  return (
    <input
      type="month"
      value={mois}
      max={max}
      aria-label="Mois"
      onChange={(e) => e.target.value && routeur.replace(`/commercial/commerciaux?mois=${e.target.value}`)}
      className={`${CLASSE_CHAMP_COMPACT} h-cible`}
    />
  );
}

function FormulaireFiche({ initiale, membres, salaries, onFerme }: { initiale: FicheInitiale; membres: Option[]; salaries: Option[]; onFerme: () => void }) {
  const op = useOperation();
  const [f, setF] = useState({
    ...initiale,
    taux: bpEnPourcent(initiale.tauxBp),
    fixe: initiale.fixeMensuel ? String(initiale.fixeMensuel) : "",
    objectif: initiale.objectifMensuel ? String(initiale.objectifMensuel) : "",
    paliersSaisis: initiale.paliers.map((p) => ({ seuil: String(p.seuil), taux: bpEnPourcent(p.tauxBp) })),
  });
  const [mode, setMode] = useState<"unique" | "paliers">(initiale.paliers.length ? "paliers" : "unique");
  const maj = (champ: Partial<typeof f>) => setF((p) => ({ ...p, ...champ }));
  // Lié à un salarié ou à un compte, le commercial prend le nom de sa fiche.
  const sansFiche = !f.employeeId && !f.userId;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const paliers = mode === "paliers" ? f.paliersSaisis.map((p) => ({ seuil: entier(p.seuil), tauxBp: pourcentEnBp(p.taux) })) : null;
        op.lancer(
          () =>
            enregistrerCommercial(initiale.id ?? null, {
              nom: sansFiche ? f.nom : null,
              telephone: sansFiche ? f.telephone || null : null,
              userId: f.userId || null,
              employeeId: f.employeeId || null,
              base: f.base,
              tauxBp: mode === "unique" ? pourcentEnBp(f.taux) : 0,
              paliers,
              fixeMensuel: entier(f.fixe),
              objectifMensuel: entier(f.objectif),
              actif: f.actif,
            }),
          onFerme,
        );
      }}
      className="space-y-3 rounded-xl border border-[var(--filet)] bg-[var(--surface-creuse)] p-4 text-left text-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sansFiche ? (
          <>
            <label>
              <span className="mb-1 block font-medium">Nom</span>
              <input required value={f.nom} onChange={(e) => maj({ nom: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} h-9 w-full`} />
            </label>
            <label>
              <span className="mb-1 block font-medium">Téléphone</span>
              <input value={f.telephone} onChange={(e) => maj({ telephone: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} h-9 w-full`} />
            </label>
          </>
        ) : (
          <p className="self-end pb-2 text-xs text-[var(--encre-faible)] sm:col-span-2">
            Nom et téléphone repris de la fiche {f.employeeId ? "du salarié" : "du compte"} : rien à ressaisir.
          </p>
        )}
        <label>
          <span className="mb-1 block font-medium">Utilisateur (caisse)</span>
          <select value={f.userId} onChange={(e) => maj({ userId: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} h-9 w-full`}>
            <option value="">— aucun —</option>
            {membres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium">Salarié (paie)</span>
          <select value={f.employeeId} onChange={(e) => maj({ employeeId: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} h-9 w-full`}>
            <option value="">— externe —</option>
            {salaries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium">Calculée sur</span>
          <select value={f.base} onChange={(e) => maj({ base: e.target.value as "ca_ht" | "marge" })} className={`${CLASSE_CHAMP_COMPACT} h-9 w-full`}>
            <option value="ca_ht">le chiffre d&apos;affaires HT</option>
            <option value="marge">la marge</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium">Part fixe mensuelle (F)</span>
          <input inputMode="numeric" value={f.fixe} onChange={(e) => maj({ fixe: e.target.value.replace(/\D/g, "") })} className={`${CLASSE_CHAMP_COMPACT} h-9 w-full`} />
        </label>
        <label>
          <span className="mb-1 block font-medium">Objectif mensuel HT (F)</span>
          <input inputMode="numeric" value={f.objectif} onChange={(e) => maj({ objectif: e.target.value.replace(/\D/g, "") })} className={`${CLASSE_CHAMP_COMPACT} h-9 w-full`} />
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" checked={f.actif} onChange={(e) => maj({ actif: e.target.checked })} />
          <span>Actif</span>
        </label>
      </div>

      <fieldset>
        <legend className="mb-1 font-medium">Part variable</legend>
        <div className="mb-2 flex gap-4">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "unique"} onChange={() => setMode("unique")} /> Taux unique
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={mode === "paliers"}
              onChange={() => {
                setMode("paliers");
                if (!f.paliersSaisis.length) maj({ paliersSaisis: [{ seuil: "0", taux: f.taux || "3" }, { seuil: "2000000", taux: "5" }] });
              }}
            />{" "}
            Paliers progressifs
          </label>
        </div>
        {mode === "unique" ? (
          <label className="flex items-center gap-2">
            <input value={f.taux} onChange={(e) => maj({ taux: e.target.value })} inputMode="decimal" className={`${CLASSE_CHAMP_COMPACT} h-9 w-24 text-right`} /> %
          </label>
        ) : (
          <div className="space-y-1.5">
            {f.paliersSaisis.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-xs text-[var(--encre-faible)]">{i === 0 ? "À partir de" : "Au-delà de"}</span>
                <input
                  inputMode="numeric"
                  value={p.seuil}
                  disabled={i === 0}
                  onChange={(e) => maj({ paliersSaisis: f.paliersSaisis.map((x, j) => (j === i ? { ...x, seuil: e.target.value.replace(/\D/g, "") } : x)) })}
                  className={`${CLASSE_CHAMP_COMPACT} h-9 w-36 text-right`}
                />
                <span className="text-xs">F :</span>
                <input
                  inputMode="decimal"
                  value={p.taux}
                  onChange={(e) => maj({ paliersSaisis: f.paliersSaisis.map((x, j) => (j === i ? { ...x, taux: e.target.value } : x)) })}
                  className={`${CLASSE_CHAMP_COMPACT} h-9 w-20 text-right`}
                />
                <span className="text-xs">%</span>
                {i > 0 && (
                  <button type="button" onClick={() => maj({ paliersSaisis: f.paliersSaisis.filter((_, j) => j !== i) })} className="text-xs text-[var(--encre-faible)] hover:underline">
                    Retirer
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => maj({ paliersSaisis: [...f.paliersSaisis, { seuil: "", taux: "" }] })} className="text-xs font-semibold text-marque-600 hover:underline">
              + Palier
            </button>
          </div>
        )}
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {op.resultat && <Retour resultat={op.resultat} />}
        <button type="button" onClick={onFerme} className="text-[var(--encre-faible)] hover:underline">
          Fermer
        </button>
        <button type="submit" disabled={op.enCours} className="h-9 rounded-lg bg-marque-600 px-4 font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

export function FicheCommercial({ membres, salaries }: { membres: Option[]; salaries: Option[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="mb-5">
      {ouvert ? (
        <FormulaireFiche initiale={VIDE} membres={membres} salaries={salaries} onFerme={() => setOuvert(false)} />
      ) : (
        <button type="button" onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white">
          Nouveau commercial
        </button>
      )}
    </div>
  );
}

export function ActionsCommission({
  commercialId,
  mois,
  termine,
  salarie,
  validee,
  peutPayer,
  comptes,
  aujourdhui,
  fiche,
  membres,
  salaries,
}: {
  commercialId: string;
  mois: string;
  termine: boolean;
  salarie: boolean;
  validee: { id: string; statut: "validee" | "payee"; total: number } | null;
  peutPayer: boolean;
  comptes: { id: string; nom: string; nature: string; solde: number }[];
  aujourdhui: string;
  fiche: FicheInitiale;
  membres: Option[];
  salaries: Option[];
}) {
  const op = useOperation();
  const [panneau, setPanneau] = useState<"fiche" | "paiement" | "paie" | null>(null);
  const [compte, setCompte] = useState(comptes.find((c) => c.nature === "banque")?.id ?? comptes[0]?.id ?? "");
  const [date, setDate] = useState(aujourdhui);
  const [moisPaie, setMoisPaie] = useState(aujourdhui.slice(0, 7));

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {!validee && termine && (
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => validerCommission(commercialId, mois))} className="h-8 rounded-lg bg-marque-600 px-2.5 text-xs font-semibold text-white disabled:opacity-50">
            Valider
          </button>
        )}
        {validee?.statut === "validee" && peutPayer && validee.total > 0 && (
          <button type="button" onClick={() => setPanneau(salarie ? "paie" : "paiement")} className="h-8 rounded-lg bg-valide-500 px-2.5 text-xs font-semibold text-white">
            {salarie ? "Reporter en paie" : `Payer ${fmt(validee.total)} F`}
          </button>
        )}
        <button type="button" onClick={() => setPanneau(panneau === "fiche" ? null : "fiche")} className="h-8 rounded-lg border border-[var(--filet)] px-2.5 text-xs font-semibold hover:bg-[var(--surface-creuse)]">
          Règle
        </button>
      </div>

      {panneau === "fiche" && (
        <div className="w-[min(90vw,52rem)]">
          <FormulaireFiche initiale={fiche} membres={membres} salaries={salaries} onFerme={() => setPanneau(null)} />
        </div>
      )}
      {panneau === "paiement" && validee && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => payerCommission(validee.id, { compteTresorerieId: compte, date }), () => setPanneau(null));
          }}
          className="flex flex-wrap items-center justify-end gap-2"
        >
          <select value={compte} onChange={(e) => setCompte(e.target.value)} aria-label="Payé depuis" className={`${CLASSE_CHAMP_COMPACT} h-8 text-xs`}>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} — {fmt(c.solde)} F
              </option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={`${CLASSE_CHAMP_COMPACT} h-8 text-xs`} />
          <button type="submit" disabled={op.enCours || !compte} className="h-8 rounded-lg bg-valide-500 px-3 text-xs font-semibold text-white disabled:opacity-50">
            Payer
          </button>
        </form>
      )}
      {panneau === "paie" && validee && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => reporterEnPaie(validee.id, moisPaie), () => setPanneau(null));
          }}
          className="flex flex-wrap items-center justify-end gap-2 text-xs"
        >
          <span>Paie de</span>
          <input type="month" value={moisPaie} onChange={(e) => setMoisPaie(e.target.value)} aria-label="Mois de paie" className={`${CLASSE_CHAMP_COMPACT} h-8 text-xs`} />
          <button type="submit" disabled={op.enCours} className="h-8 rounded-lg bg-valide-500 px-3 font-semibold text-white disabled:opacity-50">
            Ajouter aux primes
          </button>
        </form>
      )}
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}
