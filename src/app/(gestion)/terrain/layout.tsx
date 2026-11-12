import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { moduleOuvert } from "@/lib/modules/garde";

/**
 * Le terrain : l'interface des agents et des superviseurs de projet. Pas de
 * droit de module à exiger ici — `projet.terrain.collecter` est accordé à
 * tous, et chaque écran ne montre que les projets où la personne est en poste.
 */
export default function LayoutTerrain({ children }: LayoutProps<"/terrain">) {
  if (!moduleOuvert("projet")) return <ModuleEnPreparation cle="projet" />;
  return children;
}
