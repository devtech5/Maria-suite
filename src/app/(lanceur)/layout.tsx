import type { ReactNode } from "react";

import { BandeauDemo } from "@/components/coque/bandeau-demo";
import { VerrouInactivite } from "@/components/coque/verrou-inactivite";
import { exigerSession } from "@/lib/auth/dal";
import { pointerApresReponse } from "@/modules/presences/pointage";

/**
 * Coque de l'écran d'accueil : plein écran, sans barre du haut ni fil
 * d'Ariane — un lanceur, pas un écran de travail. Les modules s'ouvrent
 * depuis la grille ; on y revient par le logo de la barre du haut.
 *
 * Restent ce qui protège ou prévient : le verrouillage après inactivité et
 * les bandeaux d'abonnement et de démonstration.
 */
export default async function LayoutLanceur({ children }: { children: ReactNode }) {
  const session = await exigerSession();
  // L'accueil est le premier écran après la connexion : c'est là que le
  // pointage du jour se pose, le plus souvent.
  pointerApresReponse(session.organizationId, session.userId);
  return (
    <>
      <div
        id="coque-lanceur"
        className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--color-marque-500)_10%,var(--fond))_0%,var(--fond)_45%,var(--surface-creuse)_100%)]"
      >
        <BandeauDemo />
        {children}
      </div>
      <VerrouInactivite
        cible="coque-lanceur"
        delaiMinutes={session.delaiVerrouillage}
        nom={session.nom}
        email={session.email}
        entreprise={session.organizationNom}
      />
    </>
  );
}
