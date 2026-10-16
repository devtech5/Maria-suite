import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourrierDocument } from "@/components/impression/courrier-document";
import { ApercuA4 } from "@/components/impression/feuille-a4";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { supprimerCourrier } from "@/modules/documents/actions-courriers";
import { courrierDe } from "@/modules/documents/courriers";

import { FormulaireCourrier } from "../formulaire-courrier";
import { BoutonRetirer } from "./bouton-retirer";

export const metadata: Metadata = { title: "Courrier" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIEN = "h-cible inline-flex items-center rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700";

/**
 * Fiche d'un courrier : la feuille telle qu'elle s'imprimera et, pour qui peut
 * rédiger, de quoi la corriger. L'impression passe par `/imprimer/courrier`,
 * hors de la coque de gestion.
 */
export default async function PageCourrier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const [courrier, identite, peutRediger] = await Promise.all([
    courrierDe(session.organizationId, id),
    identiteEntreprise(session.organizationId),
    peut("documents.courrier.rediger"),
  ]);
  if (!courrier) notFound();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <Link href="/documents/courriers" className="text-sm text-[var(--encre-douce)] hover:underline">
            ← Courriers
          </Link>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight">{courrier.objet}</h1>
          <p className="chiffres mt-0.5 text-sm text-[var(--encre-faible)]">{courrier.numero}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {peutRediger && (
            <form action={supprimerCourrier}>
              <input type="hidden" name="id" value={courrier.id} />
              <BoutonRetirer numero={courrier.numero} />
            </form>
          )}
          <Link href={`/imprimer/courrier/${courrier.id}`} className={LIEN}>
            Imprimer
          </Link>
        </div>
      </div>

      {peutRediger ? (
        <FormulaireCourrier id={courrier.id} initial={courrier} identite={identite} />
      ) : (
        <ApercuA4>
          <CourrierDocument courrier={courrier} identite={identite} />
        </ApercuA4>
      )}
    </>
  );
}
