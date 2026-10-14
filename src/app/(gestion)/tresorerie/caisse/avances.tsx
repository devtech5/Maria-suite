"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Pastille } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { regulariserAvance } from "@/modules/tresorerie/actions";
import { NATURES_BON, type NatureBon } from "@/modules/tresorerie/calcul";

import { OptionsComptes, type CompteChoix } from "../champs";

export interface AvanceAffichee {
  id: string;
  numero: string;
  caisse: string;
  beneficiaire: string;
  beneficiaireQualite: string | null;
  montant: number;
  reste: number;
  motif: string;
  echeance: string | null;
  statut: "ouverte" | "soldee";
  remiseLeIso: string;
  ecriture: string;
  regularisations: { type: "justification" | "remboursement"; montant: number; nature: NatureBon | null; libelle: string | null; ecriture: string }[];
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Avances au personnel. Une avance se régularise de deux façons : par une
 * dépense justifiée (le ticket de carburant), ou par le reliquat rendu en
 * espèces. Elle se solde seule quand il ne reste rien.
 */
export function ListeAvances({ avances, caisses, regulariser, aujourdhui }: { avances: AvanceAffichee[]; caisses: CompteChoix[]; regulariser: boolean; aujourdhui: string }) {
  const [ouverte, setOuverte] = useState<{ id: string; type: "justification" | "remboursement" } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  if (avances.length === 0) return <p className="py-6 text-center text-sm text-[var(--encre-faible)]">Aucune avance en cours.</p>;

  return (
    <>
      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}
      <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
        {avances.map((a) => {
          const echue = a.statut === "ouverte" && a.echeance !== null && a.echeance < aujourdhui;
          return (
            <li key={a.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">
                      {a.beneficiaire}
                      {a.beneficiaireQualite && <span className="font-normal text-[var(--encre-faible)]"> — {a.beneficiaireQualite}</span>}
                    </span>
                    <span className="chiffres text-sm">
                      {fmt(a.montant)} F remis · reste <strong className={a.reste > 0 ? "text-alerte-600" : "text-valide-600"}>{fmt(a.reste)} F</strong>
                    </span>
                    {a.statut === "soldee" ? (
                      <Pastille ton="valide">Soldée</Pastille>
                    ) : echue ? (
                      <Pastille ton="danger">Échue le {JOUR.format(new Date(`${a.echeance}T00:00:00Z`))}</Pastille>
                    ) : a.echeance ? (
                      <Pastille ton="neutre">À régulariser avant le {JOUR.format(new Date(`${a.echeance}T00:00:00Z`))}</Pastille>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--encre-douce)]">{a.motif}</p>
                  <p className="chiffres mt-0.5 text-xs text-[var(--encre-faible)]">
                    {a.numero} · {a.caisse} · remise le {JOUR.format(new Date(a.remiseLeIso))} · écriture {a.ecriture}
                  </p>
                  {a.regularisations.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--encre-douce)]">
                      {a.regularisations.map((r, i) => (
                        <li key={i} className="chiffres">
                          {r.type === "justification" ? `Justifié : ${r.nature ? NATURES_BON[r.nature].libelle : "dépense"}${r.libelle ? ` (${r.libelle})` : ""}` : "Remboursé"} — {fmt(r.montant)} F · {r.ecriture}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {regulariser && a.statut === "ouverte" && ouverte?.id !== a.id && (
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={() => setOuverte({ id: a.id, type: "justification" })} className="rounded-lg bg-marque-500 px-3 py-1.5 text-xs font-semibold text-white">
                      Justifier une dépense
                    </button>
                    <button type="button" onClick={() => setOuverte({ id: a.id, type: "remboursement" })} className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)]">
                      Reliquat rendu
                    </button>
                  </div>
                )}
              </div>

              {ouverte?.id === a.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const donnees = new FormData(e.currentTarget);
                    setResultat(null);
                    demarrer(async () => {
                      const r = await regulariserAvance(a.id, donnees);
                      setResultat(r);
                      if (r.ok) setOuverte(null);
                      routeur.refresh();
                    });
                  }}
                  className="mt-3 grid gap-2 rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)] p-3 sm:grid-cols-3"
                >
                  <input type="hidden" name="type" value={ouverte.type} />
                  <input name="montant" required inputMode="numeric" defaultValue={String(a.reste)} aria-label="Montant" className={`${CLASSE_CHAMP} chiffres`} />
                  {ouverte.type === "justification" ? (
                    <>
                      <select name="nature" required defaultValue="" aria-label="Nature de la dépense" className={CLASSE_CHAMP}>
                        <option value="" disabled>
                          Nature de la dépense…
                        </option>
                        {(Object.keys(NATURES_BON) as NatureBon[]).map((n) => (
                          <option key={n} value={n}>
                            {NATURES_BON[n].libelle}
                          </option>
                        ))}
                      </select>
                      <input name="libelle" maxLength={120} placeholder="Détail : ticket carburant n° 1245" aria-label="Détail" className={CLASSE_CHAMP} />
                    </>
                  ) : (
                    <select name="caisseId" required defaultValue="" aria-label="Compte qui reçoit le reliquat" className={`${CLASSE_CHAMP} sm:col-span-2`}>
                      <option value="" disabled>
                        Compte qui reçoit le reliquat…
                      </option>
                      <OptionsComptes comptes={caisses} />
                    </select>
                  )}
                  <div className="flex gap-2 sm:col-span-3">
                    <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
                      {ouverte.type === "justification" ? "Enregistrer la justification" : "Enregistrer le remboursement"}
                    </button>
                    <button type="button" onClick={() => setOuverte(null)} className="text-sm text-[var(--encre-faible)] hover:underline">
                      Retour
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
