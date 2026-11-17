import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ApercuA4 } from "@/components/impression/feuille-a4";
import { DocumentDemandeConge } from "@/components/presences/document-demande-conge";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { moduleOuvert } from "@/lib/modules/garde";

export const metadata: Metadata = { title: "Demande de congé" };

/**
 * Le formulaire VIERGE de demande de congé, sur papier à en-tête, pour qui le
 * remplit à la main : nature à cocher, dates, motif, intérim, décision et
 * visas. La demande remplie depuis l'application est `/imprimer/demande-conge/[id]`.
 */
export default async function DemandeCongeVierge() {
  if (!moduleOuvert("presences")) notFound();
  const session = await exigerEntreprise();
  const droits = await droitsActifs();
  if (!droits.has("conges.demander") && !droits.has("conges.valider")) return <AccesRefuse droit="conges.demander" />;
  const identite = await identiteEntreprise(session.organizationId);

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href="/presences/conges" className="text-sm text-[var(--encre-douce)] hover:underline">
          ← Congés
        </Link>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <DocumentDemandeConge identite={identite} conge={null} />
      </ApercuA4>
    </main>
  );
}
