import { GROUPES_MODULES } from "@/lib/navigation";

import { CHAPITRES_EQUIPE } from "./chapitres-equipe";
import { CHAPITRES_GESTION } from "./chapitres-gestion";
import { CHAPITRES_TOUS } from "./chapitres-tous";
import type { Chapitre } from "./regles";

/** Rang de chaque entrée dans le menu : le guide se lit dans le même ordre. */
const RANG_MENU = new Map(GROUPES_MODULES.flatMap((g) => g.modules).map((m, i) => [m.href, i]));

/**
 * Tous les chapitres du guide : ceux de tous d'abord, puis un par entrée du
 * menu, dans l'ordre du menu. Une entrée absente du menu passe en dernier.
 */
export const CHAPITRES: Chapitre[] = [
  ...CHAPITRES_TOUS,
  ...[...CHAPITRES_EQUIPE, ...CHAPITRES_GESTION].sort(
    (a, b) => (RANG_MENU.get(a.entree ?? "") ?? Number.MAX_SAFE_INTEGER) - (RANG_MENU.get(b.entree ?? "") ?? Number.MAX_SAFE_INTEGER),
  ),
];

const PAR_CLE = new Map(CHAPITRES.map((c) => [c.cle, c]));

export function chapitre(cle: string): Chapitre | undefined {
  return PAR_CLE.get(cle);
}

/** Racine de menu de chaque entrée, pour situer le « ? » d'une page. */
export const RACINES = new Map(GROUPES_MODULES.flatMap((g) => g.modules).map((m) => [m.href, m.racine]));
