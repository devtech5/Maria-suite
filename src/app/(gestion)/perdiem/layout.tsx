import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

export default async function LayoutPerdiem({ children }: LayoutProps<"/perdiem">) {
  if (!moduleOuvert("perdiem")) return <ModuleEnPreparation cle="perdiem" />;
  if (!(await peut("perdiem.consulter"))) return <AccesRefuse droit="perdiem.consulter" />;
  return (
    <>
      <SousNavigation
        entrees={[
          { href: "/perdiem", libelle: "Attributions" },
          { href: "/perdiem/bareme", libelle: "Barème" },
        ]}
      />
      {children}
    </>
  );
}
