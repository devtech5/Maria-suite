import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PapierEnTete, TitreDocument, PiedDocument } from "@/components/impression/entete-document";
import { ApercuA4, FeuilleA4 } from "@/components/impression/feuille-a4";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { BoutonRetour } from "@/components/ui/bouton-retour";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";
import { montantEnLettres } from "@/lib/lettres";
import { regrouperParRubrique, type StatutCommandeInterne } from "@/modules/tresorerie/commandes-internes";
import { commandeInterne } from "@/modules/tresorerie/requetes-commandes-internes";

export const metadata: Metadata = { title: "Bon de commande interne" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Abidjan vit à UTC toute l'année : la date affichée est celle du bureau. */
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

const STATUT: Record<StatutCommandeInterne, string> = {
  demande: "À approuver",
  approuve: "Approuvé",
  rejete: "Refusé",
  annule: "Annulé",
};

/** Le bénéficiaire signe le bon ; la comptable et la PDG le visent. */
const SIGNATAIRES = [
  { qui: "Le bénéficiaire", mention: "Nom, date et signature" },
  { qui: "La Comptable", mention: "Nom, date et signature" },
  { qui: "La PDG", mention: "Nom, date, signature et cachet" },
] as const;

/**
 * Bon de commande interne au format A4 : lignes regroupées par rubrique avec
 * leurs sous-totaux, total en chiffres et en lettres, cases
 * de visa. Même règle de lecture que l'écran : qui ne voit pas tous les bons
 * n'ouvre que les siens.
 */
export default async function ImpressionCommandeInterne({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const [consulter, approuver, demander] = await Promise.all([peut("tresorerie.consulter"), peut("tresorerie.bon.approuver"), peut("tresorerie.bon.demander")]);
  const voitTout = consulter || approuver;
  if (!voitTout && !demander) notFound();

  const [c, identite] = await Promise.all([commandeInterne(session.organizationId, session.userId, voitTout, id), identiteEntreprise(session.organizationId)]);
  if (!c) notFound();
  const rubriques = regrouperParRubrique(c.lignes);
  const avecSousTotaux = rubriques.length > 1;
  const nul = c.statut === "annule" || c.statut === "rejete";

  const cellule = "px-[1.5mm] py-[0.8mm]";
  const filetTete = { background: identite.couleur };

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <BoutonRetour href="/tresorerie/caisse/commandes">
          Bons de commande internes
        </BoutonRetour>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <FeuilleA4 entete={<PapierEnTete identite={identite} />} pied={<PiedDocument identite={identite} />}>
          <TitreDocument identite={identite}>
            <p className="text-[15pt] font-bold uppercase tracking-wide">Bon de commande interne</p>
            <p>
              <span className="font-mono text-[11pt]">{c.numero}</span> · Date : {JOUR.format(c.demandeLe)} · <span className="text-black/60">{STATUT[c.statut]}</span>
            </p>
            <p>Objet : {c.objet}</p>
          </TitreDocument>

          {nul && (
            <p className="mt-4 rounded border-2 border-red-700 px-3 py-2 text-center font-bold uppercase text-red-700">
              {STATUT[c.statut]}
              {c.motifRejet ? ` — ${c.motifRejet}` : ""}
            </p>
          )}

          <dl className="mt-[4mm] grid grid-cols-[auto_1fr] gap-x-[3mm] gap-y-[0.6mm] rounded border border-black/20 px-[3mm] py-[2mm] text-[9pt]">
            <dt className="text-black/60">Demandeur</dt>
            <dd>
              <span className="font-semibold">{c.demandeur}</span>
              {c.service && <> · Service : {c.service}</>}
            </dd>
            {c.beneficiaire && (
              <>
                <dt className="text-black/60">Bénéficiaire</dt>
                <dd className="font-semibold">{c.beneficiaire}</dd>
              </>
            )}
            {c.lieuLivraison && (
              <>
                <dt className="text-black/60">Livraison</dt>
                <dd>{c.lieuLivraison}</dd>
              </>
            )}
            <dt className="text-black/60">Décision</dt>
            <dd>
              {c.approbateur ? (
                <>
                  {c.statut === "rejete" ? "Refusé" : "Approuvé"} par <span className="font-semibold">{c.approbateur}</span>
                  {c.approuveLe && <> le {JOUR.format(c.approuveLe)}</>}
                </>
              ) : (
                <span className="text-black/60">En attente d&apos;approbation</span>
              )}
            </dd>
          </dl>

          <table className="mt-[4mm] w-full border-collapse text-[9pt]">
            <thead className="[display:table-header-group]">
              <tr className="text-left text-[8pt] uppercase text-white" style={filetTete}>
                <th className={cellule}>Désignation</th>
                <th className={`${cellule} w-[14mm] text-right`}>Qté</th>
                <th className={`${cellule} w-[30mm] text-right`}>Prix unitaire</th>
                <th className={`${cellule} w-[32mm] text-right`}>Montant</th>
              </tr>
            </thead>
            {rubriques.map((r, i) => (
              <tbody key={r.rubrique || `sans-rubrique-${i}`} className="[break-inside:avoid]">
                {r.rubrique && (
                  <tr className="bg-[#f3efe6] font-bold" style={{ color: identite.couleur }}>
                    <td colSpan={4} className={cellule}>
                      {avecSousTotaux ? `${i + 1}. ` : ""}
                      {r.rubrique}
                    </td>
                  </tr>
                )}
                {r.lignes.map((l, j) => (
                  <tr key={j} className="border-b border-black/10 align-top">
                    <td className={cellule}>{l.designation}</td>
                    <td className={`${cellule} text-right tabular-nums`}>{fmt(l.quantite)}</td>
                    <td className={`${cellule} text-right tabular-nums`}>{fmt(l.prixUnitaire)}</td>
                    <td className={`${cellule} text-right tabular-nums`}>{fmt(l.montant)}</td>
                  </tr>
                ))}
                {avecSousTotaux && (
                  <tr className="border-b border-black/30 font-semibold">
                    <td colSpan={3} className={cellule}>
                      Sous-total {r.rubrique ? r.rubrique.toLowerCase() : "hors rubrique"}
                    </td>
                    <td className={`${cellule} text-right tabular-nums`}>{fmt(r.sousTotal)}</td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>

          <p className="mt-[3mm] flex justify-end gap-[8mm] border-t border-black/40 pt-[1.5mm] text-[12pt] font-bold tabular-nums [break-inside:avoid]">
            <span>Total général</span>
            <span>{fmt(c.total)} FCFA</span>
          </p>
          <p className="mt-[1.5mm] text-right text-[9pt] italic">Arrêté le présent bon à la somme de : {montantEnLettres(c.total)}.</p>

          {c.notes && <p className="mt-[3mm] whitespace-pre-line text-[9pt]">{c.notes}</p>}

          <section className="mt-[5mm] grid grid-cols-3 gap-[5mm] text-[9pt] [break-inside:avoid]" aria-label="Signatures">
            {SIGNATAIRES.map((s) => (
              <div key={s.qui} className="flex h-[24mm] flex-col border border-black/40 px-[2.5mm] py-[1.5mm]">
                <p className="font-bold">{s.qui}</p>
                {s.qui === "Le bénéficiaire" && c.beneficiaire && <p className="text-[8.5pt]">{c.beneficiaire}</p>}
                <p className="text-[7.5pt] text-black/60">{s.mention}</p>
              </div>
            ))}
          </section>
        </FeuilleA4>
      </ApercuA4>
    </main>
  );
}
