import Link from "next/link";
import { notFound } from "next/navigation";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { identiteEntreprise, lignesTicket } from "@/lib/identite";
import { DROITS_ESPACE, ESPACES, minutesDepuis, type Espace } from "@/modules/restauration/calcul";
import { carte, commandeDetaillee, postesDeSalle } from "@/modules/restauration/requetes";

import { EcranCommande } from "./ecran-commande";
import { Rafraichissement } from "./rafraichissement";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Commande d'une table : la carte, ce qui est parti, ce qui reste à envoyer, l'encaissement. */
export async function PageCommande({ espace, id }: { espace: Espace; id: string }) {
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const commande = await commandeDetaillee(session.organizationId, id);
  // Une commande du restaurant ne s'ouvre pas depuis les écrans du maquis : les
  // droits se donnent espace par espace.
  if (!commande || commande.espace !== espace) notFound();

  const droits = DROITS_ESPACE[espace];
  const [articles, postes, identite, prendre, encaisser, annuler] = await Promise.all([
    carte(session.organizationId),
    postesDeSalle(session.organizationId),
    identiteEntreprise(session.organizationId),
    peut(droits.prendre),
    peut(droits.encaisser),
    peut(droits.annuler),
  ]);

  return (
    <>
      {commande.statut === "ouverte" && <Rafraichissement secondes={30} />}
      <p className="mb-3 text-sm">
        <Link href={ESPACES[espace].racine} className="text-[var(--encre-douce)] hover:underline">
          ← Retour à la salle
        </Link>
      </p>
      <EcranCommande
        espace={espace}
        commande={{
          id: commande.id,
          numero: commande.numero,
          statut: commande.statut,
          repere: commande.tableNom ? `Table ${commande.tableNom}` : (commande.libelle ?? "À emporter"),
          couverts: commande.couverts,
          serveur: commande.serveur,
          minutes: minutesDepuis(commande.ouverteLe, new Date()),
          motifAnnulation: commande.motifAnnulation,
          total: commande.total,
          lignes: commande.lignes.map((l) => ({
            id: l.id,
            articleId: l.articleId,
            designation: l.designation,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            note: l.note,
            poste: l.poste,
            etat: l.etat,
            motifAnnulation: l.motifAnnulation,
          })),
        }}
        articles={articles}
        postes={postes.map((p) => ({ id: p.id, nom: p.nom, depotNom: p.depotNom }))}
        droits={{ prendre, encaisser, annuler }}
        ticket={{
          boutique: session.organizationNom ?? "Maria Suite",
          entete: lignesTicket(identite),
          piedDePage: identite.piedDePage,
          logo: identite.logo,
          caissier: session.nom,
        }}
      />
    </>
  );
}
