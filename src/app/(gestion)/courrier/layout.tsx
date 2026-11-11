import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesCourrier } from "@/modules/courrier/acces";

export default async function LayoutCourrier({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("courrier")) return <ModuleEnPreparation cle="courrier" />;
  const a = await accesCourrier();
  const entrees = [
    ...(a.consulter ? [{ href: "/courrier", libelle: "Registre" }] : []),
    ...(a.imputer ? [{ href: "/courrier/a-imputer", libelle: "À imputer" }] : []),
    { href: "/courrier/mon-courrier", libelle: "Mon courrier" },
  ];
  return (
    <>
      {entrees.length > 1 && <SousNavigation entrees={entrees} />}
      {children}
    </>
  );
}
