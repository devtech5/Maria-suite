"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ChoixFichiers } from "@/components/ui/fichiers";
import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { enregistrerFacture } from "@/modules/achats/actions";
import { echeanceParDefaut, ecartsFacture } from "@/modules/achats/calcul";

import { EditeurLignes, ligneVide, nouvelleCle, versLignesAchat, type ArticleAchat, type LigneEditee } from "./lignes";
import { Fenetre } from "@/components/ui/fenetre";

const libelle = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";

/** Référence de la commande pour le contrôle à trois voies : reçu non facturé et prix commandé. */
export interface ReferenceLigne {
  ligneCommandeId: string;
  designation: string;
  recueNonFacturee: number;
  prixCommande: number;
}

/**
 * Saisie d'une facture fournisseur. Depuis une commande, les lignes reprennent
 * le reçu non encore facturé, et tout écart — plus facturé que reçu, plus cher
 * que commandé — s'affiche avant validation.
 */
export function EditeurFacture({
  fournisseurs,
  fournisseurFixe,
  commandeId,
  lignesInitiales,
  references = [],
  articles,
  aujourdhui,
  libelleBouton = "Saisir une facture",
}: {
  fournisseurs: { id: string; nom: string }[];
  fournisseurFixe?: string;
  commandeId?: string;
  lignesInitiales?: LigneEditee[];
  references?: ReferenceLigne[];
  articles: ArticleAchat[];
  aujourdhui: string;
  libelleBouton?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [fournisseurId, setFournisseurId] = useState(fournisseurFixe ?? "");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [echeance, setEcheance] = useState(echeanceParDefaut(aujourdhui));
  const [lignes, setLignes] = useState<LigneEditee[]>(lignesInitiales?.length ? lignesInitiales : [ligneVide()]);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);
  const routeur = useRouter();

  const converties = versLignesAchat(lignes.filter((l) => l.designation.trim()));
  const ecarts =
    typeof converties === "string" || references.length === 0
      ? []
      : ecartsFacture(
          references.map((r) => {
            const facturees = converties.filter((c) => c.ligneCommandeId === r.ligneCommandeId);
            return {
              designation: r.designation,
              quantiteRecue: r.recueNonFacturee,
              prixCommande: r.prixCommande,
              quantiteFacturee: facturees.reduce((s, c) => s + c.quantite, 0),
              prixFacture: facturees.reduce((m, c) => Math.max(m, c.prixUnitaireHt), 0),
            };
          }),
        );

  function enregistrer() {
    setResultat(null);
    if (typeof converties === "string") return setResultat({ ok: false, message: converties });
    const donnees = new FormData(formulaire.current ?? undefined);
    donnees.set(
      "facture",
      JSON.stringify({ fournisseurId, commandeId: commandeId ?? null, referenceFournisseur: reference, dateFacture: date, echeance, lignes: converties }),
    );
    demarrer(async () => {
      const r = await enregistrerFacture(donnees);
      setResultat(r);
      if (r.ok) {
        setOuvert(false);
        setReference("");
      }
      routeur.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOuvert(true);
          setLignes(lignesInitiales?.length ? lignesInitiales.map((l) => ({ ...l, cle: nouvelleCle() })) : [ligneVide()]);
        }}
        className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
      >
        {libelleBouton}
      </button>
      <Fenetre ouverte={ouvert} titre="Facture fournisseur" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          ref={formulaire}
          onSubmit={(e) => {
            e.preventDefault();
            enregistrer();
          }}
          className="space-y-4 px-5 py-4"
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={libelle}>Fournisseur</span>
              <select value={fournisseurId} disabled={Boolean(fournisseurFixe)} onChange={(e) => setFournisseurId(e.target.value)} className={CLASSE_CHAMP}>
                <option value="" disabled>
                  Choisir…
                </option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={libelle}>N° de la facture du fournisseur</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} required maxLength={80} placeholder="FA-2026-1187" className={CLASSE_CHAMP} />
            </label>
            <label className="block">
              <span className={libelle}>Date de facture</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setEcheance(echeanceParDefaut(e.target.value));
                }}
                className={CLASSE_CHAMP}
              />
            </label>
            <label className="block">
              <span className={libelle}>Échéance de paiement</span>
              <input type="date" value={echeance} min={date} onChange={(e) => setEcheance(e.target.value)} className={CLASSE_CHAMP} />
            </label>
          </div>
          <EditeurLignes lignes={lignes} onChange={setLignes} articles={articles} fournisseurId={fournisseurId || null} />
          {ecarts.length > 0 && (
            <div role="alert" className="mt-3 rounded-lg border-l-4 border-alerte-500 bg-alerte-50 px-3 py-2 text-sm text-alerte-600">
              <p className="font-semibold">La facture ne correspond pas à ce qui a été reçu ou commandé :</p>
              <ul className="mt-1 list-disc pl-5">
                {ecarts.map((e, i) => (
                  <li key={i}>
                    {e.designation} —{" "}
                    {e.nature === "quantite"
                      ? `${e.facture / 1000} facturé(s) pour ${e.commande / 1000} reçu(s) non encore facturé(s)`
                      : `${fmt(e.facture)} F HT facturé pour ${fmt(e.commande)} F commandé`}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Vous pouvez enregistrer quand même — mais vérifiez avec le fournisseur avant de payer.</p>
            </div>
          )}
          <div className="mt-4">
            <ChoixFichiers libelle="Justificatif : la facture scannée ou photographiée (facultatif)" camera />
          </div>
          {resultat && <Retour resultat={resultat} />}
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={enCours || !fournisseurId || !reference.trim()} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {enCours ? "Enregistrement…" : "Enregistrer et comptabiliser"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
