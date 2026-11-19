import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EnTetePage, EtatVide, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmtEntier } from "@/lib/format";
import { tableDecrite } from "@/modules/donnees/catalogue";
import { colonnesResume, libelle, supprimable } from "@/modules/donnees/regles";
import { compterTables, listerLignes, PAR_PAGE } from "@/modules/donnees/requetes";

import { texteValeur } from "../affichage";
import { FormulaireRecherche } from "../recherche";

export const metadata: Metadata = { title: "Données" };

const ONGLET = "rounded-lg px-3 py-1.5 text-sm font-semibold";

/** Les lignes d'une table, les plus récentes d'abord ; la corbeille à part. */
export default async function PageTable({ params, searchParams }: PageProps<"/donnees/[table]">) {
  const session = await exigerEntreprise();
  if (!session.estProprietaire) {
    return <EtatVide titre="Réservé au propriétaire" message="La console des données ne s'ouvre qu'au propriétaire de l'entreprise." />;
  }
  const t = tableDecrite((await params).table);
  if (!t) notFound();
  const recherche = await searchParams;
  const q = String(recherche.q ?? "").trim();
  const corbeille = recherche.corbeille === "1";
  const page = Math.max(0, Number.parseInt(String(recherche.page ?? "0"), 10) || 0);
  const [colonneFiltre, valeurFiltre] = String(recherche.filtre ?? "").split(":");
  const filtre = colonneFiltre && valeurFiltre ? { colonne: colonneFiltre, valeur: valeurFiltre } : null;

  const [resultat, comptes] = await Promise.all([
    listerLignes(t, session.organizationId, { q, page, corbeille, filtre }),
    compterTables(session.organizationId),
  ]);
  const compte = comptes.get(t.nom) ?? { actives: 0, corbeille: 0 };
  const colonnes = colonnesResume(t);

  const lien = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = { q: q || null, corbeille: corbeille ? "1" : null, filtre: filtre ? `${filtre.colonne}:${filtre.valeur}` : null, page: null };
    for (const [k, v] of Object.entries({ ...base, ...changes })) if (v) p.set(k, v);
    const s = p.toString();
    return `/donnees/${t.nom}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/donnees" className="text-[var(--encre-faible)] hover:underline">
          Données
        </Link>
        <span className="text-[var(--encre-faible)]"> › {t.groupe}</span>
      </p>
      <EnTetePage titre={t.libelle} sousTitre={`Table ${t.nom} · ${fmtEntier(compte.actives)} ligne${compte.actives > 1 ? "s" : ""}`} />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href={lien({ corbeille: null })} className={`${ONGLET} ${corbeille ? "hover:bg-[var(--surface-creuse)]" : "bg-nuit-profond text-white"}`}>
          Lignes ({fmtEntier(compte.actives)})
        </Link>
        {supprimable(t) && (
          <Link href={lien({ corbeille: "1" })} className={`${ONGLET} ${corbeille ? "bg-nuit-profond text-white" : "hover:bg-[var(--surface-creuse)]"}`}>
            Corbeille ({fmtEntier(compte.corbeille)})
          </Link>
        )}
        {filtre && (
          <Link href={lien({ filtre: null })} className="ml-2 rounded-full bg-marque-50 px-3 py-1 text-xs font-semibold text-marque-700 hover:underline">
            {libelle(filtre.colonne)} = {filtre.valeur.slice(0, 8)}… ✕
          </Link>
        )}
      </div>

      <FormulaireRecherche
        chemin={`/donnees/${t.nom}`}
        valeur={q}
        placeholder="Chercher dans le texte des lignes…"
        caches={{ ...(corbeille ? { corbeille: "1" } : {}), ...(filtre ? { filtre: `${filtre.colonne}:${filtre.valeur}` } : {}) }}
      />

      {resultat.lignes.length === 0 ? (
        <EtatVide titre={corbeille ? "La corbeille est vide" : "Aucune ligne"} message={q ? "Aucune ligne ne contient ce texte." : "Cette table n'a rien à montrer ici."} />
      ) : (
        <Tableau>
          <thead>
            <tr>
              {colonnes.map((c) => (
                <Th key={c.nom}>{libelle(c.nom)}</Th>
              ))}
              <Th aligne="droite"> </Th>
            </tr>
          </thead>
          <tbody>
            {resultat.lignes.map((l, i) => {
              const cle = t.cle ? String(l[t.cle]) : null;
              return (
                <tr key={cle ?? i}>
                  {colonnes.map((c, j) => (
                    <Td key={c.nom} fort={j === 0} chiffres={c.genre === "entier" || c.genre === "date" || c.genre === "horodatage"}>
                      {texteValeur(c, l[c.nom] ?? null, 60)}
                    </Td>
                  ))}
                  <Td aligne="droite">
                    {cle && (
                      <Link href={`/donnees/${t.nom}/${encodeURIComponent(cle)}`} className="whitespace-nowrap text-sm font-semibold text-marque-600 hover:underline">
                        Ouvrir
                      </Link>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tableau>
      )}

      {(page > 0 || resultat.suite) && (
        <div className="mt-3 flex items-center justify-between text-sm">
          {page > 0 ? (
            <Link href={lien({ page: page > 1 ? String(page - 1) : null })} className="font-semibold text-marque-600 hover:underline">
              ← Plus récentes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--encre-faible)]">
            Lignes {fmtEntier(page * PAR_PAGE + 1)} à {fmtEntier(page * PAR_PAGE + resultat.lignes.length)}
          </span>
          {resultat.suite ? (
            <Link href={lien({ page: String(page + 1) })} className="font-semibold text-marque-600 hover:underline">
              Plus anciennes →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
