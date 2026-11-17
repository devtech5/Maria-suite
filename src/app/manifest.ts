import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installable (PWA).
 *
 * Servi par Next à `/manifest.webmanifest` et lié dans chaque page. Avec le
 * service worker (`public/sw.js`), il rend Maria Suite installable sur
 * l'écran d'accueil d'un téléphone ou comme application de bureau : fenêtre
 * à part, sans barre d'adresse, icône de la marque.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Maria Suite",
    short_name: "Maria Suite",
    description: "ERP de MARIA GROUP SARL.",
    lang: "fr",
    start_url: "/accueil",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8fa",
    theme_color: "#162E49",
    icons: [
      { src: "/pwa/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icone-masquable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
