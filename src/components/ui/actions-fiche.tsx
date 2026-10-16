"use client";

import { useRouter } from "next/navigation";

import { agirSurFiche } from "@/lib/fiches/actions";
import { FICHES, type Geste, type TypeFiche } from "@/lib/fiches/registre";

import { Retour, useOperation } from "./operations";

/**
 * Gestes d'une fiche : mettre en off, réactiver, supprimer.
 *
 * L'écran passe ce que la session peut faire (`peut`, côté serveur) : sans
 * droit, le bouton n'apparaît pas. L'action revérifie de toute façon.
 */
export function ActionsFiche({
  type,
  id,
  libelle,
  actif,
  peutGerer,
  peutSupprimer,
  retour,
}: {
  type: TypeFiche;
  id: string;
  /** Nom affiché dans la confirmation. */
  libelle: string;
  /** État courant, pour une fiche qui se met en off. */
  actif?: boolean;
  peutGerer: boolean;
  peutSupprimer: boolean;
  /** Page où aller une fois la fiche supprimée, quand l'écran courant est la fiche elle-même. */
  retour?: string;
}) {
  const op = useOperation();
  const routeur = useRouter();
  const avecOff = FICHES[type].actif && actif !== undefined && peutGerer;
  if (!avecOff && !peutSupprimer) return null;

  function lancer(geste: Geste, question: string) {
    if (!window.confirm(question)) return;
    op.lancer(() => agirSurFiche(type, id, geste), () => {
      if (geste === "supprimer" && retour) routeur.push(retour);
    });
  }

  const bouton = "h-8 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50";
  return (
    <div className="flex flex-col items-end">
      <div className="flex flex-wrap justify-end gap-1.5">
        {avecOff &&
          (actif ? (
            <button
              type="button"
              disabled={op.enCours}
              onClick={() => lancer("desactiver", `Mettre « ${libelle} » en off ? La fiche ne sera plus proposée ; son historique reste et elle se réactive à tout moment.`)}
              className={`${bouton} border border-[var(--filet)] hover:bg-[var(--surface-creuse)]`}
            >
              Mettre en off
            </button>
          ) : (
            <button
              type="button"
              disabled={op.enCours}
              onClick={() => lancer("reactiver", `Réactiver « ${libelle} » ?`)}
              className={`${bouton} border border-[var(--filet)] text-valide-600 hover:bg-valide-50`}
            >
              Réactiver
            </button>
          ))}
        {peutSupprimer && (
          <button
            type="button"
            disabled={op.enCours}
            onClick={() => lancer("supprimer", `Supprimer « ${libelle} » ? Possible seulement si rien ne l'utilise ; le geste est tracé au journal.`)}
            className={`${bouton} text-danger-600 hover:bg-danger-50`}
          >
            Supprimer
          </button>
        )}
      </div>
      <Retour resultat={op.resultat} />
    </div>
  );
}
