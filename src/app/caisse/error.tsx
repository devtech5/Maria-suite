"use client";

/**
 * Frontière d'erreur de la caisse.
 *
 * Écrite à part et non partagée avec la gestion, parce que la question posée
 * n'est pas la même. Devant un écran de gestion cassé, on se demande comment
 * revenir en arrière ; devant une caisse cassée, on se demande **si la recette
 * est perdue** — et c'est la seule chose à laquelle répondre en premier.
 *
 * Elle ne l'est pas. Les tickets non transmis vivent dans IndexedDB
 * (`src/lib/caisse/file-locale.ts`), hors de React : ni ce plantage ni un
 * rechargement ne les touchent. Ils repartiront à la prochaine ouverture, la
 * file se vidant d'elle-même toutes les trente secondes.
 *
 * Pas de coque, pas de barre du haut : la caisse occupe tout l'écran, et son
 * écran d'erreur aussi. Une seule action, en grand, atteignable au pouce sur
 * une tablette posée sur un comptoir.
 */
export default function ErreurCaisse({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-[var(--fond)] p-6 text-center">
      <h1 className="text-xl font-semibold">La caisse s&apos;est interrompue</h1>

      <p className="max-w-[52ch] text-sm font-medium text-[var(--encre)]">
        Aucune vente n&apos;est perdue. Les tickets encaissés sans réseau sont
        conservés sur cet appareil et repartiront tout seuls.
      </p>

      <p className="max-w-[52ch] text-sm text-[var(--encre-douce)]">
        Rouvrez la caisse pour reprendre l&apos;encaissement. Si elle
        s&apos;interrompt de nouveau, servez au carnet et appelez le support —
        la reprise se fera à la réouverture.
      </p>

      {error.digest && (
        <p className="text-xs text-[var(--encre-faible)]">
          Code à transmettre :{" "}
          <code className="chiffres font-semibold text-[var(--encre)]">
            {error.digest}
          </code>
        </p>
      )}

      <button
        type="button"
        onClick={() => retry()}
        className="mt-2 h-14 rounded-xl bg-marque-600 px-8 text-base font-semibold text-white hover:bg-marque-700"
      >
        Rouvrir la caisse
      </button>
    </main>
  );
}
