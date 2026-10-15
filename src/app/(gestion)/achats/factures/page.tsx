import type { Metadata } from "next";

import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { articlesAchetables, fournisseursActifs, listerFactures } from "@/modules/achats/requetes";

import { EditeurFacture } from "../editeur-facture";
import { ListeFactures } from "./liste";

export const metadata: Metadata = { title: "Factures fournisseurs" };

/**
 * Factures fournisseurs : celles des commandes, et celles des frais généraux
 * — électricité, loyer, honoraires — saisies directement ici.
 */
export default async function PageFacturesFournisseur({ searchParams }: PageProps<"/achats/factures">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const saisir = await peut("achats.facture.saisir");
  // Filtrées en base, avant la limite de cinq cents : la recherche voit tout l'historique.
  const [factures, fournisseurs, articles] = await Promise.all([
    listerFactures(session.organizationId, { recherche: filtres, periodeSur: "date_facture" }),
    saisir ? fournisseursActifs(session.organizationId) : Promise.resolve([]),
    saisir ? articlesAchetables(session.organizationId) : Promise.resolve([]),
  ]);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <>
      <EnTetePage
        titre="Factures fournisseurs"
        sousTitre="Chaque facture passe son écriture d'achat et inscrit la dette au compte du fournisseur"
        actions={
          saisir && fournisseurs.length > 0 ? (
            <EditeurFacture fournisseurs={fournisseurs} articles={articles} aujourdhui={aujourdhui} libelleBouton="Facture sans commande" />
          ) : undefined
        }
      />
      {factures.length === 0 && !filtres.actif ? (
        <EtatVide
          titre="Aucune facture fournisseur"
          message="Saisissez la facture depuis sa commande pour la contrôler face à la réception, ou directement ici pour les frais généraux : électricité, loyer, transport, honoraires."
        />
      ) : (
        <>
          <Recherche
            chemin="/achats/factures"
            valeur={filtres.q}
            placeholder="Numéro, n° du fournisseur, fournisseur, commande…"
            periode={{ ...filtres.periode, libelle: "Date de facture" }}
            resultats={filtres.actif ? `${fmtEntier(factures.length)} facture${factures.length > 1 ? "s" : ""}` : undefined}
          />
          {factures.length === 0 ? (
            <EtatVide titre="Aucune facture ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <ListeFactures factures={factures} annuler={saisir} aujourdhui={aujourdhui} />
          )}
        </>
      )}
    </>
  );
}
