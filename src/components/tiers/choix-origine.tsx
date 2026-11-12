"use client";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { PAYS_PROPOSES, nomPays, type OrigineTiers } from "@/modules/tiers/origine";

/** Pays proposés à l'international, classés par nom français : calculé une fois, hors du rendu. */
export const PAYS_CLASSES = [...PAYS_PROPOSES].map((code) => ({ code, nom: nomPays(code) })).sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

/**
 * Local ou international : établi dans le pays de l'entreprise, ou ailleurs
 * (avec son pays). Même choix pour un fournisseur et pour un prestataire.
 * Les champs `origine` et `pays` partent avec le formulaire.
 */
export function ChoixOrigine({
  libelle,
  paysEntreprise,
  origine,
  pays,
  onOrigine,
  onPays,
}: {
  /** « Type de fournisseur », « Localisation du prestataire »… */
  libelle: string;
  paysEntreprise: string;
  origine: OrigineTiers;
  pays: string;
  onOrigine: (o: OrigineTiers) => void;
  onPays: (p: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{libelle}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ["local", "Local", `Établi en ${nomPays(paysEntreprise)}.`],
          ["international", "International", "Établi dans un autre pays."],
        ] as const).map(([valeur, titre, aide]) => (
          <label key={valeur} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${origine === valeur ? "border-marque-600 bg-[var(--surface-creuse)]" : "border-[var(--filet)]"}`}>
            <input type="radio" name="origine" value={valeur} checked={origine === valeur} onChange={() => onOrigine(valeur)} className="mt-1 accent-marque-600" />
            <span>
              <span className="block text-sm font-semibold">{titre}</span>
              <span className="block text-xs text-[var(--encre-faible)]">{aide}</span>
            </span>
          </label>
        ))}
      </div>
      {origine === "international" && (
        <div className="mt-3 max-w-xs">
          <Champ libelle="Pays">
            <select name="pays" required value={pays} onChange={(e) => onPays(e.target.value)} className={CLASSE_CHAMP}>
              <option value="" disabled>
                — Choisir le pays —
              </option>
              {PAYS_CLASSES.filter((p) => p.code !== paysEntreprise.toUpperCase()).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.nom}
                </option>
              ))}
            </select>
          </Champ>
        </div>
      )}
    </fieldset>
  );
}
