import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { identiteEntreprise } from "@/lib/identite";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { echeanceDeclarations, libelleMois } from "@/modules/paie/calcul";
import { bulletinsPaie, periodesPaie } from "@/modules/paie/schema";

export const metadata: Metadata = { title: "État des cotisations" };

/**
 * État mensuel des cotisations CNPS et de l'impôt retenu, collaborateur par collaborateur :
 * la pièce qui accompagne la déclaration et que l'on recoupe avec le versement.
 */
export default async function ImpressionDeclarations({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await exigerEntreprise();
  if (!(await peut("personnes.consulter"))) notFound();
  const [periode] = await db.select().from(periodesPaie).where(and(eq(periodesPaie.id, id), eq(periodesPaie.organizationId, session.organizationId)));
  if (!periode || periode.statut !== "validee") notFound();
  const bulletins = await db.select().from(bulletinsPaie).where(eq(bulletinsPaie.periodeId, id)).orderBy(asc(bulletinsPaie.matricule));
  const identite = await identiteEntreprise(session.organizationId);
  const s = (f: (b: (typeof bulletins)[number]) => number) => bulletins.reduce((t, b) => t + f(b), 0);

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] justify-end px-4 print:hidden">
        <BoutonImprimer />
      </div>
      <article className="mx-auto max-w-[297mm] bg-white px-[10mm] py-[10mm] text-[9.5pt] leading-snug text-black shadow print:shadow-none">
        <EnTeteDocument identite={identite}>
            <p className="text-lg font-bold uppercase">État des cotisations et de l&apos;impôt retenu</p>
            <p>{libelleMois(periode.mois)} — à verser avant le {new Date(`${echeanceDeclarations(periode.mois)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</p>
        </EnTeteDocument>
        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-y border-black/40 text-left text-[8pt] uppercase">
              <th className="py-1">Matricule</th>
              <th className="py-1">Collaborateur</th>
              <th className="py-1">N° CNPS</th>
              <th className="py-1 text-right">Brut</th>
              <th className="py-1 text-right">Retraite sal.</th>
              <th className="py-1 text-right">Retraite pat.</th>
              <th className="py-1 text-right">Prest. fam.</th>
              <th className="py-1 text-right">Acc. travail</th>
              <th className="py-1 text-right">Total CNPS</th>
              <th className="py-1 text-right">Impôt retenu</th>
            </tr>
          </thead>
          <tbody>
            {bulletins.map((b) => (
              <tr key={b.id} className="border-b border-black/10">
                <td className="py-1">{b.matricule}</td>
                <td className="py-1">{b.nom}</td>
                <td className="py-1">{b.numeroCnps ?? "—"}</td>
                <td className="py-1 text-right">{fmt(b.brut)}</td>
                <td className="py-1 text-right">{fmt(b.cnpsSalarie)}</td>
                <td className="py-1 text-right">{fmt(b.cnpsPatronal)}</td>
                <td className="py-1 text-right">{fmt(b.prestationsFamiliales)}</td>
                <td className="py-1 text-right">{fmt(b.accidentTravail)}</td>
                <td className="py-1 text-right font-semibold">{fmt(b.cnpsSalarie + b.cnpsPatronal + b.prestationsFamiliales + b.accidentTravail)}</td>
                <td className="py-1 text-right">{fmt(b.impot)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-black font-bold">
              <td className="py-1.5" colSpan={3}>Totaux — {bulletins.length} collaborateur{bulletins.length > 1 ? "s" : ""}</td>
              <td className="py-1.5 text-right">{fmt(s((b) => b.brut))}</td>
              <td className="py-1.5 text-right">{fmt(s((b) => b.cnpsSalarie))}</td>
              <td className="py-1.5 text-right">{fmt(s((b) => b.cnpsPatronal))}</td>
              <td className="py-1.5 text-right">{fmt(s((b) => b.prestationsFamiliales))}</td>
              <td className="py-1.5 text-right">{fmt(s((b) => b.accidentTravail))}</td>
              <td className="py-1.5 text-right">{fmt(periode.totalCnps)}</td>
              <td className="py-1.5 text-right">{fmt(periode.totalImpot)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-[8pt] text-black/60">
          Écriture de paie {periode.ecriture}. CNPS {periode.cnpsVerseeLe ? `versée (écriture ${periode.cnpsEcriture})` : "non versée"} · impôt{" "}
          {periode.impotVerseLe ? `versé (écriture ${periode.impotEcriture})` : "non versé"}. Taux appliqués : ceux du barème attesté à la validation.
        </p>
        <PiedDocument identite={identite} />
      </article>
    </main>
  );
}
