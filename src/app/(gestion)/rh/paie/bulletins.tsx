"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { modifierElements, retirerBulletin } from "@/modules/paie/actions";
import { formatJours } from "@/modules/presences/calcul";

export interface BulletinAffiche {
  id: string;
  numero: string | null;
  matricule: string;
  nom: string;
  poste: string;
  numeroCnps: string | null;
  salaireBase: number;
  /** Centièmes de jour. */
  joursMois: number;
  joursHorsContrat: number;
  joursSansSolde: number;
  joursAbsenceSaisis: number;
  retenueAbsence: number;
  primesImposables: number;
  indemnitesNonImposables: number;
  retenuesDiverses: number;
  brut: number;
  cnpsSalarie: number;
  impot: number;
  net: number;
  payeLe: string | null;
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const entier = (v: string) => {
  const p = v.replace(/[\s  ]/g, "");
  return /^\d+$/.test(p) ? Number(p) : p === "" ? 0 : Number.NaN;
};
/** « 1,5 » → 150 centièmes ; NaN hors des jours et demi-journées. */
const centiemes = (v: string) => {
  const p = v.replace(/\s/g, "").replace(",", ".");
  if (p === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(p)) return Number.NaN;
  const c = Math.round(Number(p) * 100);
  return c % 50 === 0 ? c : Number.NaN;
};
const saisieJours = (c: number) => (c ? String(c / 100).replace(".", ",") : "");

/** Détail des jours non payés : hors contrat, sans solde, absences saisies. */
function detailAbsences(b: BulletinAffiche): string {
  return [
    b.joursHorsContrat ? `${formatJours(b.joursHorsContrat)} hors contrat` : null,
    b.joursSansSolde ? `${formatJours(b.joursSansSolde)} sans solde` : null,
    b.joursAbsenceSaisis ? `${formatJours(b.joursAbsenceSaisis)} d'absence` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Bulletins du mois. En préparation, les éléments variables se saisissent sur
 * la ligne et le net se recalcule au serveur, avec le barème en vigueur.
 */
export function TableBulletins({ bulletins, modifiable }: { bulletins: BulletinAffiche[]; modifiable: boolean }) {
  const [edition, setEdition] = useState<{ id: string; absences: string; primes: string; indemnites: string; retenues: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  function lancer(action: () => Promise<Resultat>) {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok) setEdition(null);
      routeur.refresh();
    });
  }

  return (
    <>
      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}
      <Tableau>
        <thead>
          <tr>
            <Th>Salarié</Th>
            <Th aligne="droite">Base</Th>
            <Th aligne="droite">Absences</Th>
            <Th aligne="droite">Primes</Th>
            <Th aligne="droite">Brut</Th>
            <Th aligne="droite">CNPS</Th>
            <Th aligne="droite">Impôt</Th>
            <Th aligne="droite">Indemnités</Th>
            <Th aligne="droite">Retenues</Th>
            <Th aligne="droite">Net à payer</Th>
            <Th>{modifiable ? "" : "Bulletin"}</Th>
          </tr>
        </thead>
        <tbody>
          {bulletins.map((b) =>
            edition?.id === b.id ? (
              <tr key={b.id} className="bg-[var(--surface-creuse)]">
                <Td fort>
                  {b.nom}
                  <span className="block text-xs font-normal text-[var(--encre-faible)]">{b.matricule}</span>
                </Td>
                <Td aligne="droite" chiffres>{fmt(b.salaireBase)}</Td>
                <Td aligne="droite">
                  <input
                    aria-label="Jours d'absence non payés"
                    title="Absences non rémunérées constatées, en jours (1,5 pour un jour et demi). Les congés sans solde accordés et les jours hors contrat se comptent déjà."
                    inputMode="decimal"
                    placeholder="jours"
                    value={edition.absences}
                    onChange={(e) => setEdition({ ...edition, absences: e.target.value })}
                    className={`${CLASSE_CHAMP_COMPACT} chiffres h-8 w-16 text-right`}
                  />
                </Td>
                <Td aligne="droite">
                  <input aria-label="Primes imposables" inputMode="numeric" value={edition.primes} onChange={(e) => setEdition({ ...edition, primes: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} chiffres h-8 w-24 text-right`} />
                </Td>
                <Td aligne="droite" chiffres>—</Td>
                <Td aligne="droite" chiffres>—</Td>
                <Td aligne="droite" chiffres>—</Td>
                <Td aligne="droite">
                  <input aria-label="Indemnités non imposables" inputMode="numeric" value={edition.indemnites} onChange={(e) => setEdition({ ...edition, indemnites: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} chiffres h-8 w-24 text-right`} />
                </Td>
                <Td aligne="droite">
                  <input aria-label="Retenues diverses" inputMode="numeric" value={edition.retenues} onChange={(e) => setEdition({ ...edition, retenues: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} chiffres h-8 w-24 text-right`} />
                </Td>
                <Td aligne="droite" chiffres>—</Td>
                <Td>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => {
                        const primes = entier(edition.primes);
                        const indemnites = entier(edition.indemnites);
                        const retenues = entier(edition.retenues);
                        const absences = centiemes(edition.absences);
                        if ([primes, indemnites, retenues].some(Number.isNaN)) return setResultat({ ok: false, message: "Montants en francs entiers." });
                        if (Number.isNaN(absences)) return setResultat({ ok: false, message: "Absences en jours ou demi-journées : 1, 1,5, 2…" });
                        lancer(() => modifierElements(b.id, { primesImposables: primes, indemnitesNonImposables: indemnites, retenuesDiverses: retenues, joursAbsenceSaisis: absences }));
                      }}
                      className="rounded-lg bg-marque-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Recalculer
                    </button>
                    <button type="button" onClick={() => setEdition(null)} className="text-xs text-[var(--encre-faible)] hover:underline">
                      Retour
                    </button>
                  </span>
                </Td>
              </tr>
            ) : (
              <tr key={b.id}>
                <Td fort>
                  {b.nom}
                  <span className="block text-xs font-normal text-[var(--encre-faible)]">
                    {b.matricule} · {b.poste}
                    {!b.numeroCnps && <span className="text-alerte-600"> · sans n° CNPS</span>}
                  </span>
                </Td>
                <Td aligne="droite" chiffres>{fmt(b.salaireBase)}</Td>
                <Td aligne="droite" chiffres>
                  {b.retenueAbsence ? (
                    <span title={detailAbsences(b)}>
                      − {fmt(b.retenueAbsence)}
                      <span className="block text-xs text-[var(--encre-faible)]">{formatJours(b.joursHorsContrat + b.joursSansSolde + b.joursAbsenceSaisis)}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td aligne="droite" chiffres>{b.primesImposables ? fmt(b.primesImposables) : "—"}</Td>
                <Td aligne="droite" chiffres>{fmt(b.brut)}</Td>
                <Td aligne="droite" chiffres>− {fmt(b.cnpsSalarie)}</Td>
                <Td aligne="droite" chiffres>− {fmt(b.impot)}</Td>
                <Td aligne="droite" chiffres>{b.indemnitesNonImposables ? `+ ${fmt(b.indemnitesNonImposables)}` : "—"}</Td>
                <Td aligne="droite" chiffres>{b.retenuesDiverses ? `− ${fmt(b.retenuesDiverses)}` : "—"}</Td>
                <Td aligne="droite" chiffres fort>{fmt(b.net)}</Td>
                <Td>
                  {modifiable ? (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEdition({ id: b.id, absences: saisieJours(b.joursAbsenceSaisis), primes: String(b.primesImposables), indemnites: String(b.indemnitesNonImposables), retenues: String(b.retenuesDiverses) })}
                        className="text-xs font-semibold text-marque-600 hover:underline"
                      >
                        Éléments
                      </button>
                      <button type="button" disabled={enCours} onClick={() => lancer(() => retirerBulletin(b.id))} className="text-xs text-[var(--encre-faible)] hover:underline">
                        Retirer
                      </button>
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {b.payeLe ? <Pastille ton="valide">Payé le {JOUR.format(new Date(`${b.payeLe}T00:00:00Z`))}</Pastille> : <Pastille ton="alerte">À payer</Pastille>}
                      <Link href={`/rh/paie/bulletins/${b.id}`} className="text-xs font-semibold text-marque-600 hover:underline">
                        {b.numero}
                      </Link>
                    </span>
                  )}
                </Td>
              </tr>
            ),
          )}
        </tbody>
      </Tableau>
    </>
  );
}
