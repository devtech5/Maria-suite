import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { lienRapports } from "@/lib/rapports/registre";
import { droitsActifs } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

/**
 * Présences et congés. Chacun y voit son pointage et ses congés ; les onglets
 * d'équipe n'apparaissent qu'à qui peut s'en servir.
 */
export default async function LayoutPresences({ children }: LayoutProps<"/presences">) {
  if (!moduleOuvert("presences")) return <ModuleEnPreparation cle="presences" />;
  const droits = await droitsActifs();
  if (!droits.has("conges.demander") && !droits.has("presences.consulter")) return <AccesRefuse droit="conges.demander" />;

  const equipe = droits.has("presences.consulter");
  const entrees = [
    { href: "/presences", libelle: "Aujourd'hui" },
    ...(equipe ? [{ href: "/presences/registre", libelle: "Registre" }] : []),
    { href: "/presences/conges", libelle: "Congés" },
    { href: "/presences/permissions", libelle: "Permissions" },
    ...(equipe || droits.has("conges.valider") ? [{ href: "/presences/soldes", libelle: "Soldes" }] : []),
    ...(droits.has("presences.gerer") ? [{ href: "/presences/reglages", libelle: "Réglages" }] : []),
  ];

  return (
    <>
      <SousNavigation entrees={entrees} rapports={await lienRapports("presences")} />
      {children}
    </>
  );
}
