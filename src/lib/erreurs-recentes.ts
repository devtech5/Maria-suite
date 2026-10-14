/**
 * Les dernières erreurs serveur, gardées en mémoire, retrouvables par leur
 * `digest`.
 *
 * L'écran d'erreur ne montre qu'un code : React retire le message côté
 * navigateur, et c'est voulu — une erreur de pilote PostgreSQL peut citer une
 * table ou une valeur. Le message complet part au journal du conteneur
 * (`instrumentation.ts`), mais ce journal vit dans Dokploy, loin de celui qui
 * a le problème sous les yeux. Ce registre le rend au PROPRIÉTAIRE connecté,
 * sur l'écran même, par `/api/erreurs/<digest>`.
 *
 * En mémoire et borné : rien en base (la base est peut-être justement ce qui
 * a échoué), et un redémarrage efface tout, ce qui convient — c'est un outil
 * de dépannage immédiat, pas un historique. `globalThis`, parce que
 * l'instrumentation et les routes sont deux paquets distincts qui ne
 * partagent pas leurs modules.
 */

export interface ErreurRecente {
  digest: string;
  message: string;
  chemin: string;
  horodatage: string;
}

/** Assez pour une matinée d'incidents, trop peu pour peser. */
const CAPACITE = 50;
/** Un message de pilote peut citer une requête entière : on la borne. */
const LONGUEUR_MAX = 2000;

const registre = globalThis as { mariaErreurs?: ErreurRecente[] };

export function enregistrerErreur(erreur: ErreurRecente): void {
  const liste = (registre.mariaErreurs ??= []);
  liste.push({ ...erreur, message: erreur.message.slice(0, LONGUEUR_MAX) });
  if (liste.length > CAPACITE) liste.splice(0, liste.length - CAPACITE);
}

export function erreurParDigest(digest: string): ErreurRecente | null {
  const liste = registre.mariaErreurs ?? [];
  for (let i = liste.length - 1; i >= 0; i--) {
    if (liste[i].digest === digest) return liste[i];
  }
  return null;
}
