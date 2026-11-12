import { AccesRefuse } from "@/components/coque/acces-refuse";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { lienRapports } from "@/lib/rapports/registre";
import { peut } from "@/lib/droits/garde";

/**
 * Les sections du module — Clients, Commercial, Fournisseurs, Devis et
 * factures — sont des onglets du domaine Commerce, dans la rangée sous la
 * barre du haut (`src/lib/navigation.ts`). Les répéter ici en pastilles
 * afficherait deux fois la même rangée ; seul reste le lien vers les rapports.
 */
export default async function LayoutCommercial({
  children,
}: LayoutProps<"/commercial">) {
  if (!(await peut("tiers.fiche.consulter"))) return <AccesRefuse droit="tiers.fiche.consulter" />;

  return (
    <>
      <SousNavigation entrees={[]} rapports={await lienRapports("tiers")} />
      {children}
    </>
  );
}
