"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { IconeModule } from "@/components/coque/icone-module";
import type { CleIcone } from "@/lib/navigation";

import { enregistrerModulesRoles, type ResultatAcces } from "../actions";

export interface ColonneRole {
  id: string;
  nom: string;
  /** Modules que le rôle ouvre : ailleurs, la case n'a pas lieu d'être. */
  modules: string[];
}

export interface GroupeModules {
  titre: string;
  modules: { cle: string; nom: string; icone: CleIcone }[];
}

/**
 * « Modules par rôle » : une ligne par module, une colonne par rôle. Case
 * cochée, le rôle a le module ; décochée, tous ses comptes le perdent.
 * Un tiret : le rôle n'y a aucun droit, il n'y a rien à désactiver.
 */
export function GrilleModulesRoles({
  roles,
  groupes,
  desactives: desactivesInitiaux,
}: {
  roles: ColonneRole[];
  groupes: GroupeModules[];
  desactives: { roleId: string; moduleKey: string }[];
}) {
  const cle = (roleId: string, moduleKey: string) => `${roleId}:${moduleKey}`;
  const [desactives, setDesactives] = useState(() => new Set(desactivesInitiaux.map((d) => cle(d.roleId, d.moduleKey))));
  const [resultat, setResultat] = useState<ResultatAcces | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const ouvre = new Map(roles.map((r) => [r.id, new Set(r.modules)]));

  function poser(moduleKey: string, roleIds: string[], actif: boolean) {
    setDesactives((avant) => {
      const apres = new Set(avant);
      for (const id of roleIds) {
        if (!ouvre.get(id)?.has(moduleKey)) continue;
        if (actif) apres.delete(cle(id, moduleKey));
        else apres.add(cle(id, moduleKey));
      }
      return apres;
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="text-base font-semibold">Modules par rôle</h2>
      <p className="mt-1 max-w-[110ch] text-sm text-[var(--encre-douce)]">
        Visible du seul propriétaire. Par défaut, chaque rôle a les modules que ses droits ouvrent (case cochée). Décochez pour retirer un
        module à tout un rôle : il quitte le menu de ses comptes, et ses écrans comme ses actions leur sont refusés par le serveur. Vous
        gardez l&apos;accès à tout. Pour une seule personne, utilisez le bouton « Modules » de son compte.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--filet)]">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--surface-creuse)] text-xs text-[var(--encre-douce)]">
              <th className="sticky left-0 z-[1] bg-[var(--surface-creuse)] px-3 py-2.5 text-left font-semibold">Module</th>
              <th className="px-2 py-2.5" aria-label="Tous ou aucun" />
              {roles.map((r) => (
                <th key={r.id} className="max-w-28 px-2 py-2.5 text-center font-semibold leading-tight">
                  {r.nom}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupes.map((g) => (
              <GroupeLignes key={g.titre} groupe={g} roles={roles} ouvre={ouvre} desactives={desactives} cle={cle} poser={poser} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--encre-faible)]">Chaque désactivation et chaque réouverture est inscrite au journal d&apos;activité.</p>
        <div className="flex items-center gap-3">
          {resultat && (
            <span role={resultat.ok ? "status" : "alert"} className={`text-sm font-medium ${resultat.ok ? "text-valide-600" : "text-danger-600"}`}>
              {resultat.message}
            </span>
          )}
          <button
            type="button"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const liste = [...desactives].map((c) => {
                  const [roleId, moduleKey] = c.split(":");
                  return { roleId, moduleKey };
                });
                const r = await enregistrerModulesRoles(liste);
                setResultat(r);
                if (r.ok) routeur.refresh();
              })
            }
            className="h-cible rounded-lg bg-marque-600 px-5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </section>
  );
}

function GroupeLignes({
  groupe,
  roles,
  ouvre,
  desactives,
  cle,
  poser,
}: {
  groupe: GroupeModules;
  roles: ColonneRole[];
  ouvre: Map<string, Set<string>>;
  desactives: Set<string>;
  cle: (roleId: string, moduleKey: string) => string;
  poser: (moduleKey: string, roleIds: string[], actif: boolean) => void;
}) {
  const ids = roles.map((r) => r.id);
  return (
    <>
      <tr>
        <td colSpan={roles.length + 2} className="border-t border-[var(--filet)] px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--encre-faible)]">
          {groupe.titre}
        </td>
      </tr>
      {groupe.modules.map((m) => (
        <tr key={m.cle} className="border-t border-[var(--filet)]">
          <td className="sticky left-0 z-[1] bg-[var(--surface)] px-3 py-2">
            <span className="flex items-center gap-2.5 font-medium">
              <IconeModule cle={m.icone} className="size-[18px] shrink-0" />
              {m.nom}
            </span>
          </td>
          <td className="whitespace-nowrap px-2 py-2 text-xs">
            <button type="button" onClick={() => poser(m.cle, ids, true)} className="font-semibold text-marque-600 hover:underline">
              Tous
            </button>
            <button type="button" onClick={() => poser(m.cle, ids, false)} className="ml-3 text-[var(--encre-douce)] hover:underline">
              Aucun
            </button>
          </td>
          {roles.map((r) => (
            <td key={r.id} className="px-2 py-2 text-center">
              {ouvre.get(r.id)?.has(m.cle) ? (
                <input
                  type="checkbox"
                  checked={!desactives.has(cle(r.id, m.cle))}
                  onChange={(e) => poser(m.cle, [r.id], e.target.checked)}
                  aria-label={`${m.nom} pour ${r.nom}`}
                  className="size-4 accent-[var(--color-marque-600)]"
                />
              ) : (
                <span aria-label="Le rôle n'y a aucun droit" className="text-[var(--encre-faible)]">
                  —
                </span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
