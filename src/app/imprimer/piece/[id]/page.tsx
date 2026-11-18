import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentPiece } from "@/components/impression/document-piece";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { BoutonRetour } from "@/components/ui/bouton-retour";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";

export const metadata: Metadata = { title: "Impression" };

/**
 * Pièce commerciale au format A4, prête à imprimer ou à enregistrer en PDF.
 *
 * Hors de la coque de gestion : une facture imprimée ne porte ni barre
 * latérale ni menu. Les mentions viennent de la fiche entreprise et de la
 * fiche client — identifiant fiscal (NCC en Côte d'Ivoire) compris — et non
 * d'un modèle figé : c'est le pays de l'entreprise qui décide.
 */
export default async function PageImpressionPiece({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await exigerEntreprise();
  if (!(await peut("commercial.piece.consulter"))) notFound();

  const document = await DocumentPiece({ organizationId: session.organizationId, pieceId: id });
  if (!document) notFound();

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <BoutonRetour href="/commercial/factures" />
        <BoutonImprimer />
      </div>
      {document}
    </main>
  );
}
