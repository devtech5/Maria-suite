"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FormulaireRepliable, Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { annulerCommandeInterne, deciderCommandeInterne, modifierCommandeInterne, supprimerCommandeInterne } from "@/modules/tresorerie/actions-commandes-internes";
import type { LigneCommandeInterne, StatutCommandeInterne } from "@/modules/tresorerie/commandes-internes";

import { ChampsCommande, type ChoixCommande } from "./champs-commande";

export interface CommandeAffichee {
  id: string;
  numero: string;
  objet: string;
  service: string | null;
  beneficiaire: string | null;
  beneficiaireRef: string | null;
  notes: string | null;
  lignes: LigneCommandeInterne[];
  nombreLignes: number;
  total: number;
  statut: StatutCommandeInterne;
  demandeParUserId: string;
  demandeur: string;
  demandeLeIso: string;
  approbateur: string | null;
  motifRejet: string | null;
}

const STATUT: Record<StatutCommandeInterne, { libelle: string; ton: TonPastille }> = {
  demande: { libelle: "À approuver", ton: "alerte" },
  approuve: { libelle: "Approuvé", ton: "valide" },
  rejete: { libelle: "Refusé", ton: "danger" },
  annule: { libelle: "Annulé", ton: "neutre" },
};

const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Bons de commande internes. Chacun ne voit que les gestes qu'il peut faire :
 * on ne propose pas d'approuver sa propre demande, le serveur le refuserait.
 */
export function ListeCommandes({
  commandes,
  moi,
  droits,
  edition,
}: {
  commandes: CommandeAffichee[];
  moi: string;
  droits: { approuver: boolean; estProprietaire: boolean };
  /** Services et bénéficiaires proposés ; nul pour qui ne peut pas demander, donc pas modifier. */
  edition: ChoixCommande | null;
}) {
  const [refus, setRefus] = useState<{ id: string; motif: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  function lancer(action: () => Promise<Resultat>) {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok) setRefus(null);
      routeur.refresh();
    });
  }

  if (commandes.length === 0) return <p className="py-6 text-center text-sm text-[var(--encre-faible)]">Aucun bon de commande interne.</p>;

  return (
    <>
      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}
      <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
        {commandes.map((c) => {
          const peutDecider = droits.approuver && c.statut === "demande" && (c.demandeParUserId !== moi || droits.estProprietaire);
          const peutAnnuler = (c.statut === "demande" || c.statut === "approuve") && (c.demandeParUserId === moi || droits.approuver);
          const peutModifier = edition !== null && peutAnnuler;
          // Approuvé, il engage l'entreprise : il s'annule d'abord.
          const peutSupprimer = edition !== null && c.statut !== "approuve" && (c.demandeParUserId === moi || droits.approuver);
          return (
            <li key={c.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">{c.objet}</span>
                    <span className="chiffres text-sm font-bold">{fmt(c.total)} F</span>
                    <Pastille ton={STATUT[c.statut].ton}>{STATUT[c.statut].libelle}</Pastille>
                  </p>
                  {c.beneficiaire && <p className="mt-0.5 text-sm text-[var(--encre-douce)]">Pour {c.beneficiaire}</p>}
                  <p className="chiffres mt-0.5 text-xs text-[var(--encre-faible)]">
                    {c.numero} · {c.nombreLignes} ligne{c.nombreLignes > 1 ? "s" : ""}
                    {c.service && ` · ${c.service}`} · demandé par {c.demandeParUserId === moi ? "vous" : c.demandeur} le {MOMENT.format(new Date(c.demandeLeIso))}
                    {c.approbateur && ` · ${c.statut === "rejete" ? "refusé" : "approuvé"} par ${c.approbateur}`}
                  </p>
                  {c.motifRejet && <p className="mt-1 text-xs text-danger-600">Refusé — {c.motifRejet}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Link
                    href={`/imprimer/commande-interne/${c.id}`}
                    target="_blank"
                    className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)]"
                  >
                    Voir le bon
                  </Link>
                  {edition && peutModifier && refus?.id !== c.id && (
                    <FormulaireRepliable libelle="Modifier" titre={`Modifier le bon ${c.numero}`} action={modifierCommandeInterne} variante="discret">
                      <input type="hidden" name="id" value={c.id} />
                      {c.statut === "approuve" && (
                        <p className="mb-3 rounded-lg bg-alerte-50 px-3 py-2 text-sm text-alerte-600">
                          Ce bon est approuvé : l&apos;enregistrer modifié le renvoie à l&apos;approbation.
                        </p>
                      )}
                      <ChampsCommande
                        choix={edition}
                        valeurs={{ objet: c.objet, service: c.service, beneficiaireRef: c.beneficiaireRef, beneficiaire: c.beneficiaire, notes: c.notes, lignes: c.lignes }}
                      />
                    </FormulaireRepliable>
                  )}
                  {peutDecider && refus?.id !== c.id && (
                    <>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => lancer(() => deciderCommandeInterne(c.id, true))}
                        className="rounded-lg bg-valide-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Approuver
                      </button>
                      <button
                        type="button"
                        onClick={() => setRefus({ id: c.id, motif: "" })}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-50"
                      >
                        Refuser
                      </button>
                    </>
                  )}
                  {peutAnnuler && refus?.id !== c.id && (
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => {
                        if (window.confirm(`Annuler le bon ${c.numero} ?`)) lancer(() => annulerCommandeInterne(c.id));
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)] disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  )}
                  {peutSupprimer && refus?.id !== c.id && (
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => {
                        if (window.confirm(`Supprimer le bon ${c.numero} ? Il disparaîtra de la liste ; son numéro ne sera pas réattribué.`)) {
                          lancer(() => supprimerCommandeInterne(c.id));
                        }
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>

              {refus?.id === c.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    lancer(() => deciderCommandeInterne(c.id, false, refus.motif));
                  }}
                  className="mt-3 flex flex-wrap gap-2 rounded-lg border border-danger-500/40 bg-danger-50 p-3"
                >
                  <input
                    autoFocus
                    value={refus.motif}
                    onChange={(e) => setRefus({ ...refus, motif: e.target.value })}
                    placeholder="Motif du refus"
                    aria-label="Motif du refus"
                    className={`${CLASSE_CHAMP} min-w-0 flex-1`}
                  />
                  <button type="submit" disabled={enCours || refus.motif.trim().length < 3} className="h-cible rounded-lg bg-danger-500 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
                    Refuser le bon
                  </button>
                  <button type="button" onClick={() => setRefus(null)} className="text-sm text-[var(--encre-faible)] hover:underline">
                    Retour
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
