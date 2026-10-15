"use client";

import Link from "next/link";

import { DetailErreur } from "@/components/coque/detail-erreur";
import { BoutonPrincipal } from "@/components/ui/primitives";

/**
 * Frontière d'erreur des écrans de gestion.
 *
 * Rendue DANS la coque : la barre du haut et le fil d'Ariane restent là, et
 * l'on repart d'un clic. Un écran d'erreur plein cadre donnerait l'impression
 * que tout le logiciel est tombé alors qu'un seul module a échoué.
 *
 * Le message ne reprend pas celui de l'exception. Une erreur de pilote
 * PostgreSQL n'apprend rien à un exploitant et l'inquiète pour rien ; le
 * détail, lui, part dans le journal du serveur (`src/instrumentation.ts`).
 *
 * Ce qui s'affiche, en revanche, c'est le `digest`. C'est le seul lien entre
 * ce que la personne a sous les yeux et la ligne de journal correspondante :
 * elle le lit au téléphone, et le dépannage commence par la bonne trace au
 * lieu d'une heure approximative.
 */
export default function ErreurGestion({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-[60ch] rounded-xl border border-danger-200 bg-[var(--surface)] p-6 text-center">
      <h1 className="text-lg font-semibold">Cet écran n&apos;a pas pu s&apos;afficher</h1>

      <p className="mt-3 text-sm text-[var(--encre-douce)]">
        Le reste du logiciel fonctionne. Réessayez : si la panne était passagère
        — un réseau coupé le temps d&apos;une requête — l&apos;écran revient.
      </p>

      {error.digest && (
        <p className="mt-3 text-xs text-[var(--encre-faible)]">
          Si elle se répète, transmettez ce code au support :{" "}
          <code className="chiffres font-semibold text-[var(--encre)]">
            {error.digest}
          </code>
        </p>
      )}

      <DetailErreur digest={error.digest} />

      <div className="mt-5 flex justify-center gap-2">
        <BoutonPrincipal onClick={() => retry()}>Réessayer</BoutonPrincipal>
        <Link
          href="/"
          className="h-cible flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]"
        >
          Tableau de bord
        </Link>
      </div>
    </div>
  );
}
