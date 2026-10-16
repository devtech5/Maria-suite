import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourrierDocument } from "@/components/impression/courrier-document";
import { ApercuA4 } from "@/components/impression/feuille-a4";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { courrierDe } from "@/modules/documents/courriers";

export const metadata: Metadata = { title: "Courrier" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Courrier officiel au format A4, prêt à imprimer ou à enregistrer en PDF.
 *
 * Hors de la coque de gestion : la feuille sort seule, sans menu ni bouton.
 */
export default async function ImpressionCourrier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  if (!(await peut("documents.consulter"))) notFound();
  const [courrier, identite] = await Promise.all([courrierDe(session.organizationId, id), identiteEntreprise(session.organizationId)]);
  if (!courrier) notFound();

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href={`/documents/courriers/${courrier.id}`} className="text-sm text-[var(--encre-douce)] hover:underline">
          ← {courrier.numero}
        </Link>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <CourrierDocument courrier={courrier} identite={identite} />
      </ApercuA4>
    </main>
  );
}
