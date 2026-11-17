"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { affecterResultat, annulerImpot, cloturerExercice, constaterImpot, declarerTva, payerFractionImpot, payerTva, rouvrirExercice } from "@/modules/fiscalite/actions";
import { reserveLegaleSuggeree } from "@/modules/fiscalite/resultat";
import { Fenetre } from "@/components/ui/fenetre";

interface Compte {
  id: string;
  nom: string;
  nature: string;
  solde: number;
}

/**
 * Le geste du mois : déclarer — avec confirmation, la déclaration verrouille
 * le mois — ou payer ce qu'elle a liquidé.
 */
export function ActionTva({
  mois,
  geste,
  aPayer,
  comptes,
  aujourdhui,
}: {
  mois: string;
  geste: "declarer" | "payer";
  aPayer: number;
  comptes: Compte[];
  aujourdhui: string;
}) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [compte, setCompte] = useState(comptes.find((c) => c.nature === "banque")?.id ?? comptes[0]?.id ?? "");
  const [date, setDate] = useState(aujourdhui);

  if (geste === "declarer") {
    return (
      <div className="flex flex-col items-end gap-1">
        {!ouvert ? (
          <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg bg-marque-600 px-3 text-xs font-semibold text-white">
            Déclarer
          </button>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="text-alerte-600">Le mois sera verrouillé pour la TVA.</span>
            <button
              type="button"
              disabled={op.enCours}
              onClick={() => op.lancer(() => declarerTva(mois), () => setOuvert(false))}
              className="h-9 rounded-lg bg-marque-600 px-3 font-semibold text-white disabled:opacity-50"
            >
              {op.enCours ? "Dépôt…" : "Confirmer"}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-[var(--encre-faible)] hover:underline">
              Retour
            </button>
          </span>
        )}
        {op.resultat && <Retour resultat={op.resultat} />}
      </div>
    );
  }

  if (comptes.length === 0) return <span className="text-xs text-alerte-600">Aucun compte de trésorerie</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg bg-valide-500 px-3 text-xs font-semibold text-white">
        Payer {fmt(aPayer)} F
      </button>
      <Fenetre ouverte={ouvert} titre={`Payer la TVA — ${fmt(aPayer)} F`} onFermer={() => setOuvert(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => payerTva(mois, { compteTresorerieId: compte, date }), () => setOuvert(false));
          }}
          className="space-y-4 px-5 py-4"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Payé depuis</span>
            <select value={compte} onChange={(e) => setCompte(e.target.value)} className={CLASSE_CHAMP}>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} — {fmt(c.solde)} F
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Date du paiement</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CLASSE_CHAMP} />
          </label>
          {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOuvert(false)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
              Retour
            </button>
            <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-valide-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {op.enCours ? "Paiement…" : "Payer"}
            </button>
          </div>
        </form>
      </Fenetre>
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}

/** Clôturer un exercice : confirmé, il ne se défait que par une réouverture motivée. */
export function CloturerExercice({ exercice, resultat }: { exercice: string; resultat: number }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      {!ouvert ? (
        <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg border border-[var(--filet)] px-3 text-xs font-semibold hover:bg-[var(--surface-creuse)]">
          Clôturer {exercice}
        </button>
      ) : (
        <span className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-alerte-500 bg-alerte-50 px-3 py-2 text-xs text-alerte-600">
          {resultat >= 0 ? `Bénéfice de ${fmt(resultat)} F porté en 131` : `Perte de ${fmt(-resultat)} F portée en 139`}. Plus aucune écriture ne pourra être datée de {exercice}.
          <button
            type="button"
            disabled={op.enCours}
            onClick={() => op.lancer(() => cloturerExercice(exercice), () => setOuvert(false))}
            className="rounded-lg bg-marque-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            {op.enCours ? "Clôture…" : "Confirmer la clôture"}
          </button>
          <button type="button" onClick={() => setOuvert(false)} className="hover:underline">
            Retour
          </button>
        </span>
      )}
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}

const entier = (v: string) => {
  const p = v.replace(/\s/g, "");
  return /^\d+$/.test(p) ? Number(p) : p === "" ? 0 : Number.NaN;
};
const BOUTON = "h-9 rounded-lg border border-[var(--filet)] px-3 text-xs font-semibold hover:bg-[var(--surface-creuse)]";
const CHAMP_MONTANT = `${CLASSE_CHAMP} chiffres text-right`;
const ETIQUETTE = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";

/** Bas d'une fenêtre de saisie : l'erreur éventuelle, Retour et le geste. */
function PiedFenetre({
  op,
  libelle,
  enCours,
  desactive = false,
  onRetour,
}: {
  op: ReturnType<typeof useOperation>;
  libelle: string;
  enCours: string;
  desactive?: boolean;
  onRetour: () => void;
}) {
  return (
    <>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onRetour} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
          Retour
        </button>
        <button type="submit" disabled={op.enCours || desactive} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? enCours : libelle}
        </button>
      </div>
    </>
  );
}

