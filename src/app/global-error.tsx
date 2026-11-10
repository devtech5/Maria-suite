"use client";

import { DetailErreur } from "@/components/coque/detail-erreur";
import { useRechargementApresVersion } from "@/components/coque/rechargement-version";

/**
 * Dernier filet : la coque racine elle-même a échoué.
 *
 * Il remplace `app/layout.tsx`, donc il porte ses propres `<html>` et
 * `<body>` — et il ne peut compter sur rien de ce que la coque installe :
 * ni la feuille de styles, ni les variables de thème, ni les composants
 * partagés. D'où des styles écrits à la main, ce qui serait une faute
 * n'importe où ailleurs dans ce dépôt.
 *
 * Ce cas ne devrait jamais se produire. Sans lui, il produit l'écran d'erreur
 * brut de Next : un fond blanc, une phrase en anglais, et un exploitant
 * ivoirien qui conclut que le logiciel est mort.
 */
export default function ErreurGlobale({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Sans code, l'erreur vient du navigateur : presque toujours un onglet resté
  // ouvert pendant une mise en production. La page se recharge d'elle-même.
  const version = useRechargementApresVersion(error, true);
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#162E49",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          {version ? "Une nouvelle version de Maria Suite est en ligne" : "Maria Suite n\u2019a pas pu démarrer"}
        </h1>

        <p style={{ maxWidth: "52ch", fontSize: "0.875rem", opacity: 0.9 }}>
          {version
            ? "Cet onglet était resté sur l\u2019ancienne version. La page se recharge ; si elle ne le fait pas, cliquez sur Réessayer. Vos données sont intactes."
            : "Le service est momentanément indisponible. Vos données sont intactes : rien n\u2019est perdu, et les ventes encaissées sur un appareil y restent jusqu\u2019au retour du service."}
        </p>

        {error.digest && (
          <p style={{ fontSize: "0.75rem", opacity: 0.75 }}>
            Code à transmettre : <strong>{error.digest}</strong>
          </p>
        )}

        <div style={{ width: "100%", maxWidth: "72ch" }}>
          <DetailErreur digest={error.digest} sombre />
        </div>

        <button
          type="button"
          // Rechargement complet, pas `retry()` seul : après un déploiement,
          // l'onglet garde l'ancien code et rejouerait la même erreur.
          onClick={() => {
            retry();
            window.location.reload();
          }}
          style={{
            marginTop: "0.5rem",
            height: "3rem",
            padding: "0 2rem",
            border: 0,
            borderRadius: "0.75rem",
            background: "#fff",
            color: "#162E49",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
