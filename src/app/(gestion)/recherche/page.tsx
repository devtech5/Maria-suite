import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { modulesOuverts } from "@/lib/modules/garde";
import { groupesVisibles, relevDe } from "@/lib/navigation";
import { correspond, LONGUEUR_MAX_RECHERCHE, motsRecherche } from "@/lib/recherche";
import { rechercherPartout } from "@/modules/recherche/globale";

export const metadata: Metadata = { title: "Recherche" };

/** Écrans dont la visibilité se décide ligne à ligne : on y renvoie, recherche posée, sans rien lister ici. */
const AILLEURS = [
  { racine: "/documents", libelle: "Fichiers" },
  { racine: "/archives", libelle: "Archives" },
  { racine: "/taches", libelle: "Tâches" },
];

/**
 * Résultats de la recherche de la barre du haut : les écrans dont le nom
 * répond, puis les fiches, rangées par nature. Rien n'apparaît ici que la
 * navigation ne montrerait pas à la même session.
 */
export default async function PageRecherche({ searchParams }: PageProps<"/recherche">) {
  const session = await exigerEntreprise();
  const brut = (await searchParams).q;
  const q = (typeof brut === "string" ? brut : "").trim().slice(0, LONGUEUR_MAX_RECHERCHE);
  const mots = motsRecherche(q);

  const groupes = groupesVisibles(await droitsActifs(), modulesOuverts());
  const ouverts = groupes.flatMap((g) => g.modules);
  const visible = (racine: string) => ouverts.some((m) => relevDe(racine, m.racine));

  const ecrans = mots.length ? ouverts.filter((m) => correspond(q, [m.libelle, m.description])) : [];
  const fiches = await rechercherPartout(session.organizationId, q, mots, visible);
  const ailleurs = AILLEURS.filter((a) => visible(a.racine));
  const aucun = mots.length > 0 && ecrans.length === 0 && fiches.length === 0;

  return (
    <>
      <EnTetePage titre="Recherche" sousTitre={q ? `Résultats pour « ${q} »` : "Un nom, un numéro, un téléphone, une immatriculation…"} />

      <form role="search" method="get" action="/recherche" className="mb-6 flex max-w-xl gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus={!q}
          placeholder="Rechercher dans Maria Suite"
          aria-label="Rechercher dans Maria Suite"
          className="h-cible min-w-0 flex-1 rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3.5 text-sm outline-none focus:border-marque-500"
        />
        <button type="submit" className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
          Rechercher
        </button>
      </form>

      {aucun && <EtatVide titre="Rien trouvé" message="Essayez un autre mot, ou une partie seulement du nom ou du numéro." />}

      <div className="grid gap-5 lg:grid-cols-2">
        {ecrans.length > 0 && (
          <Section titre="Écrans">
            {ecrans.map((m) => (
              <Ligne key={m.href} href={m.href} titre={m.libelle} detail={m.description} />
            ))}
          </Section>
        )}
        {fiches.map((g) => (
          <Section key={g.cle} titre={g.libelle} tout={g.plus ? g.hrefTout : undefined}>
            {g.trouvailles.map((t, i) => (
              <Ligne key={`${t.href}-${i}`} href={t.href} titre={t.titre} detail={t.detail} />
            ))}
          </Section>
        ))}
      </div>

      {mots.length > 0 && ailleurs.length > 0 && (
        <p className="mt-6 text-sm text-[var(--encre-faible)]">
          Chercher aussi dans{" "}
          {ailleurs.map((a, i) => (
            <span key={a.racine}>
              {i > 0 && (i === ailleurs.length - 1 ? " et " : ", ")}
              <Link href={`${a.racine}?q=${encodeURIComponent(q)}`} className="font-semibold text-marque-600 hover:underline">
                {a.libelle}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
    </>
  );
}

function Section({ titre, tout, children }: { titre: string; tout?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--filet)] px-4 py-2.5">
        <h2 className="text-sm font-semibold">{titre}</h2>
        {tout && (
          <Link href={tout} className="text-xs font-semibold text-marque-600 hover:underline">
            Tout voir
          </Link>
        )}
      </header>
      <ul className="divide-y divide-[var(--filet)]">{children}</ul>
    </section>
  );
}

function Ligne({ href, titre, detail }: { href: string; titre: string; detail: string | null }) {
  return (
    <li>
      <Link href={href} className="block px-4 py-2.5 hover:bg-[var(--surface-creuse)]">
        <span className="block text-sm font-medium">{titre}</span>
        {detail && <span className="block text-xs text-[var(--encre-faible)]">{detail}</span>}
      </Link>
    </li>
  );
}
