/**
 * Service worker de Maria Suite.
 *
 * Il n'a qu'un but : que l'écran de caisse S'OUVRE sans réseau. Le reste du
 * hors-ligne — la vente elle-même — vit dans IndexedDB, côté application
 * (`src/lib/caisse/file-locale.ts`). Ce fichier ne fait que garantir qu'il y a
 * une application à ouvrir quand la 4G tombe.
 *
 * Sans lui, une caisse hors connexion affiche la page d'erreur du navigateur et
 * toute la file locale devient inaccessible : le magasin s'arrête, alors que
 * tout ce qu'il faut pour vendre est déjà sur l'appareil.
 *
 * Stratégies, et pourquoi :
 *
 *   · navigation  → réseau d'abord, cache en secours. Une caisse en ligne doit
 *     voir les prix du jour, pas ceux d'hier ; hors ligne, la dernière version
 *     connue vaut infiniment mieux que rien.
 *
 *   · /_next/static → cache d'abord. Ces fichiers portent une empreinte dans
 *     leur nom : ils ne changent jamais sous une même URL.
 *
 *   · POST et actions serveur → JAMAIS interceptés. Un encaissement rejoué
 *     depuis un cache serait un double encaissement, et le service worker n'a
 *     rien à dire sur une écriture.
 */

const VERSION = "maria-suite-v1";
const COQUE = `coque-${VERSION}`;
const STATIQUE = `statique-${VERSION}`;

/** Ce qui doit être disponible même au tout premier passage hors ligne. */
const PRECHARGE = ["/caisse"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(COQUE)
      .then((cache) => cache.addAll(PRECHARGE))
      // Un préchargement raté ne doit pas empêcher l'installation : le service
      // worker servira quand même, et remplira son cache au premier passage.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((nom) => !nom.endsWith(VERSION))
            .map((nom) => caches.delete(nom)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;

  // Tout ce qui écrit passe droit. Une action serveur mise en cache serait une
  // vente rejouée.
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Le payload React Server Components ne se met pas en cache utilement : il
  // dépend de la session et se périme à la première navigation.
  if (url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(depuisLeCache(requete, STATIQUE));
    return;
  }

  if (requete.mode === "navigate") {
    event.respondWith(reseauPuisCache(requete, COQUE));
  }
});

/** Cache d'abord : le fichier porte son empreinte, il ne bougera pas. */
async function depuisLeCache(requete, nomCache) {
  const cache = await caches.open(nomCache);
  const connu = await cache.match(requete);
  if (connu) return connu;

  const reponse = await fetch(requete);
  if (reponse.ok) cache.put(requete, reponse.clone());
  return reponse;
}

/**
 * Réseau d'abord, dernière version connue en secours.
 *
 * La page servie hors ligne peut être vieille de quelques heures. C'est
 * assumé : le catalogue et les prix bougent lentement, alors qu'un magasin qui
 * ne peut pas encaisser perd ses clients immédiatement.
 */
async function reseauPuisCache(requete, nomCache) {
  const cache = await caches.open(nomCache);

  try {
    const reponse = await fetch(requete);
    if (reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch {
    const connu = await cache.match(requete);
    if (connu) return connu;

    // Ni réseau ni cache : on tente au moins la caisse, qui est la seule page
    // dont l'indisponibilité arrête le commerce.
    const secours = await cache.match("/caisse");
    if (secours) return secours;

    return new Response(
      "<!doctype html><meta charset=utf-8><title>Hors ligne</title>" +
        "<p style=\"font-family:system-ui;padding:2rem\">Hors ligne, et cette page " +
        "n'a pas encore été enregistrée sur cet appareil.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
