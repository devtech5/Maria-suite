import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { AccesRefuse } from "@/components/coque/acces-refuse";
import { peut } from "@/lib/droits/garde";
import { listerDepots } from "@/modules/stock/requetes";
import {
  derniersTickets,
  journeeCaisse,
  listerPostes,
} from "@/modules/ventes/requetes";
import { historiqueSessions } from "@/modules/ventes/session";
import { TicketsCaisse } from "./tickets-caisse";

export const metadata: Metadata = { title: "Caisse" };

/**
 * Ventes au comptoir : tickets, postes et clôtures de caisse.
 *
 * Les devis et factures ont leur propre écran : un ticket de caisse se règle
 * sur-le-champ et ne s'adresse à personne en particulier, une facture
 * s'adresse à un client et se règle plus tard. Mélangés, les deux flux
 * brouillaient le seul chiffre qui compte le soir : ce que le tiroir doit
 * contenir.
 */
export default async function PageVentes() {
  const session = await exigerEntreprise();
  // Caisse coupée pour l'entreprise : ses droits tombent, la page aussi.
  if (!(await peut("pos.vente.consulter"))) return <AccesRefuse droit="pos.vente.consulter" />;

  // Le début de journée sert de borne à la clôture : c'est la période que le
  // caissier compte le soir, tiroir ouvert.
  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const [tickets, journee, postes, depots, clotures, peutAnnuler] = await Promise.all([
    derniersTickets(session.organizationId, 25),
    journeeCaisse(session.organizationId, debutJournee),
    listerPostes(session.organizationId),
    listerDepots(session.organizationId),
    historiqueSessions(session.organizationId, 8),
    peut("pos.vente.annuler"),
  ]);

  return (
    <>
      <EnTetePage
        titre="Caisse"
        sousTitre="Tickets, postes d'encaissement et clôtures"
        actions={
          <Link
            href="/caisse"
            className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
          >
            Ouvrir la caisse
          </Link>
        }
      />

      <TicketsCaisse
        tickets={tickets}
        journee={journee}
        postes={postes.map((poste) => ({
          code: poste.code,
          nom: poste.nom,
          depotNom: poste.depotNom,
          dernierNumero: poste.dernierNumero,
        }))}
        depots={depots.map((depot) => ({ id: depot.id, nom: depot.nom }))}
        clotures={clotures}
        peutAnnuler={peutAnnuler}
      />
    </>
  );
}
