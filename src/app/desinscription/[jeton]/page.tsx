import type { Metadata } from "next";

import { SignatureMaria } from "@/components/coque/signature";
import { BoutonDesinscription } from "./bouton";
import { verifierLien } from "@/lib/liens-publics";
import { identiteEntreprise } from "@/lib/identite";

export const metadata: Metadata = { title: "Désinscription", robots: { index: false, follow: false } };

/**
 * Page ouverte depuis le lien « Ne plus recevoir nos messages ».
 *
 * La désinscription demande un clic : un antivirus de messagerie qui visite
 * les liens d'un e-mail pour les vérifier ne doit pas désinscrire à la place
 * du destinataire.
 */
export default async function PageDesinscription({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const brut = decodeURIComponent(jeton);
  const parties = verifierLien(brut);
  const valide = parties !== null && parties[0] === "desinscription" && parties.length === 4;
  const entreprise = valide ? (await identiteEntreprise(parties[1]).catch(() => null))?.nom : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--fond)] p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-6 text-center">
        <h1 className="text-lg font-semibold">Ne plus recevoir de messages</h1>
        {valide ? (
          <>
            <p className="mt-2 text-sm text-[var(--encre-douce)]">
              {entreprise ? `${entreprise} ne vous écrira plus` : "Vous ne recevrez plus de messages"} à l&apos;adresse{" "}
              <span className="chiffres font-medium text-[var(--encre)]">{parties[3]}</span>.
            </p>
            <BoutonDesinscription jeton={brut} />
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--encre-douce)]">Ce lien n&apos;est plus valable. Répondez au message reçu pour demander votre désinscription.</p>
        )}
      </div>
      <SignatureMaria />
    </main>
  );
}
