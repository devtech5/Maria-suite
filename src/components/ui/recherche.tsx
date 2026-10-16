import Link from "next/link";
import type { ReactNode } from "react";

import type { Periode } from "@/lib/recherche";

import { CLASSE_CHAMP_COMPACT } from "./primitives";

/**
 * Recherche d'une liste, par l'adresse de la page (`?q=`, et `?du=` / `?au=`
 * quand la liste a une date).
 *
 * Un simple formulaire GET : il marche sans JavaScript, se partage par lien,
 * et le bouton « Retour » du navigateur rend la recherche précédente. La
 * liste se filtre côté serveur, avec la même normalisation partout
 * (`lireFiltresListe`, `correspond`, `dansPeriode` de `@/lib/recherche`).
 */
export function Recherche({
  valeur,
  placeholder,
  chemin,
  filtres,
  periode,
  resultats,
}: {
  valeur: string;
  placeholder: string;
  /** Page cible : sert au lien d'effacement. */
  chemin: string;
  /** Champs supplémentaires du formulaire (un `select` de famille…). */
  filtres?: ReactNode;
  /**
   * Filtre « du … au … » sur la date qui compte pour la liste (date de
   * facture, échéance, début…), que `libelle` nomme.
   */
  periode?: Periode & { libelle: string };
  /** « 12 sur 36 » : affiché quand un filtre est actif. */
  resultats?: string;
}) {
  return (
    <form role="search" method="get" action={chemin} className="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="search"
        name="q"
        defaultValue={valeur}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${CLASSE_CHAMP_COMPACT} min-w-0 flex-1 sm:max-w-sm`}
      />
      {filtres}
      {periode && (
        <fieldset className="flex flex-wrap items-center gap-1.5 text-sm">
          <legend className="sr-only">{periode.libelle}</legend>
          <span className="text-[var(--encre-faible)]">{periode.libelle} du</span>
          <input type="date" name="du" defaultValue={periode.du ?? ""} aria-label={`${periode.libelle} : du`} className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          <span className="text-[var(--encre-faible)]">au</span>
          <input type="date" name="au" defaultValue={periode.au ?? ""} aria-label={`${periode.libelle} : au`} className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
        </fieldset>
      )}
      <button
        type="submit"
        className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
      >
        Rechercher
      </button>
      {resultats && (
        <span className="text-xs text-[var(--encre-faible)]">
          {resultats} ·{" "}
          <Link href={chemin} className="font-semibold text-marque-600 hover:underline">
            Tout afficher
          </Link>
        </span>
      )}
    </form>
  );
}

export { correspond, normaliser } from "@/lib/recherche";
