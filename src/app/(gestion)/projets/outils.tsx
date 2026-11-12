"use client";

import { useRef, useState } from "react";

import { ChoixCompteTresorerie } from "@/components/tresorerie/choix-compte";
import { ChoixFichiers } from "@/components/ui/fichiers";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import {
  ajouterPiece,
  approuverDepense,
  modifierProjet,
  payerDepense,
  refuserDepense,
  supprimerPiece,
} from "@/modules/projets/actions";
import { LIBELLE_STATUT_PROJET } from "@/modules/projets/calcul";
import type { StatutDepense, StatutProjet } from "@/modules/projets/schema";
import { Fenetre } from "@/components/ui/fenetre";

const PETIT = "h-9 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50";

/**
 * Actions d'une dépense selon son étape et les droits de la personne.
 * Le serveur revérifie tout : ces boutons ne sont que la porte d'entrée.
 */
export function ActionsDepense({
  id,
  statut,
  droits,
}: {
  id: string;
  statut: StatutDepense;
  droits: { approuver: boolean; payer: boolean; demander: boolean };
}) {
  const op = useOperation();
  const [panneau, setPanneau] = useState<"rejeter" | "annuler" | "payer" | null>(null);
  const [motif, setMotif] = useState("");
  const [depassement, setDepassement] = useState(false);
  const [moyen, setMoyen] = useState<"especes" | "mobile_money" | "banque">("especes");
  const formulaire = useRef<HTMLFormElement>(null);

  if (statut === "payee" || statut === "rejetee" || statut === "annulee") return null;

  return (
    <div className={panneau === null ? "text-left" : "min-w-56 text-left"}>
      {panneau === null && (
        <div className="flex justify-end gap-1.5 whitespace-nowrap">
          {statut === "demandee" && droits.approuver && (
            <>
              <button
                type="button"
                disabled={op.enCours}
                onClick={() =>
                  op.lancer(
                    () => approuverDepense(id, depassement),
                    () => setDepassement(false),
                  )
                }
                className={`${PETIT} bg-marque-600 text-white`}
              >
                {depassement ? "Approuver malgré le dépassement" : "Approuver"}
              </button>
              <button type="button" onClick={() => setPanneau("rejeter")} className={`${PETIT} border border-[var(--filet)] text-danger-600`}>
                Rejeter
              </button>
            </>
          )}
          {statut === "approuvee" && droits.payer && (
            <button type="button" onClick={() => setPanneau("payer")} className={`${PETIT} bg-marque-600 text-white`}>
              Payer
            </button>
          )}
          {droits.demander && (
            <button type="button" onClick={() => setPanneau("annuler")} className={`${PETIT} text-[var(--encre-faible)]`}>
              Annuler
            </button>
          )}
        </div>
      )}

      {(panneau === "rejeter" || panneau === "annuler") && (
        <div className="space-y-1.5">
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif"
            aria-label="Motif"
            className={`${CLASSE_CHAMP} h-9`}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={op.enCours || motif.trim().length < 3}
              onClick={() => op.lancer(() => refuserDepense(id, panneau === "rejeter" ? "rejetee" : "annulee", motif), () => setPanneau(null))}
              className={`${PETIT} bg-danger-500 text-white`}
            >
              Confirmer
            </button>
            <button type="button" onClick={() => setPanneau(null)} className={`${PETIT} text-[var(--encre-faible)]`}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {panneau === "payer" && (
        <form
          ref={formulaire}
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            op.lancer(() => payerDepense(donnees), () => setPanneau(null));
          }}
          className="space-y-1.5"
        >
          <input type="hidden" name="depenseId" value={id} />
          <select
            name="moyen"
            value={moyen}
            onChange={(e) => setMoyen(e.target.value as typeof moyen)}
            aria-label="Moyen de paiement"
            className={`${CLASSE_CHAMP} h-9`}
          >
            <option value="especes">Espèces</option>
            <option value="mobile_money">Mobile money</option>
            <option value="banque">Virement / chèque</option>
          </select>
          <ChoixCompteTresorerie moyen={moyen} libelle="Compte qui paie" className={`${CLASSE_CHAMP} h-9`} />
          <input name="reference" placeholder="Référence (n° de chèque, transfert…)" aria-label="Référence du paiement" className={`${CLASSE_CHAMP} h-9`} />
          <ChoixFichiers libelle="Preuves de paiement : reçu, capture du transfert…" camera />
          <div className="flex gap-1.5">
            <button type="submit" disabled={op.enCours} className={`${PETIT} bg-marque-600 text-white`}>
              {op.enCours ? "Paiement…" : "Payer et passer l'écriture"}
            </button>
            <button type="button" onClick={() => setPanneau(null)} className={`${PETIT} text-[var(--encre-faible)]`}>
              Fermer
            </button>
          </div>
        </form>
      )}

      {op.resultat && <Retour resultat={op.resultat} />}
      {op.resultat && !op.resultat.ok && op.resultat.message.startsWith("Budget dépassé") && !depassement && (
        <button type="button" onClick={() => setDepassement(true)} className="mt-1 text-xs font-medium text-alerte-600 hover:underline">
          J&apos;assume le dépassement
        </button>
      )}
    </div>
  );
}

/**
 * Ajout d'une photo ou d'une pièce. Sur téléphone, `capture` ouvre l'appareil
 * photo directement : la photo de chantier se prend et se dépose d'un geste.
 */
