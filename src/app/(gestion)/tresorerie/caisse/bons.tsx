"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ChoixFichiers } from "@/components/ui/fichiers";
import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { annulerBon, decaisserBon, deciderBon, ouvrirJustificatif } from "@/modules/tresorerie/actions";
import { NATURES_BON, type NatureBon } from "@/modules/tresorerie/calcul";

export interface BonAffiche {
  id: string;
  numero: string;
  caisse: string;
  nature: NatureBon;
  montant: number;
  beneficiaire: string;
  beneficiaireQualite: string | null;
  motif: string;
  statut: "demande" | "approuve" | "rejete" | "decaisse" | "annule";
  demandeParUserId: string;
  demandeur: string;
  demandeLeIso: string;
  approbateur: string | null;
  motifRejet: string | null;
  decaisseLeIso: string | null;
  ecriture: string | null;
  avecJustificatif: boolean;
}

const STATUT: Record<BonAffiche["statut"], { libelle: string; ton: TonPastille }> = {
  demande: { libelle: "À approuver", ton: "alerte" },
  approuve: { libelle: "Approuvé, à décaisser", ton: "marque" },
  rejete: { libelle: "Refusé", ton: "danger" },
  decaisse: { libelle: "Décaissé", ton: "valide" },
  annule: { libelle: "Annulé", ton: "neutre" },
};

const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * Bons de caisse. Chacun voit ses gestes possibles et seulement eux : on ne
 * propose pas d'approuver sa propre demande, le serveur le refuserait.
 */
export function ListeBons({
  bons,
  moi,
  droits,
}: {
  bons: BonAffiche[];
  moi: string;
  droits: { approuver: boolean; decaisser: boolean; estProprietaire: boolean };
}) {
  const [panneau, setPanneau] = useState<{ id: string; type: "refuser" | "decaisser"; motif: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  function lancer(action: () => Promise<Resultat>) {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok) setPanneau(null);
      routeur.refresh();
    });
  }

  function voir(id: string) {
    demarrer(async () => {
      const url = await ouvrirJustificatif(id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setResultat({ ok: false, message: "Justificatif indisponible." });
    });
  }

  if (bons.length === 0) return <p className="py-6 text-center text-sm text-[var(--encre-faible)]">Aucun bon de caisse.</p>;

  return (
    <>
      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}
      <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
        {bons.map((b) => {
          const peutDecider = droits.approuver && b.statut === "demande" && (b.demandeParUserId !== moi || droits.estProprietaire);
          const peutDecaisser = droits.decaisser && b.statut === "approuve";
          const peutAnnuler = (b.statut === "demande" || b.statut === "approuve") && (b.demandeParUserId === moi || droits.approuver);
          return (
            <li key={b.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">{NATURES_BON[b.nature].libelle}</span>
                    <span className="chiffres text-sm font-bold">{fmt(b.montant)} F</span>
                    <Pastille ton={STATUT[b.statut].ton}>{STATUT[b.statut].libelle}</Pastille>
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--encre-douce)]">
                    {b.beneficiaire}
                    {b.beneficiaireQualite && <span className="text-[var(--encre-faible)]"> ({b.beneficiaireQualite})</span>} — {b.motif}
                  </p>
                  <p className="chiffres mt-0.5 text-xs text-[var(--encre-faible)]">
                    {b.numero} · {b.caisse} · demandé par {b.demandeParUserId === moi ? "vous" : b.demandeur} le {MOMENT.format(new Date(b.demandeLeIso))}
                    {b.approbateur && ` · ${b.statut === "rejete" ? "refusé" : "approuvé"} par ${b.approbateur}`}
                    {b.decaisseLeIso && ` · décaissé le ${MOMENT.format(new Date(b.decaisseLeIso))}`}
                    {b.ecriture && ` · écriture ${b.ecriture}`}
                  </p>
                  {b.motifRejet && <p className="mt-1 text-xs text-danger-600">Refusé — {b.motifRejet}</p>}
                  {b.statut === "demande" && b.demandeParUserId === moi && !droits.estProprietaire && (
                    <p className="mt-1 text-xs text-[var(--encre-faible)]">Votre demande attend la décision d&apos;un autre membre.</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {b.avecJustificatif && (
                    <button type="button" onClick={() => voir(b.id)} className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)]">
                      Justificatif
                    </button>
                  )}
                  {peutDecider && panneau?.id !== b.id && (
                    <>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => lancer(() => deciderBon(b.id, true))}
                        className="rounded-lg bg-valide-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Approuver
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanneau({ id: b.id, type: "refuser", motif: "" })}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-50"
                      >
                        Refuser
                      </button>
                    </>
                  )}
                  {peutDecaisser && panneau?.id !== b.id && (
                    <button
                      type="button"
                      onClick={() => setPanneau({ id: b.id, type: "decaisser", motif: "" })}
                      className="rounded-lg bg-marque-500 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Décaisser
                    </button>
                  )}
                  {peutAnnuler && panneau?.id !== b.id && (
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => lancer(() => annulerBon(b.id))}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)] disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </div>

              {panneau?.id === b.id && panneau.type === "refuser" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    lancer(() => deciderBon(b.id, false, panneau.motif));
                  }}
                  className="mt-3 flex flex-wrap gap-2 rounded-lg border border-danger-500/40 bg-danger-50 p-3"
                >
                  <input
                    autoFocus
                    value={panneau.motif}
                    onChange={(e) => setPanneau({ ...panneau, motif: e.target.value })}
                    placeholder="Motif du refus"
                    aria-label="Motif du refus"
                    className={`${CLASSE_CHAMP} min-w-0 flex-1`}
                  />
                  <button type="submit" disabled={enCours || panneau.motif.trim().length < 3} className="h-cible rounded-lg bg-danger-500 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
                    Refuser le bon
                  </button>
                  <button type="button" onClick={() => setPanneau(null)} className="text-sm text-[var(--encre-faible)] hover:underline">
                    Retour
                  </button>
                </form>
              )}

              {panneau?.id === b.id && panneau.type === "decaisser" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const donnees = new FormData(e.currentTarget);
                    lancer(() => decaisserBon(b.id, donnees));
                  }}
                  className="mt-3 space-y-2 rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)] p-3"
                >
                  <p className="text-sm">
                    Remettre <strong className="chiffres">{fmt(b.montant)} F</strong> à {b.beneficiaire} depuis {b.caisse}. L&apos;écriture passe en {NATURES_BON[b.nature].compte}.
                  </p>
                  <ChoixFichiers libelle="Justificatif : reçu, ticket, facture (facultatif)" camera />
                  <div className="flex gap-2">
                    <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
                      {enCours ? "Décaissement…" : "Décaisser"}
                    </button>
                    <button type="button" onClick={() => setPanneau(null)} className="text-sm text-[var(--encre-faible)] hover:underline">
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
