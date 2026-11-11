import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentPiece } from "@/components/impression/document-piece";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { verifierLien } from "@/lib/liens-publics";
import { RendezVousPublic } from "@/components/visiteurs/rendez-vous-public";

export const metadata: Metadata = { title: "Document", robots: { index: false, follow: false } };

/**
 * Pièce ouverte par le client, depuis le lien reçu par e-mail ou WhatsApp.
 *
 * Aucune session : la signature du lien fait foi, pour cette pièce de cette
 * entreprise et jusqu'à son expiration. Un lien modifié ou périmé mène à une
 * page introuvable, sans dire pourquoi.
 */
export default async function PageConsulter({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const parties = verifierLien(decodeURIComponent(jeton));
  // Le QR d'entrée d'un visiteur annoncé.
  if (parties?.[0] === "visite" && parties.length === 3) {
    const rendezVous = await RendezVousPublic({ organizationId: parties[1], visiteId: parties[2] });
    if (!rendezVous) notFound();
    return rendezVous;
  }
  if (!parties || parties[0] !== "piece" || parties.length !== 3) notFound();
  const [, organizationId, pieceId] = parties;

  const document = await DocumentPiece({ organizationId, pieceId });
  if (!document) notFound();

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-3 px-4 print:hidden">
        <BoutonImprimer />
      </div>
      {document}
    </main>
  );
}
