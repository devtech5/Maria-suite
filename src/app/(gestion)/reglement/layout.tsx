import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

export default async function LayoutReglement({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("reglement")) return <ModuleEnPreparation cle="reglement" />;
  if (!(await peut("reglement.consulter"))) return <AccesRefuse droit="reglement.consulter" />;
  const gerer = await peut("reglement.gerer");

  return (
    <>
      {gerer && (
        <SousNavigation
          entrees={[
            { href: "/reglement", libelle: "Règlement" },
            { href: "/reglement/versions", libelle: "Versions et lectures" },
          ]}
        />
      )}
      {children}
    </>
  );
}
