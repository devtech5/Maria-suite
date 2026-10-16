import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

const SECTIONS = [
  { href: "/moyens-generaux", libelle: "Fournitures" },
  { href: "/moyens-generaux/mouvements", libelle: "Entrées et remises" },
  { href: "/moyens-generaux/locaux", libelle: "Entretien des locaux" },
];

export default async function LayoutMoyensGeneraux({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("moyens_generaux")) return <ModuleEnPreparation cle="moyens_generaux" />;
  if (!(await peut("moyens_generaux.consulter"))) return <AccesRefuse droit="moyens_generaux.consulter" />;

  return (
    <>
      <SousNavigation entrees={SECTIONS} />
      {children}
    </>
  );
}