/**
 * Constater l'impôt d'un exercice terminé : le résultat avant impôt vient des
 * écritures, le reste se saisit — réintégrations, déductions, chiffre
 * d'affaires de base du minimum forfaitaire.
 */
export function ConstaterImpot({ exercice, resultatAvantImpot, chiffreAffaires }: { exercice: string; resultatAvantImpot: number; chiffreAffaires: number }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [v, setV] = useState({ reintegrations: "0", deductions: "0", ca: String(chiffreAffaires) });
  const saisie = { reintegrations: entier(v.reintegrations), deductions: entier(v.deductions), chiffreAffaires: entier(v.ca) };
  const invalide = Object.values(saisie).some(Number.isNaN);
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg bg-marque-600 px-3 text-xs font-semibold text-white">
        Constater l&apos;impôt {exercice}
      </button>
      <Fenetre
        ouverte={ouvert}
        titre={`Constater l'impôt ${exercice}`}
        sousTitre={`Résultat avant impôt d'après les écritures : ${fmt(resultatAvantImpot)} F. L'écriture sera datée du 31/12.`}
        onFermer={() => setOuvert(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (invalide) return;
            op.lancer(() => constaterImpot(exercice, saisie), () => setOuvert(false));
          }}
          className="space-y-4 px-5 py-4"
        >
          <label className="block">
            <span className={ETIQUETTE}>Réintégrations</span>
            <input inputMode="numeric" value={v.reintegrations} onChange={(e) => setV({ ...v, reintegrations: e.target.value })} className={CHAMP_MONTANT} />
          </label>
          <label className="block">
            <span className={ETIQUETTE}>Déductions</span>
            <input inputMode="numeric" value={v.deductions} onChange={(e) => setV({ ...v, deductions: e.target.value })} className={CHAMP_MONTANT} />
          </label>
          <label className="block">
            <span className={ETIQUETTE}>Chiffre d&apos;affaires (base du minimum forfaitaire)</span>
            <input inputMode="numeric" value={v.ca} onChange={(e) => setV({ ...v, ca: e.target.value })} className={CHAMP_MONTANT} />
          </label>
          <PiedFenetre op={op} libelle="Constater au 31/12" enCours="Calcul…" desactive={invalide} onRetour={() => setOuvert(false)} />
        </form>
      </Fenetre>
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}

