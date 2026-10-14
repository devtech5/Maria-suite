import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SalleReunion } from "@/components/meeting/salle";
import { EtatVide } from "@/components/ui/primitives";
import { env } from "@/env";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { pilote, rejoignable } from "@/modules/meeting/calcul";
import { participantsDe, reunionDe } from "@/modules/meeting/requetes";

export const metadata: Metadata = { title: "Salle de réunion" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La salle : on y règle caméra et micro, puis on entre. La page ne fait que
 * vérifier la place ; l'entrée elle-même — qui ouvre la réunion à la
 * première arrivée — se fait au clic, pas au chargement : un aperçu de lien
 * ne doit pas ouvrir une réunion.
 */
export default async function PageSalle({ params }: PageProps<"/meeting/[id]/salle">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const [reunion, participants, organise] = await Promise.all([
    reunionDe(session.organizationId, id),
    participantsDe(session.organizationId, id),
    peut("meeting.organiser"),
  ]);
  if (!reunion) notFound();

  const pilotee = pilote(reunion, { userId: session.userId, organise });
  if (!participants.some((p) => p.userId === session.userId) && !pilotee) {
    return <EtatVide titre="Réunion privée" message="Vous n'êtes pas invité à cette réunion. Demandez à son organisateur de vous y ajouter." />;
  }
  if (!rejoignable(reunion.statut)) {
    return (
      <EtatVide
        titre={reunion.statut === "terminee" ? "Réunion terminée" : "Réunion annulée"}
        message="La salle est fermée. Le compte rendu et la feuille de présence restent consultables."
        actions={
          <Link href={`/meeting/${reunion.id}`} className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white">
            Voir la réunion
          </Link>
        }
      />
    );
  }

  return (
    <SalleReunion
      reunionId={reunion.id}
      numero={reunion.numero}
      titre={reunion.titre}
      moi={session.userId}
      nomMoi={session.nom}
      pilote={pilotee}
      videoConfiguree={Boolean(env.VIDEO_URL_PUBLIQUE)}
    />
  );
}
