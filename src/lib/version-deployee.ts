/**
 * Erreurs dues à une ancienne version restée dans l'onglet.
 *
 * Chaque mise en production remplace le code servi. Un onglet ouvert avant
 * garde l'ancien : au clic suivant, il demande un morceau de code qui
 * n'existe plus, ou une action serveur dont l'identifiant a changé, et
 * l'écran tombe alors que rien n'est cassé — un rechargement suffit.
 *
 * `deploymentId` (next.config.ts) évite la plupart de ces cas : Next recharge
 * la page dès qu'il voit la version changer. Ce qui passe malgré tout est
 * reconnu ici, et l'écran d'erreur recharge une fois de lui-même.
 */

const MOTIFS = [/ChunkLoadError/i, /Loading (CSS )?chunk [\w-]+ failed/i, /Failed to find Server Action/i, /Failed to fetch dynamically imported module/i];

/** Vrai si l'erreur trahit une version périmée plutôt qu'une vraie panne. */
export function erreurDeVersion(erreur: { name?: string; message?: string; digest?: string }): boolean {
  const texte = `${erreur.name ?? ""} ${erreur.message ?? ""}`;
  return MOTIFS.some((m) => m.test(texte));
}

/** Un seul rechargement automatique par minute : une vraie panne ne doit pas faire boucler la page. */
export const DELAI_ENTRE_RECHARGEMENTS_MS = 60_000;

export function rechargementPermis(dernier: number | null, maintenant: number): boolean {
  return dernier === null || maintenant - dernier >= DELAI_ENTRE_RECHARGEMENTS_MS;
}
