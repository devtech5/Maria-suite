/**
 * Service worker retiré.
 *
 * Il servait l'écran de caisse hors connexion ; la caisse a quitté la
 * plateforme (migration 0074). Un navigateur qui l'avait installé vient
 * chercher sa mise à jour ici : cette version vide ses caches et se
 * désinscrit, et les pages repartent du réseau, comme partout ailleurs.
 * Sans elle, l'ancien service worker resterait actif indéfiniment.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const cle of await caches.keys()) await caches.delete(cle);
      await self.registration.unregister();
    })(),
  );
});
