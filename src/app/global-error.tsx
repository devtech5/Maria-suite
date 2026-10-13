"use client";

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
          background: "#0E5E6B",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Maria Suite n&apos;a pas pu démarrer
        </h1>

        <p style={{ maxWidth: "52ch", fontSize: "0.875rem", opacity: 0.9 }}>
          Le service est momentanément indisponible. Vos données sont intactes :
          rien n&apos;est perdu, et les ventes encaissées sur un appareil y
          restent jusqu&apos;au retour du service.
        </p>

        {error.digest && (
          <p style={{ fontSize: "0.75rem", opacity: 0.75 }}>
            Code à transmettre : <strong>{error.digest}</strong>
          </p>
        )}

        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: "0.5rem",
            height: "3rem",
            padding: "0 2rem",
            border: 0,
            borderRadius: "0.75rem",
            background: "#fff",
            color: "#0E5E6B",
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
