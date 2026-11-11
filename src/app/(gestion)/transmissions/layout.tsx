import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesTransmissions } from "@/modules/transmissions/acces";

export default async function LayoutTransmissions({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("transmissions")) return <ModuleEnPreparation cle="transmissions" />;
  const a = await accesTransmissions();
  return (
    <>
      {a.emettre && (
        <SousNavigation
          entrees={[
            { href: "/transmissions", libelle: "Bordereaux" },
            { href: "/transmissions/recues", libelle: "Reçues" },
          ]}
        />
      )}
      {children}
    </>
  );
}
