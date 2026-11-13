import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

export default async function LayoutPv({ children }: LayoutProps<"/pv">) {
  if (!moduleOuvert("pv")) return <ModuleEnPreparation cle="pv" />;
  if (!(await peut("pv.consulter"))) return <AccesRefuse droit="pv.consulter" />;
  return children;
}
