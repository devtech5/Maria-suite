"use client";

import { useState, useTransition } from "react";

import { lienQr } from "@/modules/visiteurs/actions";

/** Copie le lien du QR d'entrée, pour l'envoyer soi-même (SMS, e-mail). */
export function CopierLienQr({ visiteId }: { visiteId: string }) {
  const [etat, setEtat] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            const lien = await lienQr(visiteId);
            if (!lien) return setEtat("Lien indisponible.");
            try {
              await navigator.clipboard.writeText(lien);
              setEtat("Lien copié.");
            } catch {
              window.prompt("Copiez le lien du QR :", lien);
            }
          })
        }
        className="h-9 rounded-lg border border-[var(--filet)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
      >
        Copier le lien du QR
      </button>
      {etat && <span className="text-xs text-[var(--encre-faible)]">{etat}</span>}
    </span>
  );
}
