"use client";

import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { Champ, CLASSE_CHAMP, Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { CATEGORIES_DEPENSE } from "@/modules/projets/calcul";
import {
  basculerChargeRecurrente,
  creerChargeRecurrente,
  ignorerEcheance,
  preparerEcheance,
  supprimerChargeRecurrente,
} from "@/modules/tresorerie/actions-charges";
import { libelleMois, PERIODICITES, type Echeance, type Periodicite } from "@/modules/tresorerie/charges";

export interface ChargeAffichee {
  id: string;
  libelle: string;
  libelleCategorie: string;
  montant: number;
  equivalentMensuel: number;
  periodicite: Periodicite;
  fournisseur: string | null;
  actif: boolean;
  prochaine: Echeance | null;
  derniere: { periode: string; ignoree: boolean; depense: string | null; statut: string | null } | null;
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const date = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));

/** « de mars », « d'octobre ». */
function deMois(periode: string): string {
  const nom = libelleMois(periode).split(" ")[0];
  return /^[aeiouy]/.test(nom) ? `d'${nom}` : `de ${nom}`;
}

const STATUT_DEPENSE: Record<string, string> = {
  demandee: "à approuver",
  approuvee: "approuvée, à payer",
  payee: "payée",
  rejetee: "refusée",
  annulee: "annulée",
};

/** Où en est la prochaine échéance : en retard, proche, ou lointaine. */
function urgence(e: Echeance, aujourdhui: string, dansSeptJours: string): { libelle: string; ton: TonPastille } {
  if (e.date < aujourdhui) return { libelle: "En retard", ton: "danger" };
  if (e.date <= dansSeptJours) return { libelle: "Cette semaine", ton: "alerte" };
  return { libelle: "À venir", ton: "neutre" };
}

/**
 * Charges récurrentes. Une ligne par charge : sa prochaine échéance et le geste
 * qui va avec. « Préparer » crée la dépense, qui suit ensuite le circuit
 * ordinaire d'approbation et de paiement.
 */
export function ChargesRecurrentes({
  charges,
  gerer,
  aujourdhui,
}: {
  charges: ChargeAffichee[];
  gerer: boolean;
  aujourdhui: string;
}) {
  const { resultat, enCours, lancer } = useOperation();
  const dansSeptJours = new Date(Date.parse(`${aujourdhui}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

  if (charges.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--encre-douce)]">
        Aucune charge récurrente. Déclarez le loyer, la facture d&apos;électricité, l&apos;abonnement internet : Maria Suite les rappelle à
        chaque échéance et les compte dans le plan de trésorerie.
      </p>
    );
  }

  return (
    <>
      <Retour resultat={resultat} />
      <ul className="mt-2 divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
        {charges.map((c) => {
          const etat = c.prochaine ? urgence(c.prochaine, aujourdhui, dansSeptJours) : null;
          return (
            <li key={c.id} className={`px-4 py-3 ${c.actif ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">{c.libelle}</span>
                    <span className="chiffres text-sm font-bold">{fmt(c.montant)} F</span>
                    <span className="text-xs text-[var(--encre-faible)]">{PERIODICITES[c.periodicite].libelle.toLowerCase()}</span>
                    {!c.actif && <Pastille>Suspendue</Pastille>}
                    {etat && <Pastille ton={etat.ton}>{etat.libelle}</Pastille>}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--encre-douce)]">
                    {c.libelleCategorie}
                    {c.fournisseur && ` · ${c.fournisseur}`}
                    {c.periodicite !== "mensuelle" && <span className="chiffres"> · soit {fmt(c.equivalentMensuel)} F par mois</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--encre-faible)]">
                    {c.prochaine ? `Prochaine échéance le ${date(c.prochaine.date)}` : c.actif ? "Aucune échéance dans l'année" : "Plus aucune échéance proposée"}
                    {c.derniere &&
                      ` · ${libelleMois(c.derniere.periode)} : ${
                        c.derniere.ignoree ? "écartée" : `${c.derniere.depense ?? "dépense"} ${STATUT_DEPENSE[c.derniere.statut ?? ""] ?? ""}`
                      }`}
                  </p>
                </div>
                {gerer && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {c.prochaine && (
                      <>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => lancer(() => preparerEcheance(c.id, c.prochaine!.periode))}
                          className="rounded-lg bg-marque-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
                        >
                          Préparer la dépense {deMois(c.prochaine.periode)}
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          title="Payée autrement, ou rien à payer ce mois-là"
                          onClick={() => {
                            if (confirm(`Écarter l'échéance de ${libelleMois(c.prochaine!.periode)} sans dépense ?`)) lancer(() => ignorerEcheance(c.id, c.prochaine!.periode));
                          }}
                          className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
                        >
                          Écarter
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => lancer(() => basculerChargeRecurrente(c.id, !c.actif))}
                      className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
                    >
                      {c.actif ? "Suspendre" : "Reprendre"}
                    </button>
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => {
                        if (confirm(`Retirer « ${c.libelle} » des charges récurrentes ?`)) lancer(() => supprimerChargeRecurrente(c.id));
                      }}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Déclaration d'une charge récurrente. */
export function FormulaireCharge({ fournisseurs, aujourdhui }: { fournisseurs: { id: string; nom: string }[]; aujourdhui: string }) {
  return (
    <FormulaireRepliable libelle="Nouvelle charge récurrente" titre="Déclarer une charge récurrente" presentation="tiroir" action={creerChargeRecurrente}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Libellé">
          <input name="libelle" required placeholder="Loyer boutique Yopougon" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Nature">
          <select name="categorie" defaultValue="location" className={CLASSE_CHAMP}>
            {Object.entries(CATEGORIES_DEPENSE).map(([cle, c]) => (
              <option key={cle} value={cle}>
                {c.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Montant habituel TTC" precision="Ajustable sur chaque dépense préparée.">
          <input name="montant" required inputMode="numeric" placeholder="150 000" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Périodicité">
          <select name="periodicite" defaultValue="mensuelle" className={CLASSE_CHAMP}>
            {Object.entries(PERIODICITES).map(([cle, p]) => (
              <option key={cle} value={cle}>
                {p.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Prochaine échéance" precision="Son jour du mois se répète.">
          <input name="premiereEcheance" type="date" required defaultValue={aujourdhui} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Fournisseur">
          <select name="fournisseurId" className={CLASSE_CHAMP}>
            <option value="">Sans fiche fournisseur</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Ou nom du bénéficiaire">
          <input name="fournisseurLibelle" placeholder="CIE, SODECI, propriétaire…" className={CLASSE_CHAMP} />
        </Champ>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input name="avecTva" type="checkbox" />
          Facture avec TVA 18 % (récupérable)
        </label>
      </div>
    </FormulaireRepliable>
  );
}
