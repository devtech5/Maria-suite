import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { EnTeteDocument } from "@/components/impression/entete-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { calculerBilan, calculerSIG, elementsResultat, type PosteBilan } from "@/lib/comptabilite/etats";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtTauxBp } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";
import { soldesAuJour, soldesParCompte } from "@/modules/comptabilite/requetes";
import { affectationsResultat, exercicesClotures, impotsBenefices } from "@/modules/fiscalite/schema";

export const metadata: Metadata = { title: "États financiers annuels" };

const montant = (v: number) => (v === 0 ? "—" : v < 0 ? `(${fmt(-v)})` : fmt(v));
const dateFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function TableComparee({ titre, n, n1, exercice, total }: { titre: string; n: PosteBilan[]; n1: PosteBilan[]; exercice: string; total?: [number, number] }) {
  const precedent = new Map(n1.map((p) => [p.code, p.montant]));
  const lignes = n.filter((p) => p.montant !== 0 || (precedent.get(p.code) ?? 0) !== 0);
  return (
    <table className="w-full border-collapse tabular-nums">
      <thead>
        <tr className="border-y border-black/40 text-left text-[8pt] uppercase">
          <th className="w-10 py-1">Réf.</th>
          <th className="py-1">{titre}</th>
          <th className="py-1 text-right">{exercice}</th>
          <th className="py-1 text-right">{Number(exercice) - 1}</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((p) => (
          <tr key={p.code} className="border-b border-black/10">
            <td className="py-1">{p.code}</td>
            <td className="py-1">{p.libelle}</td>
            <td className="py-1 text-right">{montant(p.montant)}</td>
            <td className="py-1 text-right">{montant(precedent.get(p.code) ?? 0)}</td>
          </tr>
        ))}
        {total && (
          <tr className="border-t-2 border-black font-bold">
            <td />
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right">{fmt(total[0])}</td>
            <td className="py-1.5 text-right">{fmt(total[1])}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/**
 * Liasse annuelle de l'exercice, telle que la comptabilité la donne : bilan
 * et compte de résultat comparés à l'exercice précédent, détermination de
 * l'impôt, affectation du résultat. C'est la matière de la DSF, à reporter
 * sur le formulaire officiel de la DGI.
 */
export default async function ImpressionDsf({ params }: { params: Promise<{ exercice: string }> }) {
  const { exercice } = await params;
  if (!/^\d{4}$/.test(exercice)) notFound();
  const session = await exigerEntreprise();
  if (!(await peut("comptabilite.ecriture.consulter"))) notFound();
  const org = session.organizationId;
  const precedent = String(Number(exercice) - 1);

  const [identite, bilanN, bilanN1, resultatN, resultatN1, [cloture], [impot], [affectation]] = await Promise.all([
    identiteEntreprise(org),
    soldesAuJour(org, `${exercice}-12-31`),
    soldesAuJour(org, `${precedent}-12-31`),
    soldesParCompte(org, exercice),
    soldesParCompte(org, precedent),
    db.select().from(exercicesClotures).where(and(eq(exercicesClotures.organizationId, org), eq(exercicesClotures.exercice, exercice))),
    db.select().from(impotsBenefices).where(and(eq(impotsBenefices.organizationId, org), eq(impotsBenefices.exercice, exercice))),
    db.select().from(affectationsResultat).where(and(eq(affectationsResultat.organizationId, org), eq(affectationsResultat.exercice, exercice))),
  ]);
  if (bilanN.length === 0 && resultatN.length === 0) notFound();

  const b = calculerBilan(bilanN);
  const b1 = calculerBilan(bilanN1);
  const sig = calculerSIG(elementsResultat(resultatN)).map((s) => ({ code: s.code, libelle: s.libelle, montant: s.montant }));
  const sig1 = calculerSIG(elementsResultat(resultatN1)).map((s) => ({ code: s.code, libelle: s.libelle, montant: s.montant }));

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <BoutonImprimer />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[12mm] py-[12mm] text-[9.5pt] leading-snug text-black shadow print:shadow-none">
        <EnTeteDocument identite={identite}>
          <p className="text-lg font-bold uppercase">États financiers annuels</p>
          <p>Exercice du 01/01/{exercice} au 31/12/{exercice} — SYSCOHADA</p>
          <p className={cloture ? "" : "font-bold"}>{cloture ? `Exercice clôturé · ${cloture.ecriture}` : "PROVISOIRE — exercice non clôturé"}</p>
        </EnTeteDocument>

        <h2 className="mt-4 text-sm font-bold uppercase">Bilan au 31/12/{exercice}</h2>
        <div className="mt-2 grid gap-4">
          <TableComparee titre="Actif" n={b.actif} n1={b1.actif} exercice={exercice} total={[b.totalActif, b1.totalActif]} />
          <TableComparee titre="Passif" n={b.passif} n1={b1.passif} exercice={exercice} total={[b.totalPassif, b1.totalPassif]} />
        </div>
        {b.totalActif !== b.totalPassif && <p className="mt-1 font-bold">Écart actif-passif : {fmt(b.totalActif - b.totalPassif)} — un compte hors des classes 1 à 8 a été mouvementé.</p>}

        <h2 className="mt-6 text-sm font-bold uppercase [break-before:page]">Compte de résultat</h2>
        <div className="mt-2">
          <TableComparee titre="Rubrique" n={sig} n1={sig1} exercice={exercice} />
        </div>

        <h2 className="mt-6 text-sm font-bold uppercase">Détermination de l&apos;impôt sur les bénéfices</h2>
        {impot ? (
          <table className="mt-2 w-full border-collapse tabular-nums">
            <tbody>
              {(
                [
                  ["Résultat comptable avant impôt", impot.resultatComptable],
                  ["Réintégrations", impot.reintegrations],
                  ["Déductions", -impot.deductions],
                  ["Résultat fiscal", impot.resultatFiscal],
                  [`Impôt au taux de ${fmtTauxBp(impot.regleAppliquee.tauxBp)}`, impot.impotTheorique],
                  [`Minimum forfaitaire (${fmtTauxBp(impot.regleAppliquee.imfTauxBp)} de ${fmt(impot.chiffreAffaires)} F)`, impot.imf],
                  ["Impôt dû", impot.impotDu],
                ] as [string, number][]
              ).map(([libelle, v]) => (
                <tr key={libelle} className={`border-b border-black/10 ${libelle === "Impôt dû" || libelle === "Résultat fiscal" ? "font-semibold" : ""}`}>
                  <td className="py-1">{libelle}</td>
                  <td className="py-1 text-right">{montant(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2">Impôt non constaté.</p>
        )}

        <h2 className="mt-6 text-sm font-bold uppercase">Affectation du résultat</h2>
        {affectation ? (
          <table className="mt-2 w-full border-collapse tabular-nums">
            <tbody>
              {(
                [
                  [affectation.resultat >= 0 ? "Bénéfice de l'exercice" : "Perte de l'exercice", affectation.resultat],
                  ["Réserve légale", affectation.reserveLegale],
                  [affectation.resultat >= 0 ? "Autres réserves" : "Imputé sur les réserves", affectation.autresReserves],
                  ["Dividendes", affectation.dividendes],
                  ["Report à nouveau", affectation.reportANouveau],
                ] as [string, number][]
              )
                .filter(([, v], i) => i === 0 || v !== 0)
                .map(([libelle, v]) => (
                  <tr key={libelle} className="border-b border-black/10">
                    <td className="py-1">{libelle}</td>
                    <td className="py-1 text-right">{montant(v)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2">{cloture ? "Affectation non encore décidée." : "L'exercice n'est pas clôturé."}</p>
        )}
        {affectation && <p className="mt-1">Décision du {dateFr(String(affectation.dateDecision).slice(0, 10))} · écriture {affectation.ecriture}.</p>}

        <p className="mt-8 text-[8pt] text-black/70">
          Document établi depuis la comptabilité de l&apos;entreprise, soldes cumulés jusqu&apos;au 31 décembre. La déclaration statistique et fiscale se
          dépose auprès de la DGI sur sa liasse officielle : reportez-y ces montants, ligne à ligne, sur le formulaire en vigueur. Le tableau des flux de
          trésorerie et les notes annexes ne sont pas produits ici.
        </p>
      </article>
    </main>
  );
}
