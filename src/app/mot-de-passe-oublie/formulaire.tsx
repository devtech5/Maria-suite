"use client";

import { useActionState } from "react";

import { CLASSE_SAISIE } from "@/app/connexion/formulaire";
import { demanderReinitialisation, type EtatDemande } from "@/lib/auth/reinitialisation";

export function FormulaireDemande() {
  const [etat, action, enCours] = useActionState<EtatDemande, FormData>(demanderReinitialisation, {});

  if (etat.message) {
    return (
      <p role="status" className="rounded-lg bg-valide-50 px-3 py-2.5 text-sm font-medium text-valide-600">
        {etat.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
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
          placeholder="prenom.nom@maria-groupe.com"
          className={CLASSE_SAISIE}
        />
      </label>

      {etat.erreur && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600">
          {etat.erreur}
        </p>
      )}

      <button type="submit" disabled={enCours} className="h-touche rounded-xl bg-marque-600 text-base font-semibold text-white disabled:opacity-60">
        {enCours ? "Envoi…" : "Recevoir le lien"}
      </button>
    </form>
  );
}
