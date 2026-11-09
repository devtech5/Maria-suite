import Link from "next/link";

import { definitionDroit, type Droit } from "@/lib/droits/catalogue";

/**
 * Écran affiché quand le rôle ne porte pas le droit d'entrer, ou que l'accès
 * de la personne à ce module a été resserré ou coupé.
 *
 * Rendu à la place du module, dans sa coque : la barre latérale et le fil
 * d'Ariane restent là, et l'on repart d'un clic. Une page d'erreur plein écran
 * donnerait l'impression que le logiciel est cassé alors qu'il fonctionne
 * exactement comme prévu.
 *
 * `forbidden()` de Next ferait la même chose avec un vrai code 403, mais exige
 * l'option expérimentale `authInterrupts`. Un refus de droit est trop central
 * pour reposer sur une API qui peut changer de forme à la prochaine version.
 */
export function AccesRefuse({ droit }: { droit: Droit }) {
  const definition = definitionDroit(droit);

  return (
    <div className="mx-auto max-w-[60ch] rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-6 text-center">
      <h1 className="text-lg font-semibold">Accès réservé</h1>

      <p className="mt-3 text-sm text-[var(--encre-douce)]">
        Votre rôle ou vos accès ne couvrent pas cette partie du logiciel. Le
        droit manquant est <strong>{definition.libelle}</strong>.
      </p>

      <p className="mt-2 text-sm text-[var(--encre-douce)]">
        Le responsable de l&apos;entreprise peut vous l&apos;ouvrir depuis
        Administration → Utilisateurs : en changeant votre rôle, ou votre
        niveau d&apos;accès à ce module.
      </p>

      <Link
        href="/"
        className="h-cible mt-5 inline-flex items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold leading-[var(--h-cible)] text-white hover:bg-marque-700"
      >
        Revenir au tableau de bord
      </Link>
    </div>
  );
}
