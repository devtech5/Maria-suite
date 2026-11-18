import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { identiteEntreprise } from "@/lib/identite";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtDateIso, fmtTauxBp } from "@/lib/format";
import { formaterQuantite, type CodeUnite } from "@/lib/quantite";
import { montantHt } from "@/modules/achats/calcul";
import { articlesAchetables, commandeDetail } from "@/modules/achats/requetes";

import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { BoutonRetour } from "@/components/ui/bouton-retour";

export const metadata: Metadata = { title: "Bon de commande" };

/** Visas exigés avant l'envoi au fournisseur : la comptable, puis la PDG. */
const SIGNATAIRES = [
  { qui: "La Comptable", mention: "Nom, date et signature" },
  { qui: "La PDG", mention: "Nom, date, signature et cachet" },
] as const;

/** Bon de commande fournisseur au format A4, prêt à imprimer ou à envoyer en PDF. */
export default async function ImpressionCommande({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await exigerEntreprise();
  if (!(await peut("achats.consulter"))) notFound();
  const detail = await commandeDetail(session.organizationId, id);
  if (!detail) notFound();
  const { commande: c, lignes } = detail;

  const [identite, [fournisseur], articles] = await Promise.all([
    identiteEntreprise(session.organizationId),
    db.execute<{ adresse: string | null; ville: string | null; telephone: string | null; email: string | null; identifiant_fiscal: string | null }>(sql`
      select adresse, ville, telephone, email, identifiant_fiscal from tiers where id = ${c.fournisseurId} and organization_id = ${session.organizationId}`),
    articlesAchetables(session.organizationId),
  ]);
  const unites = new Map(articles.map((a) => [a.id, a.unite as CodeUnite]));

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <BoutonRetour href={`/achats/commandes/${id}`} />
        <BoutonImprimer />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[10.5pt] leading-snug text-black shadow print:shadow-none">
        <EnTeteDocument identite={identite}>
            <p className="text-2xl font-bold uppercase tracking-wide">Bon de commande</p>
            <p className="font-mono text-base">{c.numero}</p>
            <p>Date : {fmtDateIso(c.dateCommande)}</p>
            {c.livraisonPrevue && <p>Livraison souhaitée : {fmtDateIso(c.livraisonPrevue)}</p>}
            {c.depot && <p>Lieu de livraison : {c.depot}</p>}
        </EnTeteDocument>

        <section className="mt-5 ml-auto w-[45%] rounded border border-black/20 p-3">
          <p className="text-[9pt] uppercase text-black/60">Fournisseur</p>
          <p className="font-semibold">{c.fournisseurNom}</p>
          {c.contactNom && <p>À l&apos;attention de {c.contactNom}</p>}
          {fournisseur?.adresse && <p>{fournisseur.adresse}</p>}
          {fournisseur?.ville && <p>{fournisseur.ville}</p>}
          {fournisseur?.telephone && <p>Tél. {fournisseur.telephone}</p>}
          {fournisseur?.identifiant_fiscal && <p>{identite.referentiel.identifiantFiscal} : {fournisseur.identifiant_fiscal}</p>}
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-y border-black/40 text-left text-[9pt] uppercase">
              <th className="py-1.5">Désignation</th>
              <th className="py-1.5 text-right">Qté</th>
              <th className="py-1.5 text-right">PU HT</th>
              <th className="py-1.5 text-right">TVA</th>
              <th className="py-1.5 text-right">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-b border-black/10 align-top">
                <td className="py-1.5 pr-2">{l.designation}</td>
                <td className="py-1.5 text-right tabular-nums">{formaterQuantite(l.quantite, l.articleId ? (unites.get(l.articleId) ?? "piece") : "piece")}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(l.prixUnitaireHt)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtTauxBp(l.tauxTva)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(montantHt(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto w-[55%] space-y-0.5 tabular-nums">
          <div className="flex justify-between">
            <dt>Total HT</dt>
            <dd>{fmt(c.totalHt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>TVA</dt>
            <dd>{fmt(c.totalTva)}</dd>
          </div>
          <div className="flex justify-between border-t border-black/40 pt-1 text-base font-bold">
            <dt>Total TTC</dt>
            <dd>{fmt(c.totalTtc)} FCFA</dd>
          </div>
        </dl>

        {c.notes && <p className="mt-6 whitespace-pre-line">{c.notes}</p>}

        <section className="mt-8 grid grid-cols-2 gap-[6mm] [break-inside:avoid]" aria-label="Signatures">
          {SIGNATAIRES.map((s) => (
            <div key={s.qui} className="flex h-[32mm] flex-col border border-black/40 px-[3mm] py-[2mm]">
              <p className="font-bold">{s.qui}</p>
              <p className="text-[8pt] text-black/60">{s.mention}</p>
            </div>
          ))}
        </section>

        <p className="mt-8 text-[9pt] text-black/60">Merci d&apos;indiquer le numéro {c.numero} sur votre bordereau de livraison et sur votre facture.</p>
        {c.statut === "annulee" && <p className="mt-6 rounded border border-black/40 p-2 text-center font-semibold uppercase">Commande annulée</p>}
        <PiedDocument identite={identite} />
      </article>
    </main>
  );
}
