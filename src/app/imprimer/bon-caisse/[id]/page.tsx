import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { BoutonRetour } from "@/components/ui/bouton-retour";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";
import { montantEnLettres } from "@/lib/lettres";
import { NATURES_BON } from "@/modules/tresorerie/calcul";
import { bonCaisse, type BonVue } from "@/modules/tresorerie/requetes";

export const metadata: Metadata = { title: "Bon de caisse" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Abidjan vit à UTC toute l'année : l'heure affichée est celle du bureau. */
const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

const STATUT: Record<BonVue["statut"], string> = {
  demande: "À approuver",
  approuve: "Approuvé, à décaisser",
  rejete: "Refusé",
  decaisse: "Décaissé",
  annule: "Annulé",
};

/** Le bénéficiaire reconnaît avoir reçu la somme ; la comptable et la PDG visent la dépense. */
const SIGNATAIRES = [
  { qui: "Le bénéficiaire", mention: "« Reçu la somme ci-dessus », date et signature" },
  { qui: "La Comptable", mention: "Nom, date et signature" },
  { qui: "La PDG", mention: "Nom, date, signature et cachet" },
] as const;

/**
 * Bon de caisse au format A4 : la pièce qui accompagne la sortie d'argent de
 * la petite caisse. Montant en chiffres et en lettres, circuit du bon
 * (demande, approbation, décaissement, écriture) et cases de visa.
 *
 * Même règle de lecture que l'écran Caisse de dépenses : qui ne voit pas
 * tous les bons ne peut ouvrir que les siens.
 */
export default async function ImpressionBonCaisse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const [consulter, approuver, demander] = await Promise.all([peut("tresorerie.consulter"), peut("tresorerie.bon.approuver"), peut("tresorerie.bon.demander")]);
  const voitTout = consulter || approuver;
  if (!voitTout && !demander) notFound();

  const [bon, identite] = await Promise.all([bonCaisse(session.organizationId, session.userId, voitTout, id), identiteEntreprise(session.organizationId)]);
  if (!bon) notFound();
  const nature = NATURES_BON[bon.nature];
  const nul = bon.statut === "annule" || bon.statut === "rejete";

  const lignes: { titre: string; valeur: string }[] = [
    { titre: "Caisse", valeur: bon.caisse },
    { titre: "Nature de la dépense", valeur: `${nature.libelle} — compte ${nature.compte}` },
    { titre: "Bénéficiaire", valeur: bon.beneficiaireQualite ? `${bon.beneficiaire} (${bon.beneficiaireQualite})` : bon.beneficiaire },
    { titre: "Motif", valeur: bon.motif },
    { titre: "Demandé par", valeur: `${bon.demandeur}, le ${MOMENT.format(bon.demandeLe)}` },
  ];
  if (bon.approbateur) {
    const decision = bon.statut === "rejete" ? "Refusé par" : "Approuvé par";
    lignes.push({ titre: decision, valeur: bon.approuveLe ? `${bon.approbateur}, le ${MOMENT.format(bon.approuveLe)}` : bon.approbateur });
  }
  if (bon.motifRejet) lignes.push({ titre: "Motif du refus", valeur: bon.motifRejet });
  if (bon.decaisseLe) lignes.push({ titre: "Décaissé le", valeur: MOMENT.format(bon.decaisseLe) });
  if (bon.ecriture) lignes.push({ titre: "Écriture comptable", valeur: bon.ecriture });

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <BoutonRetour href="/tresorerie/caisse" />
        <BoutonImprimer />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[10.5pt] leading-snug text-black shadow print:shadow-none">
        <EnTeteDocument identite={identite}>
          <p className="text-2xl font-bold uppercase tracking-wide">Bon de caisse</p>
          <p className="font-mono text-base">{bon.numero}</p>
          <p>Statut : {STATUT[bon.statut]}</p>
        </EnTeteDocument>

        {nul && (
          <p className="mt-4 rounded border-2 border-red-700 px-3 py-2 text-center font-bold uppercase text-red-700">
            {STATUT[bon.statut]} — aucune somme à remettre
          </p>
        )}

        <section className="mt-6 rounded border border-black/30 p-4 text-center">
          <p className="text-[9pt] uppercase text-black/60">Montant</p>
          <p className="text-2xl font-bold tabular-nums">{fmt(bon.montant)} FCFA</p>
          <p className="mt-1 italic">{montantEnLettres(bon.montant)}</p>
        </section>

        <table className="mt-5 w-full border-collapse">
          <tbody className="[&_td]:border [&_td]:border-black/30 [&_td]:px-3 [&_td]:py-2 [&_td:first-child]:w-[34%] [&_td:first-child]:bg-black/[0.03] [&_td:first-child]:text-[9.5pt] [&_td:first-child]:uppercase [&_td:first-child]:text-black/70">
            {lignes.map((l) => (
              <tr key={l.titre}>
                <td>{l.titre}</td>
                <td className="whitespace-pre-line">{l.valeur}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-8 grid grid-cols-3 gap-[5mm] [break-inside:avoid]" aria-label="Signatures">
          {SIGNATAIRES.map((s) => (
            <div key={s.qui} className="flex h-[32mm] flex-col border border-black/40 px-[3mm] py-[2mm]">
              <p className="font-bold">{s.qui}</p>
              {s.qui === "Le bénéficiaire" && <p className="text-[9pt]">{bon.beneficiaire}</p>}
              <p className="text-[8pt] text-black/60">{s.mention}</p>
            </div>
          ))}
        </section>

        {bon.justificatifNom && <p className="mt-6 text-[9pt] text-black/60">Justificatif joint dans Maria Suite : {bon.justificatifNom}</p>}
        <PiedDocument identite={identite} />
      </article>
    </main>
  );
}
