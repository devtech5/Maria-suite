import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { lienRapports } from "@/lib/rapports/registre";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

/**
 * Le module s'appelle « Personnel », pas « RH & Paie » : il couvre deux
 * régimes de rémunération, et le second ne relève pas de la paie.
 *
 *   · Salariés     — contrat, bulletin, CNPS, ITS
 *   · Intervenants — pointage, taux, bon de paiement
 */
const SECTIONS = [
  { href: "/rh", libelle: "Salariés" },
  { href: "/rh/intervenants", libelle: "Intervenants" },
  { href: "/rh/paie", libelle: "Paie" },
  { href: "/rh/services", libelle: "Services" },
  { href: "/rh/postes", libelle: "Postes" },
];

export default async function LayoutRh({
  children,
}: LayoutProps<"/rh">) {
  if (!moduleOuvert("personnes")) return <ModuleEnPreparation cle="personnes" />;

  if (!(await peut("personnes.consulter"))) return <AccesRefuse droit="personnes.consulter" />;

  return (
    <>
      <SousNavigation entrees={SECTIONS} rapports={await lienRapports("personnes")} />
      {children}
    </>
  );
}
