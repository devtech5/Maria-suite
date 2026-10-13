import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Maria Suite",
    template: "%s · Maria Suite",
  },
  description:
    "ERP et point de vente de MARIA GROUP SARL. Encaisse sans connexion.",
};

export const viewport: Viewport = {
  // La caisse tourne sur tablette : le zoom accidentel pendant l'encaissement
  // déplace les touches sous les doigts du caissier.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0E5E6B",
};

/**
 * Restaure le thème choisi avant le premier rendu.
 *
 * Exécuté en ligne dans le <head>, donc avant que la page ne s'affiche : lu
 * après, l'utilisateur verrait le thème clair une fraction de seconde avant de
 * basculer en sombre. Sur une caisse qu'on rouvre trente fois par jour, ce
 * clignotement se remarque.
 */
const RESTAURER_THEME = `try{var t=localStorage.getItem('maria-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: RESTAURER_THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
