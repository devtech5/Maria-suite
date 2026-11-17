"use client";

import { useEffect } from "react";

/**
 * Inscrit le service worker de l'application installable (`public/sw.js`).
 *
 * En production seulement : en développement, un service worker garderait
 * des fichiers d'une compilation à l'autre et masquerait les modifications.
 * `updateViaCache: "none"` fait relire `sw.js` au réseau à chaque visite,
 * pour qu'un déploiement le remplace sans attendre.
 */
export function EnregistrerServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Navigation privée, contexte non sécurisé : l'application marche sans.
    });
  }, []);
  return null;
}
