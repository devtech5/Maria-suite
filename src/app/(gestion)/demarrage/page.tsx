import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteIndicateur, EnTetePage } from "@/components/ui/primitives";
import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { REPRISE_OUVERTE } from "@/modules/reprise/calcul";
import { listerComptes } from "@/modules/tresorerie/requetes";

import { ChoixDate } from "./choix-date";
import { ImportFichier, SoldesTresorerie } from "./imports";

export const metadata: Metadata = { title: "Démarrage" };

/**
 * Démarrage : ce qu'une entreprise apporte en arrivant. Articles, clients et
 * fournisseurs avec leurs soldes, stock initial, soldes de trésorerie. Tout
 * part en contrepartie du 4711, que le comptable reclasse ensuite.
 */
export default async function PageDemarrage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!REPRISE_OUVERTE) notFound();
  if (!(await peut("organisation.reprise.importer"))) return <AccesRefuse droit="organisation.reprise.importer" />;
  const session = await exigerEntreprise();
  const { date: demandee } = await searchParams;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const date = typeof demandee === "string" && /^\d{4}-\d{2}-\d{2}$/.test(demandee) && demandee <= aujourdhui ? demandee : aujourdhui;

  const [comptes, [attente], repris] = await Promise.all([
    listerComptes(session.organizationId),
    db.execute<{ solde: string }>(sql`
      select coalesce(sum(l.credit - l.debit), 0) as solde from lignes_ecriture l
      where l.organization_id = ${session.organizationId} and l.compte = '4711'
    `),
    db.execute<{ piece: string }>(sql`
      select piece_numero as piece from ecritures where organization_id = ${session.organizationId} and origine = 'reprise' and piece_numero like 'OUV-%'
    `),
  ]);
  const dejaRepris = new Set(repris.map((r) => r.piece));
  const situation = Number(attente?.solde ?? 0);

  return (
    <>
      <EnTetePage titre="Démarrage" sousTitre="Reprendre l'existant : articles, clients, fournisseurs, stock et soldes antérieurs" actions={<ChoixDate date={date} max={aujourdhui} />} />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3">
        <CarteIndicateur
          libelle="Situation nette reprise (4711)"
          valeur={fmt(situation)}
          unite="FCFA"
          ton={situation < 0 ? "danger" : "neutre"}
          precision="Créances, stock et trésorerie, moins les dettes. À reclasser par le comptable."
        />
        <CarteIndicateur libelle="Date de reprise" valeur={date.split("-").reverse().join("/")} precision="Les soldes repris sont datés de ce jour." />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ImportFichier
          nature="articles"
          titre="1. Articles"
          aide="Référence, désignation, prix de vente et d'achat, TVA. Une référence déjà présente est laissée telle quelle."
        />
        <ImportFichier
          nature="tiers"
          date={date}
          titre="2. Clients et fournisseurs, avec leurs soldes"
          aide="Le solde d'un client devient une facture de reprise à encaisser ; celui d'un fournisseur, une dette à régler. Les deux entrent dans les relances et le plan de trésorerie."
        />
        <ImportFichier
          nature="stock"
          date={date}
          titre="3. Stock initial"
          aide="Référence, dépôt, quantité et coût unitaire (vide : prix d'achat de la fiche). Importez d'abord les articles."
        />
        <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
          <h2 className="mb-2 font-semibold">4. Soldes de trésorerie</h2>
          <p className="mb-3 text-sm text-[var(--encre-douce)]">Ce qu&apos;il y a en caisse, en banque et sur les comptes mobile money au jour de la reprise. Une seule fois par compte.</p>
          <SoldesTresorerie
            date={date}
            comptes={comptes.filter((c) => c.actif).map((c) => ({ id: c.id, nom: c.nom, nature: c.nature, repris: dejaRepris.has(`OUV-${c.compte}`) }))}
          />
        </section>
      </div>

      <p className="mt-4 max-w-[75ch] text-xs text-[var(--encre-faible)]">
        Un fichier est importé en entier ou pas du tout : la moindre ligne à corriger le refuse, et la liste dit laquelle. Enregistrez le fichier Excel au format
        « CSV (séparateur : point-virgule) ». Les montants sont en francs entiers.
      </p>
    </>
  );
}
