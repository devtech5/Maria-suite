import "server-only";

import { definitionDroit, type Droit } from "@/lib/droits/catalogue";
import { droitsActifs } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";
import { RAPPORTS_ACHATS } from "@/modules/achats/rapports";
import { RAPPORTS_ACTIFS } from "@/modules/actifs/rapports";
import { RAPPORTS_COMPTABILITE } from "@/modules/comptabilite/rapports";
import { RAPPORTS_COMMERCIAL } from "@/modules/facturation/rapports";
import { RAPPORTS_MARCHES } from "@/modules/marches/rapports";
import { RAPPORTS_MISSIONS } from "@/modules/missions/rapports";
import { RAPPORTS_PAIE } from "@/modules/paie/rapports";
import { RAPPORTS_PARC_AUTO } from "@/modules/parc-auto/rapports";
import { RAPPORTS_PARC_INFORMATIQUE } from "@/modules/parc-informatique/rapports";
import { RAPPORTS_PLANNING } from "@/modules/planning/rapports";
import { RAPPORTS_PRESENCES } from "@/modules/presences/rapports";
import { RAPPORTS_PRESTATAIRES } from "@/modules/prestataires/rapports";
import { RAPPORTS_PROJETS } from "@/modules/projets/rapports";
import { RAPPORTS_STOCK } from "@/modules/stock/rapports";
import { RAPPORTS_TRESORERIE } from "@/modules/tresorerie/rapports";

import type { DefinitionRapport } from "./types";

/**
 * Tous les rapports de la plateforme. Un module en ajoute en exportant sa
 * liste depuis son `rapports.ts` et en la rangeant ici, dans l'ordre où les
 * rubriques doivent apparaître.
 */
export const RAPPORTS: readonly DefinitionRapport[] = [
  ...RAPPORTS_COMMERCIAL,
  ...RAPPORTS_ACHATS,
  ...RAPPORTS_PRESTATAIRES,
  ...RAPPORTS_MARCHES,
  ...RAPPORTS_STOCK,
  ...RAPPORTS_PROJETS,
  ...RAPPORTS_MISSIONS,
  ...RAPPORTS_TRESORERIE,
  ...RAPPORTS_COMPTABILITE,
  ...RAPPORTS_PAIE,
  ...RAPPORTS_PRESENCES,
  ...RAPPORTS_PLANNING,
  ...RAPPORTS_ACTIFS,
  ...RAPPORTS_PARC_AUTO,
  ...RAPPORTS_PARC_INFORMATIQUE,
];

export function rapport(cle: string): DefinitionRapport | undefined {
  return RAPPORTS.find((r) => r.cle === cle);
}

/** Les rapports qu'une session peut ouvrir : module ouvert et droit accordé. */
export function rapportsAccessibles(droits: Iterable<Droit>): DefinitionRapport[] {
  const accordes = new Set(droits);
  return RAPPORTS.filter((r) => accordes.has(r.droit) && moduleOuvert(definitionDroit(r.droit).moduleKey));
}

/**
 * Lien « Rapports » de la barre d'un module, ou `null` quand la session n'a
 * aucun rapport de ce module à ouvrir. Plusieurs clés : la page Commercial
 * porte à la fois la facturation et la caisse.
 */
export async function lienRapports(...modules: string[]): Promise<string | null> {
  const droits = await droitsActifs();
  if (!droits.has("rapports.consulter")) return null;
  const accessibles = rapportsAccessibles(droits).filter((r) => modules.includes(r.module));
  if (accessibles.length === 0) return null;
  return `/rapports?module=${modules.join(",")}`;
}
