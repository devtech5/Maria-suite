import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

export default async function LayoutGuide({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("guide")) return <ModuleEnPreparation cle="guide" />;
  if (!(await peut("guide.consulter"))) return <AccesRefuse droit="guide.consulter" />;
  const suivre = await peut("guide.suivre");

  return (
    <>
      <SousNavigation
        entrees={[
          { href: "/guide", libelle: "Parcours" },
          { href: "/guide/quiz", libelle: "Quiz" },
          ...(suivre ? [{ href: "/guide/suivi", libelle: "Suivi de l'équipe" }] : []),
        ]}
      />
      {children}
    </>
  );
}
