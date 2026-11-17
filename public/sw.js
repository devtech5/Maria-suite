/**
 * Service worker de Maria Suite (application installable).
 *
 * Ce qu'il garde : les fichiers statiques versionnés (`/_next/static/`), les
 * icônes, la marque, les polices, et la page `/hors-ligne.html`.
 *
 * Ce qu'il ne garde JAMAIS : une page de gestion, une réponse d'API, une
 * pièce jointe. Ce sont des données de l'entreprise, souvent sur un appareil
 * partagé ; elles repartent toujours du réseau. Sans réseau, une navigation
 * reçoit la page hors ligne au lieu de l'écran d'erreur du navigateur.
 *
 * Changer VERSION purge les anciens caches à l'activation.
 */

const VERSION = "maria-v1";
const CACHE_STATIQUE = `${VERSION}-statique`;
const PAGE_HORS_LIGNE = "/hors-ligne.html";
const PRECHARGE = [PAGE_HORS_LIGNE, "/pwa/icone-192.png", "/pwa/icone-512.png"];
const PREFIXES_STATIQUES = ["/_next/static/", "/pwa/", "/marque/", "/polices/"];
// Un déploiement produit de nouveaux fichiers statiques : on borne le cache.
const MAX_ENTREES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIQUE);
      await cache.addAll(PRECHARGE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const cle of await caches.keys()) {
        if (!cle.startsWith(VERSION)) await caches.delete(cle);
      }
      await self.clients.claim();
    })(),
  );
});

async function borner(cache) {
  const cles = await cache.keys();
  for (let i = 0; i < cles.length - MAX_ENTREES; i++) await cache.delete(cles[i]);
}

async function depuisLeCache(requete) {
  const cache = await caches.open(CACHE_STATIQUE);
  const trouve = await cache.match(requete);
  if (trouve) return trouve;
  const reponse = await fetch(requete);
  if (reponse.ok && reponse.type === "basic") {
    await cache.put(requete, reponse.clone());
    await borner(cache);
  }
  return reponse;
}

async function navigation(requete) {
  try {
    return await fetch(requete);
  } catch {
    const cache = await caches.open(CACHE_STATIQUE);
    return (await cache.match(PAGE_HORS_LIGNE)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (requete.mode === "navigate") {
    event.respondWith(navigation(requete));
    return;
  }
  if (PREFIXES_STATIQUES.some((prefixe) => url.pathname.startsWith(prefixe))) {
    event.respondWith(depuisLeCache(requete));
  }
  // Tout le reste (API, fichiers, actions serveur, RSC) : réseau, sans cache.
});