/** Un geste qui demande un motif : annuler l'impôt, rouvrir l'exercice. */
function GesteMotive({ libelle, avertissement, confirmer, action }: { libelle: string; avertissement: string; confirmer: string; action: (motif: string) => Promise<{ ok: boolean; message: string }> }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  return (
    <div className="flex flex-col items-end gap-1">
      {!ouvert ? (
        <button type="button" onClick={() => setOuvert(true)} className={BOUTON}>
          {libelle}
        </button>
      ) : (
        <span className="flex max-w-md flex-col items-end gap-2 rounded-lg border border-alerte-500 bg-alerte-50 px-3 py-2 text-xs text-alerte-600">
          {avertissement}
          <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (obligatoire)" aria-label="Motif" className={`${CLASSE_CHAMP_COMPACT} h-9 w-full text-xs`} />
          <span className="flex gap-2">
            <button
              type="button"
              disabled={op.enCours || motif.trim().length < 5}
              onClick={() => op.lancer(() => action(motif), () => setOuvert(false))}
              className="rounded-lg bg-marque-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              {op.enCours ? "En cours…" : confirmer}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="hover:underline">
              Retour
            </button>
          </span>
        </span>
      )}
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}

export function AnnulerImpot({ exercice }: { exercice: string }) {
  return (
    <GesteMotive
      libelle="Annuler l'impôt"
      avertissement={`L'écriture d'impôt de ${exercice} sera contrepassée et ses fractions retirées.`}
      confirmer="Annuler l'impôt"
      action={(motif) => annulerImpot(exercice, motif)}
    />
  );
}

export function RouvrirExercice({ exercice, affecte }: { exercice: string; affecte: boolean }) {
  return (
    <GesteMotive
      libelle={`Rouvrir ${exercice}`}
      avertissement={`${affecte ? "L'affectation du résultat puis la" : "La"} clôture de ${exercice} seront contrepassées ; l'exercice acceptera de nouveau des écritures. La réouverture est tracée.`}
      confirmer="Rouvrir l'exercice"
      action={(motif) => rouvrirExercice(exercice, motif)}
    />
  );
}

/** Affecter le résultat d'un exercice clos, comme l'a décidé l'assemblée. */
export function AffecterResultat({ exercice, resultat, aujourdhui }: { exercice: string; resultat: number; aujourdhui: string }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const benefice = resultat > 0;
  const legale = reserveLegaleSuggeree(resultat);
  const [v, setV] = useState({
    reserveLegale: String(legale),
    autresReserves: "0",
    dividendes: "0",
    reportANouveau: String(benefice ? resultat - legale : -resultat),
    date: aujourdhui,
  });
  if (resultat === 0) return null;
  const parts = {
    reserveLegale: benefice ? entier(v.reserveLegale) : 0,
    autresReserves: entier(v.autresReserves),
    dividendes: benefice ? entier(v.dividendes) : 0,
    reportANouveau: entier(v.reportANouveau),
  };
  const total = Object.values(parts).reduce((t, x) => t + (Number.isNaN(x) ? 0 : x), 0);
  const attendu = Math.abs(resultat);
  const sousTitre =
    `${benefice ? "Bénéfice" : "Perte"} de ${exercice} : ${fmt(attendu)} F à ${benefice ? "répartir" : "imputer"}.` +
    (benefice ? " La réserve légale proposée est le dixième du bénéfice, tant qu'elle n'atteint pas le cinquième du capital." : "");
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setOuvert(true)} className={BOUTON}>
        Affecter le résultat
      </button>
      <Fenetre ouverte={ouvert} titre={`Affecter le résultat ${exercice}`} sousTitre={sousTitre} onFermer={() => setOuvert(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => affecterResultat(exercice, parts, v.date), () => setOuvert(false));
          }}
          className="space-y-4 px-5 py-4"
        >
          {benefice && (
            <label className="block">
              <span className={ETIQUETTE}>Réserve légale (111)</span>
              <input inputMode="numeric" value={v.reserveLegale} onChange={(e) => setV({ ...v, reserveLegale: e.target.value })} className={CHAMP_MONTANT} />
            </label>
          )}
          <label className="block">
            <span className={ETIQUETTE}>{benefice ? "Autres réserves (118)" : "Imputé sur réserves (118)"}</span>
            <input inputMode="numeric" value={v.autresReserves} onChange={(e) => setV({ ...v, autresReserves: e.target.value })} className={CHAMP_MONTANT} />
          </label>
          {benefice && (
            <label className="block">
              <span className={ETIQUETTE}>Dividendes (465)</span>
              <input inputMode="numeric" value={v.dividendes} onChange={(e) => setV({ ...v, dividendes: e.target.value })} className={CHAMP_MONTANT} />
            </label>
          )}
          <label className="block">
            <span className={ETIQUETTE}>Report à nouveau ({benefice ? "121" : "129"})</span>
            <input inputMode="numeric" value={v.reportANouveau} onChange={(e) => setV({ ...v, reportANouveau: e.target.value })} className={CHAMP_MONTANT} />
          </label>
          <label className="block">
            <span className={ETIQUETTE}>Date de la décision</span>
            <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={CLASSE_CHAMP} />
          </label>
          <p className={`chiffres text-sm ${total === attendu ? "text-valide-600" : "text-alerte-600"}`}>
            Réparti : {fmt(total)} / {fmt(attendu)} F
          </p>
          <PiedFenetre op={op} libelle="Enregistrer l'affectation" enCours="Enregistrement…" desactive={total !== attendu} onRetour={() => setOuvert(false)} />
        </form>
      </Fenetre>
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}

/** Payer une fraction d'impôt depuis un compte de trésorerie. */
export function PayerFraction({ id, montant, comptes, aujourdhui }: { id: string; montant: number; comptes: Compte[]; aujourdhui: string }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [compte, setCompte] = useState(comptes.find((c) => c.nature === "banque")?.id ?? comptes[0]?.id ?? "");
  const [date, setDate] = useState(aujourdhui);
  if (comptes.length === 0) return <span className="text-xs text-alerte-600">Aucun compte de trésorerie</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setOuvert(true)} className="h-9 rounded-lg bg-valide-500 px-3 text-xs font-semibold text-white">
        Payer {fmt(montant)} F
      </button>
      <Fenetre ouverte={ouvert} titre={`Payer une fraction d'impôt — ${fmt(montant)} F`} onFermer={() => setOuvert(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => payerFractionImpot(id, { compteTresorerieId: compte, date }), () => setOuvert(false));
          }}
          className="space-y-4 px-5 py-4"
        >
          <label className="block">
            <span className={ETIQUETTE}>Payé depuis</span>
            <select value={compte} onChange={(e) => setCompte(e.target.value)} className={CLASSE_CHAMP}>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} — {fmt(c.solde)} F
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ETIQUETTE}>Date du paiement</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CLASSE_CHAMP} />
          </label>
          <PiedFenetre op={op} libelle="Payer" enCours="Paiement…" onRetour={() => setOuvert(false)} />
        </form>
      </Fenetre>
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}
