"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { calculerRappel, modifierElements, retirerBulletin } from "@/modules/paie/actions";
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
  /** Signé : négatif, un trop-perçu repris. */
  rappel: number;
  rappelLibelle: string | null;
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
/** Montant signé : « -15 000 » ou « − 15 000 » pour un trop-perçu. */
const signe = (v: string) => {
  const p = v.replace(/\s/g, "").replace("−", "-");
  return /^-?\d+$/.test(p) ? Number(p) : p === "" ? 0 : Number.NaN;
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

interface Edition {
  id: string;
  absences: string;
  primes: string;
  indemnites: string;
  retenues: string;
  rappel: string;
  rappelLibelle: string;
}

/**
 * Rappel de salaire du bulletin en cours d'édition : saisi à la main, ou
 * chiffré depuis les bulletins validés après une augmentation rétroactive.
 */
function LigneRappel({ b, edition, changer, colonnes }: { b: BulletinAffiche; edition: Edition; changer: (e: Edition) => void; colonnes: number }) {
  const [depuis, setDepuis] = useState("");
  const [salaire, setSalaire] = useState(String(b.salaireBase));
  const [calcul, setCalcul] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();

  function chiffrer() {
    const nouveau = entier(salaire);
    if (!depuis || Number.isNaN(nouveau)) return setCalcul({ ok: false, message: "Mois d'effet et nouveau salaire en francs entiers." });
    setCalcul(null);
    demarrer(async () => {
      const r = await calculerRappel(b.id, depuis, nouveau);
      setCalcul({ ok: r.ok, message: r.message });
      if (r.ok) changer({ ...edition, rappel: String(r.montant), rappelLibelle: r.libelle });
    });
  }

  return (
    <tr className="bg-[var(--surface-creuse)]">
      <td colSpan={colonnes} className="px-3 pb-3">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>
            <span className="mb-1 block font-semibold text-[var(--encre-faible)]">Rappel de salaire (négatif : trop-perçu)</span>
            <input aria-label="Rappel de salaire" inputMode="numeric" value={edition.rappel} onChange={(e) => changer({ ...edition, rappel: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} chiffres h-8 w-28 text-right`} />
          </label>
          <label className="min-w-56 flex-1">
            <span className="mb-1 block font-semibold text-[var(--encre-faible)]">Ce qu&apos;il rattrape</span>
            <input
              aria-label="Libellé du rappel"
              placeholder="Rappel de salaire de mars 2026"
              value={edition.rappelLibelle}
              onChange={(e) => changer({ ...edition, rappelLibelle: e.target.value })}
              className={`${CLASSE_CHAMP_COMPACT} h-8 w-full`}
            />
          </label>
          <span className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--filet)] p-2">
            <label>
              <span className="mb-1 block font-semibold text-[var(--encre-faible)]">Augmentation depuis</span>
              <input type="month" aria-label="Mois d'effet de l'augmentation" value={depuis} onChange={(e) => setDepuis(e.target.value)} className={`${CLASSE_CHAMP_COMPACT} h-8`} />
            </label>
            <label>
              <span className="mb-1 block font-semibold text-[var(--encre-faible)]">Nouveau salaire de base</span>
              <input aria-label="Nouveau salaire de base" inputMode="numeric" value={salaire} onChange={(e) => setSalaire(e.target.value)} className={`${CLASSE_CHAMP_COMPACT} chiffres h-8 w-28 text-right`} />
            </label>
            <button type="button" disabled={enCours} onClick={chiffrer} className="h-8 rounded-lg border border-[var(--filet)] px-2.5 font-semibold hover:bg-[var(--surface)] disabled:opacity-50">
              {enCours ? "Calcul…" : "Chiffrer le rappel"}
            </button>
          </span>
        </div>
        {calcul && (
          <div className="mt-2">
            <Retour resultat={calcul} />
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Bulletins du mois. En préparation, les éléments variables se saisissent sur
 * la ligne et le net se recalcule au serveur, avec le barème en vigueur.
 */
export function TableBulletins({ bulletins, modifiable }: { bulletins: BulletinAffiche[]; modifiable: boolean }) {
  const [edition, setEdition] = useState<Edition | null>(null);
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
              <Fragment key={b.id}>
              <tr className="bg-[var(--surface-creuse)]">
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
                        const rappel = signe(edition.rappel);
                        if ([primes, indemnites, retenues, rappel].some(Number.isNaN)) return setResultat({ ok: false, message: "Montants en francs entiers." });
                        if (Number.isNaN(absences)) return setResultat({ ok: false, message: "Absences en jours ou demi-journées : 1, 1,5, 2…" });
                        lancer(() =>
                          modifierElements(b.id, {
                            primesImposables: primes,
                            indemnitesNonImposables: indemnites,
                            retenuesDiverses: retenues,
                            joursAbsenceSaisis: absences,
                            rappel,
                            rappelLibelle: rappel ? edition.rappelLibelle : null,
                          }),
                        );
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
              <LigneRappel b={b} edition={edition} changer={setEdition} colonnes={11} />
              </Fragment>
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
                <Td aligne="droite" chiffres>
                  {b.primesImposables ? fmt(b.primesImposables) : b.rappel ? "" : "—"}
                  {b.rappel !== 0 && (
                    <span className="block text-xs text-[var(--encre-faible)]" title={b.rappelLibelle ?? undefined}>
                      rappel {b.rappel > 0 ? "+" : "−"} {fmt(Math.abs(b.rappel))}
                    </span>
                  )}
                </Td>
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
                        onClick={() => setEdition({ id: b.id, absences: saisieJours(b.joursAbsenceSaisis), rappel: b.rappel ? String(b.rappel) : "", rappelLibelle: b.rappelLibelle ?? "", primes: String(b.primesImposables), indemnites: String(b.indemnitesNonImposables), retenues: String(b.retenuesDiverses) })}
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
