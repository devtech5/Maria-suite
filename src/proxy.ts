import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_SESSION } from "@/lib/auth/session";

/**
 * Filtrage optimiste des routes protégées.
 *
 * Fichier `proxy.ts` et non `middleware.ts` : la convention `middleware` est
 * dépréciée depuis Next 16 et renommée.
 *
 * Ce filtre ne vérifie QUE la présence du cookie. Il ne consulte pas la base,
 * délibérément : il s'exécute sur chaque requête, préchargements compris, et
 * une requête base à chaque navigation coûterait plus qu'elle ne protège.
 *
 * Un cookie présent ne prouve donc rien — il peut porter un jeton révoqué,
 * expiré ou inventé de toutes pièces. La vérification qui engage quelque chose
 * est celle de `src/lib/auth/dal.ts`, au plus près des données. Ce fichier
 * évite seulement d'afficher une page de gestion à quelqu'un qui n'a
 * manifestement pas de session.
 */

const ROUTES_PUBLIQUES = ["/connexion"];

/**
 * Ouvertes à tous, avec ou sans session : le lien de réinitialisation reçu
 * par e-mail doit marcher même sur un téléphone resté connecté.
 */
const ROUTES_LIBRES = ["/mot-de-passe-oublie", "/reinitialiser", "/consulter/", "/desinscription/", "/avis/", "/api/video/"];

export default function proxy(requete: NextRequest) {
  const chemin = requete.nextUrl.pathname;
  const aUnCookie = Boolean(requete.cookies.get(COOKIE_SESSION)?.value);
  const estPublique = ROUTES_PUBLIQUES.some((route) => chemin.startsWith(route));
  if (ROUTES_LIBRES.some((route) => chemin.startsWith(route))) return NextResponse.next();

  if (!aUnCookie && !estPublique) {
    const destination = new URL("/connexion", requete.nextUrl);
    // Mémorise la page demandée pour y revenir après authentification.
    if (chemin !== "/") destination.searchParams.set("suite", chemin);
    return NextResponse.redirect(destination);
  }

  if (aUnCookie && estPublique) {
    // Cookie d'une session morte : l'application l'a constaté et renvoie ici.
    // On l'efface et on sert la connexion — au pire, ce lien déconnecte le
    // navigateur qui le suit, ce que fait déjà le bouton de déconnexion.
    if (requete.nextUrl.searchParams.has("expiree")) {
      const reponse = NextResponse.next();
      reponse.cookies.delete(COOKIE_SESSION);
      return reponse;
    }
    return NextResponse.redirect(new URL("/accueil", requete.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Sans matcher, le filtre s'appliquerait aussi aux fichiers statiques et
   * bloquerait le chargement des feuilles de style et des images sur la page
   * de connexion elle-même.
   *
   * `/api/health` reste hors filtre : une sonde de disponibilité qui exige
   * d'être authentifié ne sonde plus rien.
   */
  matcher: ["/((?!_next/static|_next/image|api/health|favicon.ico|.*\\..*).*)"],
};
