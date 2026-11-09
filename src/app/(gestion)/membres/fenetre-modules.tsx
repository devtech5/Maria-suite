"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { IconeModule } from "@/components/coque/icone-module";
import { Fenetre } from "@/components/ui/fenetre";
import type { CleIcone } from "@/lib/navigation";

import { reglerModulesMembre, type ResultatAcces } from "./actions";

export interface ModuleDuMembre {
  cle: string;
  nom: string;
  icone: CleIcone;
  /** Ouvert pour la personne (complet ou consultation). */
  actif: boolean;
  /** Ouvert en lecture seule : la nuance se règle sur sa page d'accès. */
  consultation: boolean;
  /** Désactivé pour tout son rôle : la case n'y peut rien. */
  roleDesactive: boolean;
}

/**
 * « Modules de… » : une case par module que son rôle ouvre. Décocher le rend
 * indisponible à cette personne seulement ; ce que tout un rôle perd se règle
 * dans « Rôles ».
 */
export function FenetreModules({
  ouverte,
  onFermer,
  membershipId,
  nom,
  modules,
}: {
  ouverte: boolean;
  onFermer: () => void;
  membershipId: string;
  nom: string;
  modules: ModuleDuMembre[];
}) {
  const reglables = modules.filter((m) => !m.roleDesactive);
  const [actifs, setActifs] = useState(() => new Set(reglables.filter((m) => m.actif).map((m) => m.cle)));
  const [resultat, setResultat] = useState<ResultatAcces | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const basculer = (cle: string) =>
    setActifs((avant) => {
      const apres = new Set(avant);
      if (apres.has(cle)) apres.delete(cle);
      else apres.add(cle);
      return apres;
    });

  return (
    <Fenetre
      ouverte={ouverte}
      onFermer={onFermer}
      titre={`Modules de ${nom}`}
      sousTitre="Décochez un module pour le rendre indisponible à cette personne seulement : il quitte son menu et ses écrans lui sont refusés. Ce que tout un rôle perd se règle dans « Rôles »."
    >
      <div className="space-y-3 px-5 py-4">
        <div className="flex justify-end gap-4 text-xs font-semibold">
          <button type="button" onClick={() => setActifs(new Set(reglables.map((m) => m.cle)))} className="text-marque-600 hover:underline">
            Tout activer
          </button>
          <button type="button" onClick={() => setActifs(new Set())} className="text-[var(--encre-douce)] hover:underline">
            Tout désactiver
          </button>
        </div>
        {modules.length === 0 ? (
          <p className="text-sm text-[var(--encre-douce)]">Son rôle n&apos;ouvre aucun module.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {modules.map((m) => {
              const coche = !m.roleDesactive && actifs.has(m.cle);
              return (
                <li key={m.cle}>
                  <label
                    className={`flex h-11 items-center gap-2.5 rounded-lg border px-3 text-sm ${
                      m.roleDesactive
                        ? "cursor-not-allowed border-[var(--filet)] opacity-60"
                        : coche
                          ? "cursor-pointer border-[var(--filet)] bg-[var(--surface)]"
                          : "cursor-pointer border-alerte-600/30 bg-alerte-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={coche}
                      disabled={m.roleDesactive}
                      onChange={() => basculer(m.cle)}
                      className="size-4 shrink-0 accent-[var(--color-marque-600)]"
                    />
                    <IconeModule cle={m.icone} className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{m.nom}</span>
                    {m.roleDesactive ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-[var(--encre-faible)]">Rôle</span>
                    ) : !coche ? (
                      <span className="shrink-0 rounded bg-alerte-50 px-1.5 py-0.5 text-[10px] font-semibold text-alerte-600">Désactivé</span>
                    ) : m.consultation ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-[var(--encre-faible)]">Lecture</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {resultat && (
          <p role={resultat.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm font-medium ${resultat.ok ? "bg-valide-50 text-valide-600" : "bg-danger-50 text-danger-600"}`}>
            {resultat.message}
          </p>
        )}
      </div>
      <div className="sticky bottom-0 mt-auto flex justify-end gap-3 border-t border-[var(--filet)] bg-[var(--surface)] px-5 py-3">
        <button type="button" onClick={onFermer} className="h-cible px-3 text-sm text-[var(--encre-douce)] hover:underline">
          Fermer
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() =>
            demarrer(async () => {
              const r = await reglerModulesMembre(membershipId, reglables.map((m) => m.cle), [...actifs]);
              setResultat(r);
              if (r.ok) routeur.refresh();
            })
          }
          className="h-cible rounded-lg bg-marque-600 px-5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Fenetre>
  );
}
