import type { Instrumentation } from "next";

/**
 * Démarrage du serveur.
 *
 * Base locale PGlite (`pglite:./.pglite`) : ouverture, migrations et droits.
 * PostgreSQL avec `MIGRATIONS_AU_DEMARRAGE=1` (le VPS) : migrations et droits.
 * Next attend `register` avant la première requête : aucune page ne peut
 * tomber sur une base à moitié prête.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("pglite:")) {
    if (url && process.env.MIGRATIONS_AU_DEMARRAGE === "1") {
      const { migrerAuDemarrage } = await import("./db/demarrage");
      await migrerAuDemarrage();
    }
    return;
  }

  const { ouvrirPglite } = await import("./db/pglite");
  const instance = await ouvrirPglite(url);
  (globalThis as { mariaDb?: unknown }).mariaDb = instance;
}

/**
 * Journalisation des erreurs serveur.
 *
 * Sans elle, un plantage chez le client est invisible : il voit un écran
 * d'erreur, il téléphone, et personne n'a la moindre trace de ce qui s'est
 * passé. Render conserve la sortie standard du service — c'est le journal le
 * plus proche qui existe, et il ne coûte ni dépendance ni compte à ouvrir.
 *
 * Une ligne, un objet JSON. Un journal lisible à l'œil se cherche à la main ;
 * celui-ci se filtre (`evenement:"erreur_requete"`) et s'expédie tel quel vers
 * un collecteur le jour où il en faudra un. Le format ne changera pas, seul le
 * transport.
 *
 * `digest` est la clé de voûte : React le donne aussi à l'écran d'erreur, côté
 * navigateur. Un caissier lit six caractères au téléphone, et la ligne se
 * retrouve dans le journal. Sans ce lien, il faut deviner l'heure exacte d'un
 * incident raconté de mémoire.
 */
export const onRequestError: Instrumentation.onRequestError = (
  erreur,
  requete,
  contexte,
) => {
  // Les en-têtes ne sont PAS journalisés. Ils portent le cookie de session,
  // donc un jeton valide : le journal deviendrait un moyen d'entrer.
  const details = {
    evenement: "erreur_requete",
    horodatage: new Date().toISOString(),
    chemin: requete.path,
    methode: requete.method,
    route: contexte.routePath,
    // `action` désigne une action serveur — un encaissement, une écriture. Une
    // erreur là ne se compare pas à un rendu raté : quelque chose n'a pas été
    // enregistré, et quelqu'un attend devant la caisse.
    nature: contexte.routeType,
    message: erreur instanceof Error ? erreur.message : String(erreur),
    digest:
      typeof erreur === "object" && erreur !== null && "digest" in erreur
        ? String(erreur.digest)
        : undefined,
    pile: erreur instanceof Error ? erreur.stack : undefined,
  };

  // `console.error` et non `console.log` : Render sépare les deux flux, et une
  // erreur noyée dans les requêtes ordinaires n'est plus une alerte.
  console.error(JSON.stringify(details));
};
