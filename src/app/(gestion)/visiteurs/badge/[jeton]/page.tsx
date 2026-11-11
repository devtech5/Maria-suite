import { notFound, redirect } from "next/navigation";

import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { visiteDe, visiteParJeton } from "@/modules/visiteurs/requetes";

/**
 * Où mène le QR d'un badge ou d'un rendez-vous, scanné par l'accueil : à la
 * fiche de la visite, prête pour l'arrivée ou la sortie. Le QR ne porte qu'un
 * jeton : sans compte de l'accueil, il ne mène à rien.
 */
export default async function PageBadge({ params }: PageProps<"/visiteurs/badge/[jeton]">) {
  const acces = await accesVisiteurs();
  const { jeton } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(jeton)) notFound();
  const id = await visiteParJeton(acces.session.organizationId, jeton);
  const v = id ? await visiteDe(acces.session.organizationId, id) : null;
  if (!v || !acces.accueillir || !acces.accueilPermis(v.accueilId)) notFound();
  redirect(v.statut === "attendue" ? `/visiteurs/${v.id}?arrivee=1` : `/visiteurs/${v.id}`);
}
