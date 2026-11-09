"use client";

import { Fragment, useState } from "react";

import { Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import type { RoleDeLEntreprise } from "@/lib/auth/roles";
import type { Droit } from "@/lib/droits/catalogue";
import { supprimerRole } from "./actions";
import { FormulaireRole, type GroupeDroits } from "./formulaire-role";

/**
 * Les rôles de l'entreprise, en tableau : nom, code, droits, comptes actifs.
 * « Voir » ou « Modifier » déplie la ligne sur la liste de ce qu'il ouvre.
 */
export function ListeRoles({
  roles,
  groupes,
  detenus,
  totalDroits,
}: {
  roles: RoleDeLEntreprise[];
  groupes: GroupeDroits[];
  detenus: Droit[];
  totalDroits: number;
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
          + Nouveau rôle
        </button>
      </div>

      {ouvert === "nouveau" && (
        <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold">Nouveau rôle</h2>
          <FormulaireRole groupes={groupes} detenus={detenus} onFini={() => setOuvert(null)} />
        </div>
      )}

      <Tableau>
        <thead>
          <tr>
            <Th>Rôle</Th>
            <Th>Code</Th>
            <Th aligne="droite">Droits</Th>
            <Th aligne="droite">Comptes actifs</Th>
            <Th aligne="droite">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const deplie = ouvert === role.id;
            return (
              <Fragment key={role.id}>
                <tr>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {role.nom}
                      <Pastille ton={role.systeme ? "valide" : "marque"}>{role.systeme ? "Fourni" : "Composé"}</Pastille>
                    </span>
                    {role.description && <span className="block text-xs text-[var(--encre-faible)]">{role.description}</span>}
                  </Td>
                  <Td>
                    <span className="font-mono text-[13px]">{role.cle.toUpperCase()}</span>
                  </Td>
                  <Td aligne="droite" chiffres>
                    {role.droits.length} / {totalDroits}
                  </Td>
                  <Td aligne="droite" chiffres>
                    {role.membres}
                  </Td>
                  <Td aligne="droite">
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setOuvert(deplie ? null : role.id)}
                        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-marque-600 hover:bg-[var(--surface-creuse)]"
                      >
                        {deplie ? "Refermer" : role.systeme ? "Voir" : "Modifier"}
                      </button>
                      {/* Un rôle porté ne se supprime pas : ses porteurs se
                          retrouveraient rattachés sans droits. */}
                      {!role.systeme && role.membres === 0 && (
                        <form action={supprimerRole}>
                          <input type="hidden" name="roleId" value={role.id} />
                          <button type="submit" className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-danger-600 hover:bg-danger-50">
                            Supprimer
                          </button>
                        </form>
                      )}
                    </span>
                  </Td>
                </tr>
                {deplie && (
                  <tr>
                    <td colSpan={5} className="border-t border-[var(--filet)] bg-[var(--surface-creuse)] px-4 py-3">
                      {role.systeme ? (
                        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          {role.droits.map((droit) => (
                            <li key={droit} className="text-[var(--encre-douce)]">
                              {libelles.get(droit) ?? droit}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <FormulaireRole
                          role={{ id: role.id, nom: role.nom, description: role.description, droits: role.droits }}
                          groupes={groupes}
                          detenus={detenus}
                          onFini={() => setOuvert(null)}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Tableau>
    </div>
  );
}
