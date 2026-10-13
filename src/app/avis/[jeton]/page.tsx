import type { Metadata } from "next";

import { FormulaireReponse } from "@/components/enquetes/formulaire-reponse";
import { cibleDuLien, enquetePublique } from "@/modules/enquetes/requetes";

export const metadata: Metadata = { title: "Votre avis", robots: { index: false, follow: false } };

function Cadre({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-xl bg-[var(--fond)] px-4 py-8 text-[var(--encre)]">{children}</main>;
}

/**
 * Page publique d'une enquête, ouverte sans compte depuis un lien signé.
 *
 * Elle ne montre que le questionnaire et le nom de l'entreprise qui le pose :
 * ni les autres réponses, ni le projet.
 */
export default async function PageAvis({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const cible = cibleDuLien(decodeURIComponent(jeton));
  const enquete = cible ? await enquetePublique(cible.organizationId, cible.enqueteId) : null;

  if (!enquete) {
    return (
      <Cadre>
        <h1 className="text-xl font-bold">Lien expiré</h1>
        <p className="mt-2 text-sm text-[var(--encre-douce)]">Ce lien n&apos;est plus valable. Demandez-en un nouveau à l&apos;entreprise qui vous l&apos;a envoyé.</p>
      </Cadre>
    );
  }

  return (
    <Cadre>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--encre-faible)]">{enquete.entreprise}</p>
      <h1 className="mt-1 text-xl font-bold">{enquete.titre}</h1>
      {enquete.introduction && <p className="mt-2 text-sm text-[var(--encre-douce)]">{enquete.introduction}</p>}
      <div className="mt-6">
        {enquete.ouverte ? (
          <FormulaireReponse questions={enquete.questions} mode={{ canal: "lien", jeton: decodeURIComponent(jeton) }} />
        ) : (
          <p className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-sm">Cette enquête est close. Merci de votre intérêt.</p>
        )}
      </div>
      <p className="mt-8 text-center text-xs text-[var(--encre-faible)]">Réponses recueillies avec Maria Suite</p>
    </Cadre>
  );
}
