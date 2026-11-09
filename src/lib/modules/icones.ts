import { definitionDroit } from "@/lib/droits/catalogue";
import { GROUPES_MODULES, type CleIcone } from "@/lib/navigation";

/**
 * Icône d'un module du registre : celle de sa première entrée dans la carte
 * de navigation. Un module sans entrée prend l'icône générique du tableau de
 * bord.
 */
const ICONES = new Map<string, CleIcone>();
for (const groupe of GROUPES_MODULES) {
  for (const entree of groupe.modules) {
    const cle = definitionDroit(entree.droit).moduleKey;
    if (!ICONES.has(cle)) ICONES.set(cle, entree.icone);
  }
}

export function iconeDuModule(cle: string): CleIcone {
  return ICONES.get(cle) ?? "tableau-de-bord";
}

/**
 * Les modules rangés comme dans la barre latérale : groupe par groupe, dans
 * l'ordre de la carte. Un module absent de la carte termine la liste, sous
 * « Autres ».
 */
export function modulesParGroupe(cles: string[]): { titre: string; cles: string[] }[] {
  const restants = new Set(cles);
  const groupes: { titre: string; cles: string[] }[] = [];
  for (const groupe of GROUPES_MODULES) {
    const duGroupe: string[] = [];
    for (const entree of groupe.modules) {
      const cle = definitionDroit(entree.droit).moduleKey;
      if (restants.has(cle)) {
        duGroupe.push(cle);
        restants.delete(cle);
      }
    }
    if (duGroupe.length) groupes.push({ titre: groupe.titre, cles: duGroupe });
  }
  if (restants.size) groupes.push({ titre: "Autres", cles: [...restants] });
  return groupes;
}
