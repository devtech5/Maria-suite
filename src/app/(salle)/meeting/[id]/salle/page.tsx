import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { VerrouInactivite } from "@/components/coque/verrou-inactivite";
import { SalleReunion } from "@/components/meeting/salle";
import { env } from "@/env";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";
import { pilote, rejoignable } from "@/modules/meeting/calcul";
import { participantsDe, reunionDe } from "@/modules/meeting/requetes";
import { pointerApresReponse } from "@/modules/presences/pointage";

export const metadata: Metadata = { title: "Salle de réunion" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un refus ou une salle fermée, en plein cadre : il n'y a pas de coque où le loger. */
function Avis({ titre, message, retour }: { titre: string; message: string; retour: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--fond)] p-6 text-center">
      <h1 className="text-xl font-semibold">{titre}</h1>
      <p className="max-w-[52ch] text-sm text-[var(--encre-douce)]">{message}</p>
      <Link href={retour} className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
        Retour
      </Link>
    </main>
  );
}

/**
 * La salle : on y règle caméra et micro, puis on entre. La page ne fait que
 * vérifier la place ; l'entrée elle-même — qui ouvre la réunion à la
 * première arrivée — se fait au clic, pas au chargement : un aperçu de lien
 * ne doit pas ouvrir une réunion.
 *
 * Plein cadre, hors de la coque de gestion, et exemptée du verrou
 * d'inactivité comme la caisse : on écoute une réunion d'une heure sans
 * toucher la souris, et le voile cacherait la salle. Seul un verrou demandé
 * à la main la voile.
 */
export default async function PageSalle({ params }: PageProps<"/meeting/[id]/salle">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise({ malgreVerrou: true });
  pointerApresReponse(session.organizationId, session.userId);

  let contenu: ReactNode;
  if (!moduleOuvert("meeting")) {
    contenu = <Avis titre="Meeting indisponible" message="Le module Meeting n'est pas ouvert sur cette instance." retour="/" />;
  } else if (!(await peut("meeting.participer"))) {
    contenu = <Avis titre="Réunions réservées" message="Votre rôle ne permet pas de participer aux réunions. Le responsable de l'entreprise peut vous accorder ce droit." retour="/" />;
  } else {
    const [reunion, participants, organise] = await Promise.all([
      reunionDe(session.organizationId, id),
      participantsDe(session.organizationId, id),
      peut("meeting.organiser"),
    ]);
    if (!reunion) notFound();

    const pilotee = pilote(reunion, { userId: session.userId, organise });
    if (!participants.some((p) => p.userId === session.userId) && !pilotee) {
      contenu = <Avis titre="Réunion privée" message="Vous n'êtes pas invité à cette réunion. Demandez à son organisateur de vous y ajouter." retour="/meeting" />;
    } else if (!rejoignable(reunion.statut)) {
      contenu = (
        <Avis
          titre={reunion.statut === "terminee" ? "Réunion terminée" : "Réunion annulée"}
          message="La salle est fermée. Le compte rendu et la feuille de présence restent consultables."
          retour={`/meeting/${reunion.id}`}
        />
      );
    } else {
      contenu = (
        <main className="min-h-dvh bg-[var(--fond)] p-3 lg:p-4">
          <SalleReunion
            reunionId={reunion.id}
            numero={reunion.numero}
            titre={reunion.titre}
            moi={session.userId}
            nomMoi={session.nom}
            pilote={pilotee}
            videoConfiguree={Boolean(env.VIDEO_URL_PUBLIQUE)}
          />
        </main>
      );
    }
  }

  return (
    <>
      {/* Ses gestes comptent comme activité ; elle ne se voile que sur un verrou demandé à la main. */}
      <VerrouInactivite
        mode="presence"
        cible="coque-salle"
        sessionVerrouillee={session.verrouillee}
        delaiMinutes={session.delaiVerrouillage}
        nom={session.nom}
        email={session.email}
        entreprise={session.organizationNom}
      />
      <div id="coque-salle">{contenu}</div>
    </>
  );
}
