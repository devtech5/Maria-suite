import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

export default async function LayoutMeeting({ children }: LayoutProps<"/meeting">) {
  if (!moduleOuvert("meeting")) return <ModuleEnPreparation cle="meeting" />;
  if (!(await peut("meeting.participer"))) return <AccesRefuse droit="meeting.participer" />;
  return children;
}
