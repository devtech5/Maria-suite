import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { LIBELLE_STATUT_PROJET } from "@/modules/projets/calcul";
import { projetsDuTerrain } from "@/modules/projets/terrain";
import { LIBELLE_ROLE } from "@/modules/projets/terrain-regles";

export const metadata: Metadata = { title: "Mon terrain" };

/** Les projets où je suis en poste, ou dont je suis le chef : l'entrée de l'interface terrain. */
export default async function PageTerrain() {
  const session = await exigerEntreprise();
  const projets = await projetsDuTerrain(session.organizationId, session.userId);
  return (
    <>
      <EnTetePage titre="Mon terrain" sousTitre="Les projets qui vous sont confiés : relevez sur place, avec photo et position GPS." />
      {projets.length === 0 ? (
        <EtatVide titre="Aucun projet ne vous est confié" message="Le chef de projet vous confie un projet depuis sa fiche : vous le retrouverez ici, avec de quoi relever ce que vous constatez sur place." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projets.map((p) => (
            <li key={p.id}>
              <Link href={`/terrain/${p.id}`} className="block h-full rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm transition hover:-translate-y-px hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="chiffres text-xs text-[var(--encre-faible)]">{p.code}</p>
                    <h2 className="text-base font-semibold">{p.nom}</h2>
                  </div>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {p.chef && <Pastille ton="marque">Chef de projet</Pastille>}
                    <Pastille ton={p.role === "superviseur" ? "valide" : "neutre"}>{LIBELLE_ROLE[p.role]}</Pastille>
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--encre-faible)]">
                  {LIBELLE_STATUT_PROJET[p.statut as keyof typeof LIBELLE_STATUT_PROJET] ?? p.statut} · {p.releves} relevé{p.releves > 1 ? "s" : ""}
                </p>
                {p.aExaminer > 0 && (p.chef || p.role === "superviseur") && (
                  <p className="mt-2">
                    <Pastille ton="alerte">{p.aExaminer} à examiner</Pastille>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