export function AjoutPiece({
  projetId,
  depenseId,
  natures = ["photo", "preuve_paiement", "facture", "autre"],
  libelle = "Ajouter des photos ou des pièces",
}: {
  projetId?: string;
  depenseId?: string;
  natures?: ("photo" | "preuve_paiement" | "facture" | "autre")[];
  libelle?: string;
}) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const formulaire = useRef<HTMLFormElement>(null);
  const LIBELLES = { photo: "Photo", preuve_paiement: "Preuve de paiement", facture: "Facture / devis", autre: "Autre pièce" };

  return (
    <>
      <div>
        <button type="button" onClick={() => setOuvert(true)} className="text-xs font-semibold text-marque-600 hover:underline">
          + {libelle}
        </button>
        {op.resultat?.ok && <Retour resultat={op.resultat} />}
      </div>
      <Fenetre ouverte={ouvert} titre={libelle} onFermer={() => setOuvert(false)}>
    <form
      ref={formulaire}
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => ajouterPiece(donnees), () => {
          formulaire.current?.reset();
          setOuvert(false);
        });
      }}
      className="space-y-3 px-5 py-4"
    >
      {projetId && <input type="hidden" name="projetId" value={projetId} />}
      {depenseId && <input type="hidden" name="depenseId" value={depenseId} />}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select name="nature" defaultValue={natures[0]} aria-label="Nature de la pièce" className={`${CLASSE_CHAMP} h-9`}>
          {natures.map((n) => (
            <option key={n} value={n}>
              {LIBELLES[n]}
            </option>
          ))}
        </select>
        <input name="legende" placeholder="Légende : dalle coulée, reçu quincaillerie…" aria-label="Légende" className={`${CLASSE_CHAMP} h-9`} />
      </div>
      <ChoixFichiers libelle="Photos ou PDF" requis camera={natures[0] === "photo"} />
      <div className="flex gap-1.5">
        <button type="submit" disabled={op.enCours} className={`${PETIT} bg-marque-600 text-white`}>
          {op.enCours ? "Envoi…" : "Déposer"}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className={`${PETIT} text-[var(--encre-faible)]`}>
          Fermer
        </button>
      </div>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
    </form>
      </Fenetre>
    </>
  );
}

export function RetraitPiece({ id }: { id: string }) {
  const op = useOperation();
  const [confirmer, setConfirmer] = useState(false);
  return confirmer ? (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={op.enCours}
        onClick={() => op.lancer(() => supprimerPiece(id))}
        className="text-xs font-semibold text-danger-600 hover:underline"
      >
        Retirer définitivement
      </button>
      <button type="button" onClick={() => setConfirmer(false)} className="text-xs text-[var(--encre-faible)]">
        ×
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirmer(true)} className="text-xs text-[var(--encre-faible)] hover:text-danger-600">
      Retirer
    </button>
  );
}

/** Affectation et pilotage d'un projet : responsable, statut, enveloppe. */
export function PilotageProjet({
  id,
  statut,
  responsableUserId,
  budget,
  prixVente,
  membres,
}: {
  id: string;
  statut: StatutProjet;
  responsableUserId: string | null;
  budget: number | null;
  prixVente: number | null;
  membres: { userId: string; nom: string }[];
}) {
  const op = useOperation();
  const [enveloppe, setEnveloppe] = useState(budget === null ? "" : String(budget));
  const [prix, setPrix] = useState(prixVente === null ? "" : String(prixVente));
  const lire = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[\s  ]/g, "")));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Responsable</span>
        <select
          value={responsableUserId ?? ""}
          disabled={op.enCours}
          onChange={(e) => op.lancer(() => modifierProjet(id, { responsableUserId: e.target.value || null }))}
          className={`${CLASSE_CHAMP} h-9`}
        >
          <option value="">Non affecté</option>
          {membres.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Statut</span>
        <select
          value={statut}
          disabled={op.enCours}
          onChange={(e) => op.lancer(() => modifierProjet(id, { statut: e.target.value }))}
          className={`${CLASSE_CHAMP} h-9`}
        >
          {Object.entries(LIBELLE_STATUT_PROJET).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Budget TTC</span>
        <div className="flex gap-1.5">
          <input
            value={enveloppe}
            onChange={(e) => setEnveloppe(e.target.value)}
            inputMode="numeric"
            placeholder="Sans plafond"
            className={`${CLASSE_CHAMP} chiffres h-9`}
          />
          <button
            type="button"
            disabled={op.enCours}
            onClick={() =>
              op.lancer(() =>
                modifierProjet(id, { budget: lire(enveloppe) }),
              )
            }
            className={`${PETIT} shrink-0 border border-[var(--filet)]`}
          >
            Fixer
          </button>
        </div>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Prix de vente HT</span>
        <div className="flex gap-1.5">
          <input
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            inputMode="numeric"
            placeholder="Projet interne"
            className={`${CLASSE_CHAMP} chiffres h-9`}
          />
          <button
            type="button"
            disabled={op.enCours}
            onClick={() => op.lancer(() => modifierProjet(id, { prixVente: lire(prix) }))}
            className={`${PETIT} shrink-0 border border-[var(--filet)]`}
          >
            Fixer
          </button>
        </div>
      </label>
      {op.resultat && (
        <div className="sm:col-span-2 xl:col-span-4">
          <Retour resultat={op.resultat} />
        </div>
      )}
    </div>
  );
}
