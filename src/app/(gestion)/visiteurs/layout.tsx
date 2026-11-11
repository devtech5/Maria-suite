import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesVisiteurs } from "@/modules/visiteurs/acces";

export default async function LayoutVisiteurs({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("visiteurs")) return <ModuleEnPreparation cle="visiteurs" />;
  const acces = await accesVisiteurs();
  if (!acces.annoncer) return <AccesRefuse droit="visiteurs.annoncer" />;

  const entrees = [
    ...(acces.accueillir ? [{ href: "/visiteurs", libelle: "Accueil" }] : []),
    { href: "/visiteurs/rendez-vous", libelle: "Rendez-vous" },
    ...(acces.accueillir ? [{ href: "/visiteurs/registre", libelle: "Registre" }, { href: "/visiteurs/presents", libelle: "Présents" }] : []),
    ...(acces.superviser ? [{ href: "/visiteurs/accueils", libelle: "Points d'accueil" }] : []),
  ];
  return (
    <>
      {entrees.length > 1 && <SousNavigation entrees={entrees} />}
      {children}
    </>
  );
}
