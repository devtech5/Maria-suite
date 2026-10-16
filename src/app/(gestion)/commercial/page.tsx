import type { Metadata } from "next";

import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { fichesTiers } from "@/modules/tiers/requetes";
import { FormulaireTiers } from "./formulaire-tiers";
import { ListeClients } from "./liste-clients";

export const metadata: Metadata = { title: "Clients" };

export default async function PageClients({ searchParams }: PageProps<"/commercial">) {
  const session = await exigerEntreprise();
  // `?q=` arrive de la recherche globale : il pré-remplit la recherche de la liste, qui filtre ensuite au clavier.
  const filtres = lireFiltresListe(await searchParams);
  const [clients, gerer] = await Promise.all([fichesTiers(session.organizationId, "client"), peut("tiers.fiche.gerer")]);

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
        />
      ) : (
        <ListeClients key={filtres.q} clients={clients} modifiable={gerer} rechercheInitiale={filtres.q} />
      )}
    </>
  );
}
