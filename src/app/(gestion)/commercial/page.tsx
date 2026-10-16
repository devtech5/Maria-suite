import type { Metadata } from "next";

import { BoutonDemonstration } from "@/components/bouton-demonstration";
import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { fichesTiers } from "@/modules/tiers/requetes";
import { FormulaireTiers } from "./formulaire-tiers";
import { ListeClients } from "./liste-clients";

export const metadata: Metadata = { title: "Clients" };

export default async function PageClients() {
  const session = await exigerEntreprise();
  const [gerer, supprimer] = await Promise.all([peut("tiers.fiche.gerer"), peut("tiers.fiche.supprimer")]);
  // Qui peut réactiver voit aussi les fiches en off.
  const clients = await fichesTiers(session.organizationId, "client", gerer);

  const encoursTotal = clients.reduce(
    (somme, client) => somme + client.encoursClient,
    0,
  );

  return (
    <>
      <EnTetePage
        titre="Clients"
        sousTitre={
          clients.length === 0
            ? "Aucun client enregistré"
            : `${clients.length} clients · ${fmt(encoursTotal)} FCFA d'encours`
        }
        actions={<FormulaireTiers role="client" />}
      />

      {clients.length === 0 ? (
        <EtatVide
          titre="Le fichier clients est vide"
          message="Chaque client reçoit sa référence et son compte auxiliaire 411 à la création : c'est ce qui permet de lui rattacher une facture, puis de lettrer son règlement."
          actions={<BoutonDemonstration libelle="Installer le fichier de démonstration" />}
        />
      ) : (
        <ListeClients clients={clients} modifiable={gerer} supprimable={supprimer} />
      )}
    </>
  );
}
