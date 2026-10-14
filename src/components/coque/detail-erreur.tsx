"use client";

import { useEffect, useState } from "react";

import type { ErreurRecente } from "@/lib/erreurs-recentes";

/**
 * Le message technique d'une erreur, sous son code, pour le propriétaire.
 *
 * Les autres comptes n'en reçoivent rien (la route répond 403) et ne voient
 * que le code. Styles en ligne : l'écran d'erreur global n'a pas la feuille
 * de styles de l'application.
 */
export function DetailErreur({ digest, sombre = false }: { digest?: string; sombre?: boolean }) {
  const [detail, setDetail] = useState<ErreurRecente | null>(null);

  useEffect(() => {
    if (!digest) return;
    let actif = true;
    fetch(`/api/erreurs/${encodeURIComponent(digest)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ErreurRecente>) : null))
      .then((d) => actif && setDetail(d))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [digest]);

  if (!detail) return null;
  return (
    <details
      open
      style={{
        marginTop: 16,
        textAlign: "left",
        fontSize: 12,
        lineHeight: 1.5,
        borderRadius: 8,
        padding: "10px 12px",
        background: sombre ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
        color: "inherit",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Détail technique (visible par le propriétaire)</summary>
      <p style={{ margin: "8px 0 4px", opacity: 0.8 }}>
        {detail.chemin} · {new Date(detail.horodatage).toLocaleString("fr-FR")}
      </p>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, monospace" }}>
        {detail.message}
      </pre>
    </details>
  );
}
