"use client";

import { useState } from "react";

import { useApercu } from "@/components/ui/apercu";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { correspond } from "@/components/ui/recherche";
import { fmt } from "@/lib/format";
import { annulerFacture, ouvrirJustificatifFacture } from "@/modules/achats/actions";
import { etatDette } from "@/modules/achats/calcul";
import type { FactureVue } from "@/modules/achats/requetes";

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const date = (iso: string) => JOUR.format(new Date(`${iso}T00:00:00Z`));

export function ListeFactures({ factures, annuler, aujourdhui }: { factures: FactureVue[]; annuler: boolean; aujourdhui: string }) {
  const op = useOperation();
  const apercu = useApercu();
  const [recherche, setRecherche] = useState("");
  const [motif, setMotif] = useState<{ id: string; texte: string } | null>(null);
  const visibles = factures.filter((f) => correspond(recherche, [f.numero, f.reference, f.fournisseur, f.commande]));

  return (
    <>
      <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Fournisseur, numéro, commande…" aria-label="Rechercher une facture" className={`${CLASSE_CHAMP_COMPACT} mb-3 w-full`} />
      {op.resultat && (
        <div className="mb-3">
          <Retour resultat={op.resultat} />
        </div>
      )}
      <Tableau>
        <thead>
          <tr>
            <Th>Facture</Th>
            <Th>Fournisseur</Th>
            <Th>Date</Th>
            <Th>Échéance</Th>
            <Th aligne="droite">TTC</Th>
            <Th aligne="droite">Reste dû</Th>
            <Th>État</Th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((f) => {
            const etat = f.statut === "annulee" ? null : etatDette(f.reste, f.echeance, aujourdhui);
            return (
              <tr key={f.id} className={f.statut === "annulee" ? "opacity-60" : undefined}>
                <Td chiffres fort>
                  {f.numero}
                  <span className="block text-xs font-normal text-[var(--encre-faible)]">
                    n° {f.reference}
                    {f.commande && ` · ${f.commande}`} · {f.ecriture}
                  </span>
                </Td>
                <Td>{f.fournisseur}</Td>
                <Td chiffres>{date(f.dateFacture)}</Td>
                <Td chiffres>
                  <span className={etat === "echue" ? "font-semibold text-danger-600" : ""}>{date(f.echeance)}</span>
                </Td>
                <Td aligne="droite" chiffres fort>{fmt(f.totalTtc)}</Td>
                <Td aligne="droite" chiffres>{f.statut === "annulee" ? "—" : fmt(f.reste)}</Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {f.statut === "annulee" ? (
                      <Pastille ton="danger">Annulée</Pastille>
                    ) : etat === "soldee" ? (
                      <Pastille ton="valide">Soldée</Pastille>
                    ) : etat === "echue" ? (
                      <Pastille ton="danger">Échue</Pastille>
                    ) : f.regle > 0 ? (
                      <Pastille ton="alerte">Payée en partie</Pastille>
                    ) : (
                      <Pastille ton="neutre">À payer</Pastille>
                    )}
                    {f.avecJustificatif && (
                      <button
                        type="button"
                        onClick={() => apercu.ouvrir({ titre: `Justificatif ${f.numero} · ${f.fournisseur}`, signer: () => ouvrirJustificatifFacture(f.id) })}
                        className="text-xs font-semibold text-marque-600 hover:underline"
                      >
                        Justificatif
                      </button>
                    )}
                    {annuler && f.statut === "comptabilisee" && f.regle === 0 && motif?.id !== f.id && (
                      <button type="button" onClick={() => setMotif({ id: f.id, texte: "" })} className="text-xs font-semibold text-danger-600 hover:underline">
                        Annuler
                      </button>
                    )}
                  </span>
                  {motif?.id === f.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        op.lancer(() => annulerFacture(f.id, motif.texte), () => setMotif(null));
                      }}
                      className="mt-1.5 flex flex-wrap gap-1.5"
                    >
                      <input autoFocus value={motif.texte} onChange={(e) => setMotif({ ...motif, texte: e.target.value })} placeholder="Motif" aria-label="Motif de l'annulation" className={`${CLASSE_CHAMP_COMPACT} h-8 text-xs`} />
                      <button type="submit" disabled={op.enCours || motif.texte.trim().length < 3} className="h-8 rounded-lg bg-danger-500 px-2.5 text-xs font-semibold text-white disabled:opacity-50">
                        Confirmer
                      </button>
                    </form>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Tableau>
      {apercu.fenetre}
    </>
  );
}
