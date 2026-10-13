"use client";

import { useState } from "react";

import { Pastille } from "@/components/ui/primitives";
import type { RoleDeLEntreprise } from "@/lib/auth/roles";
import type { Droit } from "@/lib/droits/catalogue";
import { supprimerRole } from "./actions";
import { FormulaireRole, type GroupeDroits } from "./formulaire-role";

/**
 * Les rôles de l'entreprise, ouverts un à un.
 *
 * Une carte par rôle plutôt qu'un tableau : ce qui distingue deux rôles, ce
 * n'est pas une colonne mais la liste de ce qu'ils ouvrent. Elle se déplie
 * sous le nom, et seule celle qu'on regarde est visible.
 */
export function ListeRoles({
  roles,
  groupes,
  detenus,
}: {
  roles: RoleDeLEntreprise[];
  groupes: GroupeDroits[];
  detenus: Droit[];
}) {
  // `null` : rien d'ouvert. `"nouveau"` : composition d'un rôle neuf.
  const [ouvert, setOuvert] = useState<string | null>(null);

  const libelles = new Map<Droit, string>(
    groupes.flatMap((groupe) => groupe.droits.map((d) => [d.cle, d.libelle] as const)),
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOuvert(ouvert === "nouveau" ? null : "nouveau")}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          Composer un rôle
        </button>
      </div>

      {ouvert === "nouveau" && (
        <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold">Nouveau rôle</h2>
          <FormulaireRole
            groupes={groupes}
            detenus={detenus}
            onFini={() => setOuvert(null)}
          />
        </div>
      )}

      {roles.map((role) => {
        const deplie = ouvert === role.id;

        return (
          <div
            key={role.id}
            className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {role.nom}
                  {role.systeme && <Pastille>Fourni par Maria Suite</Pastille>}
                </h2>
                {role.description && (
                  <p className="mt-0.5 text-sm text-[var(--encre-douce)]">
                    {role.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-[var(--encre-faible)]">
                  {role.droits.length} droit{role.droits.length > 1 ? "s" : ""} ·{" "}
                  {role.membres === 0
                    ? "personne ne le porte"
                    : `${role.membres} personne${role.membres > 1 ? "s" : ""}`}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setOuvert(deplie ? null : role.id)}
                  className="h-cible rounded-lg border border-[var(--filet)] px-3 text-sm font-medium hover:bg-[var(--surface-creuse)]"
                >
                  {deplie ? "Refermer" : role.systeme ? "Voir les droits" : "Modifier"}
                </button>

                {/* Un rôle porté ne se supprime pas : ses porteurs se
                    retrouveraient rattachés sans droits. */}
                {!role.systeme && role.membres === 0 && (
                  <form action={supprimerRole}>
                    <input type="hidden" name="roleId" value={role.id} />
                    <button
                      type="submit"
                      className="h-cible rounded-lg px-3 text-sm font-medium text-danger-600 hover:bg-danger-50"
                    >
                      Supprimer
                    </button>
                  </form>
                )}
              </div>
            </div>

            {deplie &&
              (role.systeme ? (
                <ul className="mt-3 grid gap-1 border-t border-[var(--filet)] pt-3 text-sm sm:grid-cols-2">
                  {role.droits.map((droit) => (
                    <li key={droit} className="text-[var(--encre-douce)]">
                      {libelles.get(droit) ?? droit}
                    </li>
                  ))}
                </ul>
              ) : (
                <FormulaireRole
                  role={{
                    id: role.id,
                    nom: role.nom,
                    description: role.description,
                    droits: role.droits,
                  }}
                  groupes={groupes}
                  detenus={detenus}
                  onFini={() => setOuvert(null)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
