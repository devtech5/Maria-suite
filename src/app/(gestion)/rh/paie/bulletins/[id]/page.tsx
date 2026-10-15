import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApercuA4 } from "@/components/impression/feuille-a4";
import { BulletinDocument } from "@/components/paie/bulletin-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { exigerEntreprise } from "@/lib/auth/dal";
import { identiteEntreprise } from "@/lib/identite";
import { libelleMois } from "@/modules/paie/calcul";
import { bulletinDetail, bulletinsNumerotes } from "@/modules/paie/requetes";

export const metadata: Metadata = { title: "Bulletin de paie" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIEN = "h-cible inline-flex items-center rounded-lg border border-[var(--filet)] px-3 text-sm font-medium hover:bg-[var(--surface-creuse)]";

/**
 * Aperçu du bulletin dans l'application : la feuille A4 telle qu'elle
 * s'imprimera, avec de quoi passer au bulletin suivant du mois. L'impression
 * ne sort que la feuille, sans la barre du haut ni les boutons.
 *
 * Seul un bulletin validé, donc numéroté, s'affiche : un brouillon se
 * recalcule encore et ne doit pas circuler.
 */
export default async function PageBulletin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const detail = await bulletinDetail(session.organizationId, id);
  if (!detail?.bulletin.numero || !detail.periode?.baremeApplique) notFound();

  const [identite, mois] = await Promise.all([identiteEntreprise(session.organizationId), bulletinsNumerotes(session.organizationId, detail.periode.id)]);
  const rang = mois.findIndex((b) => b.id === id);
  const precedent = rang > 0 ? mois[rang - 1] : null;
  const suivant = rang >= 0 && rang < mois.length - 1 ? mois[rang + 1] : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href={`/rh/paie?mois=${detail.periode.mois}`} className="text-sm text-[var(--encre-douce)] hover:underline">
            ← Paie de {libelleMois(detail.periode.mois)}
          </Link>
          <h1 className="mt-1 text-lg font-semibold">
            {detail.bulletin.nom} <span className="chiffres text-sm font-normal text-[var(--encre-faible)]">· {detail.bulletin.numero}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {precedent ? (
            <Link href={`/rh/paie/bulletins/${precedent.id}`} className={LIEN} title={precedent.nom}>
              ← Précédent
            </Link>
          ) : null}
          {mois.length > 1 && (
            <span className="chiffres text-xs text-[var(--encre-faible)]">
              {rang + 1} / {mois.length}
            </span>
          )}
          {suivant ? (
            <Link href={`/rh/paie/bulletins/${suivant.id}`} className={LIEN} title={suivant.nom}>
              Suivant →
            </Link>
          ) : null}
          <BoutonImprimer />
        </div>
      </div>

      <ApercuA4>
        <BulletinDocument detail={detail} identite={identite} />
      </ApercuA4>
    </>
  );
}
