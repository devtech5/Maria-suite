/**
 * Intervenants d'une tâche, sans base : la référence telle que l'écran
 * l'envoie. `e:<id>` désigne un collaborateur du Personnel, `w:<id>` un
 * intervenant (manœuvre, tâcheron…). Importable depuis le navigateur.
 */

export type RefIntervenant = { employeId: string } | { workerId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lireRef(valeur: unknown): RefIntervenant | null {
  if (typeof valeur !== "string") return null;
  const id = valeur.slice(2);
  if (!UUID.test(id)) return null;
  if (valeur.startsWith("e:")) return { employeId: id };
  if (valeur.startsWith("w:")) return { workerId: id };
  return null;
}

export function valeurRef(ref: RefIntervenant): string {
  return "employeId" in ref ? `e:${ref.employeId}` : `w:${ref.workerId}`;
}

/** Références lues d'un formulaire, sans doublon ni valeur inconnue, 50 au plus. */
export function lireRefs(valeurs: unknown[]): RefIntervenant[] {
  const vues = new Set<string>();
  const refs: RefIntervenant[] = [];
  for (const v of valeurs) {
    const ref = lireRef(v);
    if (!ref) continue;
    const cle = valeurRef(ref);
    if (vues.has(cle)) continue;
    vues.add(cle);
    refs.push(ref);
  }
  return refs.slice(0, 50);
}
