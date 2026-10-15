import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage, EtatVide, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { calculerBilan, calculerSIG, elementsResultat, type PosteBilan } from "@/lib/comptabilite/etats";
import { fmt, fmtEntier } from "@/lib/format";
import { exercicesEcrits, soldesAuJour, soldesParCompte } from "@/modules/comptabilite/requetes";

export const metadata: Metadata = { title: "États financiers" };

/** Les huit classes du plan SYSCOHADA. */
const CLASSES = [
  { numero: "1", intitule: "Ressources durables" },
  { numero: "2", intitule: "Actif immobilisé" },
  { numero: "3", intitule: "Stocks" },
  { numero: "4", intitule: "Tiers" },
  { numero: "5", intitule: "Trésorerie" },
  { numero: "6", intitule: "Charges" },
  { numero: "7", intitule: "Produits" },
  { numero: "8", intitule: "Autres charges et produits" },
];

const dateFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Une colonne du bilan : postes non nuls, puis le total. */
function ColonneBilan({ titre, postes, total }: { titre: string; postes: PosteBilan[]; total: number }) {
  return (
    <div>
      <h3 className="border-b border-[var(--filet)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--encre-faible)]">{titre}</h3>
      <table className="w-full text-sm">
        <tbody>
          {postes
            .filter((p) => p.montant !== 0)
            .map((p) => (
              <tr key={p.code} className="border-b border-[var(--filet)]">
                <td className="chiffres w-10 py-2 pl-4 text-xs text-[var(--encre-faible)]">{p.code}</td>
                <td className="py-2 pr-3 text-[var(--encre-douce)]">{p.libelle}</td>
                <td className={`chiffres py-2 pr-4 text-right ${p.montant < 0 ? "text-danger-600" : ""}`}>{p.montant < 0 ? `(${fmt(-p.montant)})` : fmt(p.montant)}</td>
              </tr>
            ))}
          <tr className="bg-[var(--surface-creuse)] font-semibold">
            <td />
            <td className="py-2.5 pr-3">Total</td>
            <td className="chiffres py-2.5 pr-4 text-right">{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function PageEtats({ searchParams }: { searchParams: Promise<{ exercice?: string }> }) {
  const session = await exigerEntreprise();

  const exercices = await exercicesEcrits(session.organizationId);
  const demande = (await searchParams).exercice;
  const exercice = demande && exercices.includes(demande) ? demande : (exercices[0] ?? String(new Date().getFullYear()));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  // Exercice terminé : le bilan au 31 décembre. En cours : la situation du jour.
  const dateBilan = `${exercice}-12-31` < aujourdhui ? `${exercice}-12-31` : aujourdhui;
  const [soldes, cumules] = await Promise.all([soldesParCompte(session.organizationId, exercice), soldesAuJour(session.organizationId, dateBilan)]);
  const bilan = calculerBilan(cumules);
  const ecartBilan = bilan.totalActif - bilan.totalPassif;

  if (soldes.length === 0) {
    return (
      <>
        <EnTetePage titre="États financiers" sousTitre={`Exercice ${exercice}`} />
        <EtatVide
          titre="Rien à présenter pour cet exercice"
          message="Le compte de résultat est la conséquence des écritures, pas un document à remplir. Il apparaîtra dès la première vente encaissée."
        />
      </>
    );
  }

  const sig = calculerSIG(elementsResultat(soldes));

  const parClasse = CLASSES.map((classe) => {
    const comptes = soldes.filter((s) => s.compte.startsWith(classe.numero));
    return {
      ...classe,
      comptes: comptes.length,
      solde: comptes.reduce((somme, s) => somme + (s.debit - s.credit), 0),
    };
  }).filter((classe) => classe.comptes > 0);

  return (
    <>
      <EnTetePage
        titre="États financiers"
        sousTitre={`Compte de résultat et bilan SYSCOHADA · exercice ${exercice}`}
        actions={
          <a
            href={`/imprimer/dsf/${exercice}`}
            target="_blank"
            rel="noopener"
            className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]"
          >
            Liasse annuelle (DSF)
          </a>
        }
      />

      {exercices.length > 1 && (
        <nav aria-label="Exercices" className="mb-4 flex gap-1.5 overflow-x-auto pb-0.5">
          {exercices.map((e) => (
            <Link
              key={e}
              href={`/comptabilite/etats?exercice=${e}`}
              aria-current={e === exercice ? "page" : undefined}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${e === exercice ? "bg-marque-600 text-white" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"}`}
            >
              {e}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <section className="overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          <header className="border-b border-[var(--filet)] px-4 py-3">
            <h2 className="text-sm font-semibold">Soldes intermédiaires de gestion</h2>
            <p className="text-xs text-[var(--encre-faible)]">
              Chaque solde découle du précédent
            </p>
          </header>

          <table className="w-full text-sm">
            <tbody>
              {sig.map((solde) => (
                <tr
                  key={solde.code}
                  className={`border-b border-[var(--filet)] last:border-b-0 ${
                    solde.cle ? "bg-[var(--surface-creuse)]" : ""
                  }`}
                >
                  <td className="chiffres w-12 py-2.5 pl-4 text-xs text-[var(--encre-faible)]">
                    {solde.code}
                  </td>
                  <td
                    className={`py-2.5 pr-3 ${solde.cle ? "font-semibold" : "text-[var(--encre-douce)]"}`}
                  >
                    {solde.libelle}
                  </td>
                  <td
                    className={`chiffres py-2.5 pr-4 text-right ${
                      solde.cle ? "text-base font-bold" : ""
                    } ${solde.montant < 0 && !solde.cle ? "text-[var(--encre-faible)]" : ""} ${
                      solde.cle && solde.montant < 0 ? "text-danger-600" : ""
                    }`}
                  >
                    {solde.montant < 0
                      ? `(${fmt(Math.abs(solde.montant))})`
                      : fmt(solde.montant)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
            <h2 className="mb-2.5 text-sm font-semibold">Comptes mouvementés</h2>
            <ul className="space-y-1.5 text-sm">
              {parClasse.map((classe) => (
                <li key={classe.numero} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[var(--encre-douce)]">
                    <span className="chiffres mr-1.5 text-xs text-[var(--encre-faible)]">
                      {classe.numero}
                    </span>
                    {classe.intitule}
                  </span>
                  <span className="chiffres shrink-0 text-xs text-[var(--encre-faible)]">
                    {classe.comptes}
                  </span>
                </li>
              ))}
            </ul>
            <p className="chiffres mt-3 border-t border-[var(--filet)] pt-2.5 text-sm font-semibold">
              {fmtEntier(soldes.length)} comptes
            </p>
          </section>

          <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
            <h2 className="mb-2 text-sm font-semibold">Ce qui manque encore</h2>
            {/* Annoncer ce qui n'existe pas vaut mieux que de le faire croire. */}
            <ul className="space-y-1.5 text-sm text-[var(--encre-douce)]">
              <li>Tableau des flux de trésorerie</li>
              <li>Notes annexes</li>
            </ul>
          </section>
        </aside>
      </div>

      {/* ------------------------------------------------------------ bilan */}
      <section className="mt-6 overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--filet)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Bilan au {dateFr(dateBilan)}</h2>
            <p className="text-xs text-[var(--encre-faible)]">
              Soldes cumulés depuis la première écriture : la situation d&apos;ouverture d&apos;un exercice est le bilan de la veille.{" "}
              <Link href={`/rapports/balance-ouverture?au=${exercice}-12-31`} className="font-semibold text-marque-600 hover:underline">
                À-nouveaux {exercice}
              </Link>
            </p>
          </div>
          {bilan.resultatEnInstance !== 0 && (
            <p className="text-xs text-[var(--encre-faible)]">
              Dont résultat non clôturé : <span className="chiffres font-semibold">{fmt(bilan.resultatEnInstance)}</span>
            </p>
          )}
        </header>
        <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--filet)]">
          <ColonneBilan titre="Actif" postes={bilan.actif} total={bilan.totalActif} />
          <ColonneBilan titre="Passif" postes={bilan.passif} total={bilan.totalPassif} />
        </div>
        {ecartBilan !== 0 && (
          <p className="border-t border-[var(--filet)] bg-danger-50 px-4 py-2 text-sm text-danger-600">
            Le bilan ne tombe pas juste ({fmt(ecartBilan)}) : un compte hors des classes 1 à 8 a été mouvementé. Vérifiez la balance générale.
          </p>
        )}
      </section>

      {/* ------------------------------------------------- balance générale */}
      <section className="mt-6">
        <h2 className="mb-2.5 text-base font-semibold">Balance générale</h2>
        <p className="mb-3 text-sm text-[var(--encre-douce)]">
          Tous les comptes mouvementés de l&apos;exercice. C&apos;est l&apos;état
          que réclame un expert-comptable, et celui qui permet de rattacher
          chaque solde aux pièces qui l&apos;ont produit.
        </p>

        <Tableau>
          <thead>
            <tr>
              <Th>Compte</Th>
              <Th>Intitulé</Th>
              <Th aligne="droite">Débit</Th>
              <Th aligne="droite">Crédit</Th>
              <Th aligne="droite">Solde</Th>
            </tr>
          </thead>
          <tbody>
            {soldes.map((solde) => {
              const net = solde.debit - solde.credit;

              return (
                <tr key={solde.compte}>
                  <Td chiffres fort>
                    {solde.compte}
                  </Td>
                  <Td>{solde.libelle}</Td>
                  <Td aligne="droite" chiffres>
                    {solde.debit === 0 ? "—" : fmt(solde.debit)}
                  </Td>
                  <Td aligne="droite" chiffres>
                    {solde.credit === 0 ? "—" : fmt(solde.credit)}
                  </Td>
                  <Td aligne="droite" chiffres fort>
                    {net < 0 ? `(${fmt(Math.abs(net))})` : fmt(net)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tableau>
      </section>
    </>
  );
}
