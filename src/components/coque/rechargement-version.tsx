"use client";

import { useEffect } from "react";

import { erreurDeVersion, rechargementPermis } from "@/lib/version-deployee";

const CLE = "maria-rechargement-version";

/**
 * Recharge la page, une fois, quand l'erreur vient d'une version périmée
 * (voir `version-deployee.ts`). `toutes` : l'écran de dernier recours, où une
 * erreur sans code vient forcément du navigateur — le cas typique d'un onglet
 * resté ouvert pendant une mise en production.
 */
export function useRechargementApresVersion(erreur: Error & { digest?: string }, toutes = false): boolean {
  const aRecharger = erreurDeVersion(erreur) || (toutes && !erreur.digest);
  useEffect(() => {
    if (!aRecharger) return;
    try {
      const dernier = sessionStorage.getItem(CLE);
      if (!rechargementPermis(dernier ? Number(dernier) : null, Date.now())) return;
      sessionStorage.setItem(CLE, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [aRecharger]);
  return aRecharger;
}
