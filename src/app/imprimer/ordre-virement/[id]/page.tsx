import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { BoutonRetour } from "@/components/ui/bouton-retour";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtDateIso } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";
import { montantEnLettres } from "@/lib/lettres";
import { ordreVirement } from "@/modules/tresorerie/requetes-mouvements";

export const metadata: Metadata = { title: "Ordre de virement" };

/**
 * Ordre de virement au format A4, à signer et remettre à la banque.
 *
 * Le montant figure en chiffres et en lettres : la banque compare les deux et
 * rejette l'ordre s'ils divergent. Le numéro du mouvement sert de référence
 * pour retrouver l'opération au relevé.
 */
export default async function ImpressionOrdreVirement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await exigerEntreprise();
  if (!(await peut("tresorerie.consulter"))) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [ordre, identite] = await Promise.all([ordreVirement(session.organizationId, id), identiteEntreprise(session.organizationId)]);
  if (!ordre || !ordre.beneficiaire || ordre.compte.nature !== "banque") notFound();

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <BoutonRetour href="/tresorerie/mouvements" />
        <BoutonImprimer />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[10.5pt] leading-snug text-black shadow print:shadow-none">
        <EnTeteDocument identite={identite}>
          <p className="text-2xl font-bold uppercase tracking-wide">Ordre de virement</p>
          <p className="font-mono text-base">{ordre.numero}</p>
          <p>Date : {fmtDateIso(ordre.date)}</p>
        </EnTeteDocument>

        {ordre.statut === "annule" && (
          <p className="mt-4 rounded border-2 border-red-700 px-3 py-2 text-center font-bold uppercase text-red-700">Annulé — ne pas exécuter</p>
        )}

        <section className="mt-6 ml-auto w-[50%] rounded border border-black/20 p-3">
          <p className="text-[9pt] uppercase text-black/60">À l&apos;attention de</p>
          <p className="font-semibold">{ordre.compte.etablissement ?? "Monsieur le Directeur d'agence"}</p>
        </section>

        <p className="mt-6">Madame, Monsieur,</p>
        <p className="mt-2">
          Par le débit de notre compte ci-dessous, nous vous prions de bien vouloir exécuter le virement suivant :
        </p>

        <table className="mt-5 w-full border-collapse">
          <tbody className="[&_td]:border [&_td]:border-black/30 [&_td]:px-3 [&_td]:py-2 [&_td:first-child]:w-[38%] [&_td:first-child]:bg-black/[0.03] [&_td:first-child]:text-[9.5pt] [&_td:first-child]:uppercase [&_td:first-child]:text-black/70">
            <tr>
              <td>Compte à débiter</td>
              <td>
                <p className="font-semibold">{identite.nom}</p>
                <p className="font-mono">{ordre.compte.reference ?? "—"}</p>
              </td>
            </tr>
            <tr>
              <td>Bénéficiaire</td>
              <td>
                <p className="font-semibold">{ordre.beneficiaire.nom}</p>
                {ordre.beneficiaire.adresse && <p>{ordre.beneficiaire.adresse}</p>}
                {ordre.beneficiaire.ville && <p>{ordre.beneficiaire.ville}</p>}
              </td>
            </tr>
            <tr>
              <td>RIB du bénéficiaire</td>
              <td className="font-mono">{ordre.ribBeneficiaire ?? "………………………………………………………"}</td>
            </tr>
            <tr>
              <td>Montant en chiffres</td>
              <td className="font-mono text-base font-bold">{fmt(ordre.montant)} FCFA</td>
            </tr>
            <tr>
              <td>Montant en lettres</td>
              <td className="font-semibold">{montantEnLettres(ordre.montant)}</td>
            </tr>
            <tr>
              <td>Motif</td>
              <td>
                {ordre.libelle}
                <span className="block text-[9pt] text-black/60">Référence à rappeler : {ordre.numero}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-6">Veuillez agréer, Madame, Monsieur, l&apos;expression de nos salutations distinguées.</p>

        <section className="mt-10 grid grid-cols-2 gap-10">
          <div>
            <p className="text-[9pt] uppercase text-black/60">Fait à {identite.ville ?? "…………………"}, le {fmtDateIso(ordre.date)}</p>
          </div>
          <div className="text-center">
            <p className="text-[9pt] uppercase text-black/60">Signature et cachet</p>
            <div className="mt-2 h-[28mm] rounded border border-dashed border-black/30" />
          </div>
        </section>

        <PiedDocument identite={identite} />
      </article>
    </main>
  );
}
