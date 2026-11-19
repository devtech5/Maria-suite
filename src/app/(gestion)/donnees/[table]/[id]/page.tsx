import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmtEntier } from "@/lib/format";
import { CATALOGUE, tableDecrite } from "@/modules/donnees/catalogue";
import { accesColonne, colonnesResume, desactivable, libelle, refusSuppressionDefinitive, supprimable, verrouLigne } from "@/modules/donnees/regles";
import { lireLigne, referencesVers } from "@/modules/donnees/requetes";

import { ChampColonne, texteValeur, ValeurAffichee } from "../../affichage";
import { GestesLigne } from "./gestes";

export const metadata: Metadata = { title: "Données" };

const TABLES_CONNUES = new Set(CATALOGUE.keys());

/** Une ligne : tous ses champs, ce qui la désigne, et les gestes permis. */
export default async function PageLigne({ params }: PageProps<"/donnees/[table]/[id]">) {
  const session = await exigerEntreprise();
  if (!session.estProprietaire) {
    return <EtatVide titre="Réservé au propriétaire" message="La console des données ne s'ouvre qu'au propriétaire de l'entreprise." />;
  }
  const { table, id: brut } = await params;
  const t = tableDecrite(table);
  if (!t || !t.cle) notFound();
  const id = decodeURIComponent(brut);
  const [ligne, references] = await Promise.all([lireLigne(t, session.organizationId, id), referencesVers(t, session.organizationId, id)]);
  if (!ligne) notFound();

  const verrou = verrouLigne(t, ligne);
  const aLaCorbeille = typeof ligne.deleted_at === "string";
  const modifiables = t.colonnes.filter((c) => accesColonne(t.nom, c) === "modifiable");
  const totalReferences = references.reduce((s, r) => s + r.nombre, 0);
  const resume = colonnesResume(t).filter((c) => c.nom !== "created_at");
  const titre = resume.length > 0 ? texteValeur(resume[0], ligne[resume[0].nom] ?? null, 80) : id;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/donnees" className="text-[var(--encre-faible)] hover:underline">
          Données
        </Link>
        <span className="text-[var(--encre-faible)]"> › </span>
        <Link href={`/donnees/${t.nom}${aLaCorbeille ? "?corbeille=1" : ""}`} className="text-[var(--encre-faible)] hover:underline">
          {t.libelle}
        </Link>
      </p>
      <EnTetePage titre={titre} sousTitre={`${t.libelle} · ${t.groupe}`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {aLaCorbeille && <Pastille ton="danger">À la corbeille</Pastille>}
        {ligne.actif === false && <Pastille ton="neutre">Désactivée</Pastille>}
        {verrou && <Pastille ton="alerte">Lecture seule</Pastille>}
      </div>
      {verrou && <p className="mb-4 rounded-lg bg-alerte-50 px-3 py-2 text-sm text-alerte-600">{verrou}</p>}

      <GestesLigne
        table={t.nom}
        id={id}
        titre={titre}
        modifiable={!verrou && modifiables.length > 0}
        actif={desactivable(t) && !verrou ? ligne.actif === true : null}
        aLaCorbeille={aLaCorbeille}
        supprimable={supprimable(t) && !verrou}
        refusEffacement={aLaCorbeille ? refusSuppressionDefinitive(t, ligne, totalReferences) : null}
        champs={
          <div className="grid gap-3 sm:grid-cols-2">
            {modifiables.map((c) => (
              <ChampColonne key={c.nom} colonne={c} valeur={ligne[c.nom] ?? null} />
            ))}
          </div>
        }
      />

      <dl className="mt-5 divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
        {t.colonnes.map((c) => {
          const acces = accesColonne(t.nom, c);
          return (
            <div key={c.nom} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="text-sm text-[var(--encre-faible)]">
                {libelle(c.nom)}
                {acces === "lecture" && <span className="ml-1 text-xs">· lecture seule</span>}
              </dt>
              <dd className="min-w-0 text-sm">
                {acces === "masquee" ? <span className="text-[var(--encre-faible)]">Secret, jamais affiché</span> : <ValeurAffichee colonne={c} valeur={ligne[c.nom] ?? null} tablesConnues={TABLES_CONNUES} />}
              </dd>
            </div>
          );
        })}
      </dl>

      <section className="mt-5">
        <h2 className="mb-2 text-base font-semibold">Utilisée par</h2>
        {references.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucune autre ligne ne désigne celle-ci.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {references.map((r) => (
              <li key={`${r.table}.${r.colonne}`}>
                <Link href={`/donnees/${r.table}?filtre=${r.colonne}:${encodeURIComponent(id)}`} className="text-marque-600 hover:underline">
                  {fmtEntier(r.nombre)} ligne{r.nombre > 1 ? "s" : ""} de « {CATALOGUE.get(r.table)?.libelle ?? r.table} »
                </Link>
                <span className="text-[var(--encre-faible)]"> ({libelle(r.colonne).toLocaleLowerCase("fr-FR")})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
