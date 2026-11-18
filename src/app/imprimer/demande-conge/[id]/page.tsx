import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ApercuA4 } from "@/components/impression/feuille-a4";
import { DocumentDemandeConge } from "@/components/presences/document-demande-conge";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { BoutonRetour } from "@/components/ui/bouton-retour";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { moduleOuvert } from "@/lib/modules/garde";
import { NATURES_CONGE, jourLocal } from "@/modules/presences/calcul";
import { reglagesDe } from "@/modules/presences/creation";
import { congeAImprimer, soldesConges } from "@/modules/presences/requetes";

export const metadata: Metadata = { title: "Demande de congé" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une demande de congé saisie dans l'application, imprimée sur papier à
 * en-tête pour être signée : le salarié imprime la sienne, le valideur
 * (`conges.valider`) celle de tout salarié. Le solde de congés payés figure
 * au jour de l'impression, pour un congé qui se décompte du solde.
 */
export default async function DemandeCongeImprimee({ params }: { params: Promise<{ id: string }> }) {
  if (!moduleOuvert("presences")) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const org = session.organizationId;
  const [droits, conge] = await Promise.all([droitsActifs(), congeAImprimer(org, id)]);
  if (!conge) notFound();
  const sienne = conge.salarieUserId === session.userId;
  if (!droits.has("conges.valider") && !(sienne && droits.has("conges.demander"))) return <AccesRefuse droit="conges.valider" />;

  const r = await reglagesDe(org);
  const aujourdhui = jourLocal(new Date(), r.fuseau);
  const [identite, [solde]] = await Promise.all([
    identiteEntreprise(org),
    NATURES_CONGE[conge.nature].decompteSolde ? soldesConges(org, r, aujourdhui, [conge.employeeId]) : Promise.resolve([]),
  ]);

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <BoutonRetour href="/presences/conges">
          Congés
        </BoutonRetour>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <DocumentDemandeConge identite={identite} conge={conge} solde={solde ? { au: aujourdhui, acquis: solde.acquis, pris: solde.pris, solde: solde.solde } : null} />
      </ApercuA4>
    </main>
  );
}
