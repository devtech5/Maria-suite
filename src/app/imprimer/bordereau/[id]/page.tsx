import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { ApercuA4, FeuilleA4 } from "@/components/impression/feuille-a4";
import { trajet } from "@/components/transmissions/liste-transmissions";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { Qr } from "@/components/visiteurs/qr";
import { identiteEntreprise } from "@/lib/identite";
import { urlAbsolue } from "@/lib/liens-publics";
import { accesTransmissions } from "@/modules/transmissions/acces";
import { AVIS, MENTIONS, totalExemplaires } from "@/modules/transmissions/regles";
import { transmissionDe } from "@/modules/transmissions/requetes";

export const metadata: Metadata = { title: "Bordereau de transmission" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });

/**
 * Le bordereau de transmission sur papier à en-tête : les pièces, la
 * mention cochée, et les cases « remis par » / « reçu par » à signer. Son QR
 * ramène à la fiche, pour noter l'accusé au retour de la décharge.
 */
export default async function ImpressionBordereau({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const a = await accesTransmissions();
  const t = await transmissionDe(a.session.organizationId, id);
  if (!t || !a.voit(t)) notFound();
  const identite = await identiteEntreprise(a.session.organizationId);
  const de = t.sens === "entrante" ? (t.tiersNom ?? t.entreprise ?? "") : `${t.emetteurNom ?? ""}${t.emetteurService ? ` — ${t.emetteurService}` : ""}`;
  const a_ = t.sens === "interne" ? `${t.destinataireNom ?? ""}${t.destinataireService ? ` — ${t.destinataireService}` : ""}` : t.sens === "sortante" ? (t.tiersNom ?? t.entreprise ?? "") : identite.nom;
  const cellule = "border border-black/40 px-[2mm] py-[1.5mm] align-top";

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href={`/transmissions/${t.id}`} className="text-sm text-[var(--encre-douce)] hover:underline">
          ← {t.numero}
        </Link>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <FeuilleA4 pied={<PiedDocument identite={identite} />}>
          <EnTeteDocument identite={identite}>
            <p className="text-[14pt] font-bold uppercase tracking-wide">Bordereau de transmission</p>
            <p className="font-mono text-[11pt]">{t.numero}</p>
            <p className="text-[9pt]">{JOUR.format(t.transmiseLe ?? t.recueLe ?? t.createdAt)}</p>
          </EnTeteDocument>

          <div className="mt-[6mm] grid grid-cols-[1fr_1fr_28mm] gap-[4mm] text-[9.5pt]">
            <div>
              <p className="text-[8pt] font-bold uppercase text-black/60">De</p>
              <p className="font-semibold">{de || "—"}</p>
            </div>
            <div>
              <p className="text-[8pt] font-bold uppercase text-black/60">À</p>
              <p className="font-semibold">{a_ || "—"}</p>
              {t.contact && <p>À l&apos;attention de {t.contact}</p>}
            </div>
            <Qr texte={urlAbsolue(`/transmissions/${t.id}`)} titre="QR du bordereau" className="size-[26mm] [&_svg]:size-full" />
          </div>
          <p className="mt-[4mm] text-[10pt]">
            <span className="font-bold">Objet : </span>
            {t.objet}
          </p>

          <table className="mt-[5mm] w-full border-collapse text-[9pt]">
            <thead>
              <tr className="bg-black/5">
                <th className={`${cellule} w-[8mm] text-left`}>N°</th>
                <th className={`${cellule} text-left`}>Désignation des pièces</th>
                <th className={`${cellule} w-[28mm] text-left`}>Référence</th>
                <th className={`${cellule} w-[13mm]`}>Indice</th>
                <th className={`${cellule} w-[12mm]`}>Nb ex.</th>
                <th className={`${cellule} w-[20mm]`}>Orig. / copie</th>
                <th className={`${cellule} w-[34mm] text-left`}>Observations</th>
              </tr>
            </thead>
            <tbody>
              {t.pieces.map((p, i) => (
                <tr key={i}>
                  <td className={cellule}>{i + 1}</td>
                  <td className={cellule}>{p.designation}</td>
                  <td className={cellule}>{p.reference}</td>
                  <td className={`${cellule} text-center`}>{p.indice}</td>
                  <td className={`${cellule} text-center`}>{p.exemplaires}</td>
                  <td className={`${cellule} text-center`}>{p.original ? "Original" : "Copie"}</td>
                  <td className={cellule}>{[p.avis ? AVIS[p.avis] : "", p.observation].filter(Boolean).join(" — ")}</td>
                </tr>
              ))}
              <tr>
                <td className={cellule} colSpan={4}>
                  <span className="font-semibold">Total</span>
                </td>
                <td className={`${cellule} text-center font-semibold`}>{totalExemplaires(t.pieces)}</td>
                <td className={cellule} colSpan={2} />
              </tr>
            </tbody>
          </table>

          <div className="mt-[5mm] grid grid-cols-4 gap-x-[3mm] gap-y-[1.5mm] text-[9pt]">
            {Object.entries(MENTIONS).map(([cle, libelle]) => (
              <span key={cle} className="flex items-center gap-[1.5mm]">
                <span className="inline-flex size-[3.5mm] items-center justify-center border border-black text-[8pt] leading-none">{t.mention === cle ? "✕" : ""}</span>
                {libelle}
              </span>
            ))}
          </div>

          <div className="mt-[8mm] grid grid-cols-2 gap-[6mm] text-[9pt]">
            {["Remis par", "Reçu par"].map((titre) => (
              <div key={titre} className="h-[34mm] border border-black/40 p-[2.5mm]">
                <p className="font-bold">{titre}</p>
                <p className="mt-[2mm] text-black/60">Nom et fonction :</p>
                <p className="mt-[5mm] text-black/60">Date et heure :</p>
                <p className="mt-[5mm] text-black/60">Signature et cachet :</p>
              </div>
            ))}
          </div>
          <p className="mt-[3mm] text-[7.5pt] text-black/50">{trajet(t)}</p>
        </FeuilleA4>
      </ApercuA4>
    </main>
  );
}
