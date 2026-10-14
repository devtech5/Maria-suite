import { AccesRefuse } from "@/components/coque/acces-refuse";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { lienRapports } from "@/lib/rapports/registre";
import { peut } from "@/lib/droits/garde";

/**
 * Quatre sections, pas dix.
 *
 * « Devis et factures » regroupe devis, factures et avoirs : ce sont trois
 * états d'un même flux commercial, pas trois métiers. Le concurrent éclate le
 * tout en huit onglets, abonnements, prestations et « meilleures ventes »
 * compris.
 *
 * Pas d'onglet « Caisse » chez MARIA GROUP SARL : les ventes au comptoir
 * (`/commercial/ventes`) ne sont plus proposées depuis ce menu.
 */
const SECTIONS = [
  { href: "/commercial", libelle: "Clients" },
  { href: "/commercial/factures", libelle: "Devis et factures" },
  { href: "/commercial/commerciaux", libelle: "Commerciaux" },
  { href: "/commercial/fournisseurs", libelle: "Fournisseurs" },
];

export default async function LayoutCommercial({
  children,
}: LayoutProps<"/commercial">) {
  if (!(await peut("tiers.fiche.consulter"))) return <AccesRefuse droit="tiers.fiche.consulter" />;

  return (
    <>
      <SousNavigation entrees={SECTIONS} rapports={await lienRapports("tiers", "pos")} />
      {children}
    </>
  );
}
