"use client";

import { useActionState } from "react";

import { seConnecter, type EtatConnexion } from "@/lib/auth/actions";
import { ChampMotDePasse } from "@/components/ui/mot-de-passe";

/** Saisie des écrans d'accès, aux couleurs de MARIA GROUP : l'or entoure, le bleu nuit trace. */
export const CLASSE_SAISIE =
  "h-touche w-full rounded-xl border border-[var(--filet)] bg-[var(--surface)] px-4 text-base outline-none transition-shadow focus:border-marque-600 focus:ring-4 focus:ring-or/30";

/**
 * Connexion par adresse e-mail et mot de passe.
 *
 * Deux champs sur un seul écran, et les attributs `autocomplete` qui laissent
 * le gestionnaire de mots de passe du téléphone faire son travail : un mot de
 * passe qu'on peut enregistrer est un mot de passe qu'on n'écrit pas sur un
 * papier collé à la caisse.
 */
export function FormulaireConnexion({ suite }: { suite?: string }) {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(
    seConnecter,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* La page demandée avant la connexion ; l'action ne suit qu'un chemin interne. */}
      {suite && <input type="hidden" name="suite" value={suite} />}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Adresse e-mail</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          defaultValue={etat.email}
          placeholder="vous@entreprise.ci"
          className={CLASSE_SAISIE}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Mot de passe</span>
        <ChampMotDePasse
          name="motDePasse"
          autoComplete="current-password"
          required
          className={CLASSE_SAISIE}
        />
      </label>

      {etat.erreur && (
        <p
          role="alert"
          className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
        >
          {etat.erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="sans-selection mt-2 h-touche w-full rounded-xl bg-marque-600 text-base font-bold text-white ring-1 ring-or/40 transition-colors hover:bg-marque-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-or/50 disabled:opacity-50"
      >
        {enCours ? "Un instant…" : "Se connecter"}
      </button>
    </form>
  );
}
