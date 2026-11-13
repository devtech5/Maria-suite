"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { creerModele } from "@/modules/catalogue/actions-modeles";
import { combinaisons, nettoyerAxes, nombreDeVariantes, referenceVariante, refusAxes } from "@/modules/catalogue/variantes";
import { Fenetre } from "@/components/ui/fenetre";

const valeursDe = (texte: string) => texte.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);

/** Saisie d'un modèle : ses axes, et l'aperçu des variantes qui vont naître. */
export function FormulaireModele({ familles }: { familles: { id: string; nom: string }[] }) {
  const op = useOperation();
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [designation, setDesignation] = useState("");
  const [reference, setReference] = useState("");
  const [familleId, setFamilleId] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [axesSaisis, setAxesSaisis] = useState([
    { nom: "Taille", valeurs: "S, M, L, XL" },
    { nom: "Couleur", valeurs: "" },
  ]);

  const axes = nettoyerAxes(axesSaisis.map((a) => ({ nom: a.nom, valeurs: valeursDe(a.valeurs) }))).filter((a) => a.valeurs.length);
  const refus = refusAxes(axes);
  const n = nombreDeVariantes(axes);
  const exemples = refus ? [] : combinaisons(axes).slice(0, 4).map((c) => referenceVariante((reference || "REF").toUpperCase(), c, axes));

  return (
    <>
      <div className="mb-5">
        <button type="button" onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white">
          Nouveau modèle
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouveau modèle" presentation="ample" large onFermer={() => setOuvert(false)}>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        op.lancer(
          () =>
            creerModele({
              reference: reference || undefined,
              designation,
              familleId: familleId || null,
              prixVente: Number(prixVente || 0),
              prixAchat: Number(prixAchat || 0),
              axes,
            }),
          (r) => r.ok && "id" in r && r.id && routeur.push(`/stock/modeles/${r.id}`),
        );
      }}
      className="space-y-4 px-5 py-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm xl:col-span-2">
          <span className="mb-1 block font-medium">Désignation</span>
          <input required value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Polo piqué coton" className={`${CLASSE_CHAMP_COMPACT} h-10 w-full`} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Référence</span>
          <input value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="POLO" className={`${CLASSE_CHAMP_COMPACT} h-10 w-full font-mono`} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Prix de vente</span>
          <input required inputMode="numeric" value={prixVente} onChange={(e) => setPrixVente(e.target.value.replace(/\D/g, ""))} className={`${CLASSE_CHAMP_COMPACT} h-10 w-full`} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Prix d&apos;achat</span>
          <input inputMode="numeric" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value.replace(/\D/g, ""))} className={`${CLASSE_CHAMP_COMPACT} h-10 w-full`} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Famille</span>
          <select value={familleId} onChange={(e) => setFamilleId(e.target.value)} className={`${CLASSE_CHAMP_COMPACT} h-10 w-full`}>
            <option value="">—</option>
            {familles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Axes de déclinaison</legend>
        {axesSaisis.map((a, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input
              value={a.nom}
              onChange={(e) => setAxesSaisis(axesSaisis.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))}
              placeholder="Axe (Taille, Couleur…)"
              aria-label={`Nom de l'axe ${i + 1}`}
              className={`${CLASSE_CHAMP_COMPACT} h-10 w-40`}
            />
            <input
              value={a.valeurs}
              onChange={(e) => setAxesSaisis(axesSaisis.map((x, j) => (j === i ? { ...x, valeurs: e.target.value } : x)))}
              placeholder="Valeurs séparées par des virgules : Noir, Blanc, Bleu marine"
              aria-label={`Valeurs de l'axe ${i + 1}`}
              className={`${CLASSE_CHAMP_COMPACT} h-10 min-w-60 flex-1`}
            />
            {axesSaisis.length > 1 && (
              <button type="button" onClick={() => setAxesSaisis(axesSaisis.filter((_, j) => j !== i))} className="text-sm text-[var(--encre-faible)] hover:underline">
                Retirer
              </button>
            )}
          </div>
        ))}
        {axesSaisis.length < 3 && (
          <button type="button" onClick={() => setAxesSaisis([...axesSaisis, { nom: "", valeurs: "" }])} className="text-sm font-semibold text-marque-600 hover:underline">
            + Ajouter un axe
          </button>
        )}
      </fieldset>

      <p className={`text-sm ${refus ? "text-alerte-600" : "text-[var(--encre-douce)]"}`}>
        {refus ?? `${n} variante${n > 1 ? "s" : ""} : ${exemples.join(", ")}${n > exemples.length ? "…" : ""}`}
      </p>

      <div className="flex items-center justify-end gap-3">
        {op.resultat && <Retour resultat={op.resultat} />}
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
          Fermer
        </button>
        <button type="submit" disabled={op.enCours || Boolean(refus) || !designation} className="h-cible rounded-lg bg-marque-600 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Création…" : `Créer ${n || ""} variante${n > 1 ? "s" : ""}`}
        </button>
      </div>
    </form>
      </Fenetre>
    </>
  );
}
