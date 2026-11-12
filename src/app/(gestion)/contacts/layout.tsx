import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesContacts } from "@/modules/contacts/acces";

export default async function LayoutContacts({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("contacts")) return <ModuleEnPreparation cle="contacts" />;
  const a = await accesContacts();
  if (!a.consulter) return <AccesRefuse droit="contacts.consulter" />;
  return (
    <>
      <SousNavigation
        entrees={[
          { href: "/contacts", libelle: "Personnel" },
          { href: "/contacts/services", libelle: "Par service" },
          ...(a.gerer ? [{ href: "/contacts/adresses", libelle: "Adresses e-mail" }] : []),
        ]}
      />
      {children}
    </>
  );
}
