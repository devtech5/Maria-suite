import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmtEntier } from "@/lib/format";
import { CATALOGUE, GROUPES_DONNEES } from "@/modules/donnees/catalogue";
import { compterTables } from "@/modules/donnees/requetes";

import { FormulaireRecherche } from "./recherche";

export const metadata: Metadata = { title: "Données" };

/**
 * Console des données : toutes les tables de l'entreprise, rangées par
 * module. Réservée au propriétaire.
 */
export default async function PageDonnees({ searchParams }: PageProps<"/donnees">) {
  const session = await exigerEntreprise();
  if (!session.estProprietaire) {
    return <EtatVide titre="Réservé au propriétaire" message="La console des données ne s'ouvre qu'au propriétaire de l'entreprise." />;
  }
  const q = String((await searchParams).q ?? "").trim().toLocaleLowerCase("fr-FR");
  const comptes = await compterTables(session.organizationId);
  const groupes = GROUPES_DONNEES.map((g) => ({
    ...g,
    tables: g.tables.filter((nom) => !q || `${nom} ${CATALOGUE.get(nom)?.libelle ?? ""} ${g.libelle}`.toLocaleLowerCase("fr-FR").includes(q)),
  })).filter((g) => g.tables.length > 0);

  return (
    <>
      <EnTetePage
        titre="Données"
        sousTitre={`${CATALOGUE.size} tables, tous modules : voir, modifier, désactiver, supprimer chaque ligne.`}
      />
      <p className="mb-4 rounded-lg bg-alerte-50 px-3 py-2 text-sm text-alerte-600">
        Ici, vous passez outre les écrans des modules. Les écritures comptables et les pièces numérotées figées restent en lecture seule : elles se
        corrigent dans leur module. Chaque changement est inscrit au journal d&apos;activité.
      </p>
      <FormulaireRecherche chemin="/donnees" valeur={q} placeholder="Chercher une table : bons, salariés, véhicules…" />
      {groupes.length === 0 ? (
        <EtatVide titre="Aucune table ne répond" message="Essayez un autre mot." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groupes.map((g) => (
            <section key={g.libelle} className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-3">
              <h2 className="mb-2 text-sm font-semibold">{g.libelle}</h2>
              <ul className="space-y-0.5">
                {g.tables.map((nom) => {
                  const c = comptes.get(nom);
                  return (
                    <li key={nom}>
                      <Link href={`/donnees/${nom}`} className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[var(--surface-creuse)]">
                        <span className="min-w-0 truncate">{CATALOGUE.get(nom)?.libelle ?? nom}</span>
                        <span className="chiffres shrink-0 text-xs text-[var(--encre-faible)]">
                          {fmtEntier(c?.actives ?? 0)}
                          {c && c.corbeille > 0 ? ` · ${fmtEntier(c.corbeille)} à la corbeille` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
