import "server-only";

import { env } from "@/env";
import { MODULES, estLivre } from "@/modules/registry";

/**
 * Garde des modules.
 *
 * Elle répond à une question que la garde des droits ne pose pas : ce module
 * a-t-il quelque chose de vrai à montrer ? Les deux se cumulent, dans cet
 * ordre — un module fermé n'est pas un refus d'accès, c'est un module qui
 * n'existe pas encore, et le dire autrement embrouille l'utilisateur.
 *
 * Une seule variable commande l'ouverture des modules non livrés :
 *
 *   · `MODULES_APERCU` renseignée — la liste fait foi, en développement comme
 *     en production. C'est ce qui permet de voir localement exactement ce que
 *     le client verra, sans construire ni déployer.
 *   · vide — le développement ouvre tout, la production ne s'ouvre à rien. On
 *     ne construit pas un écran qu'on ne peut pas atteindre, et on ne livre
 *     pas un chiffre qu'on a inventé.
 */

/** Le transverse — membres, paramètres, abonnement — n'est pas un module. */
const TRANSVERSE = "organisation";

function apercus(): Set<string> {
  return new Set(
    env.MODULES_APERCU.split(",")
      .map((cle) => cle.trim())
      .filter(Boolean),
  );
}

/** Vrai si le module s'ouvre sur cette instance. */
export function moduleOuvert(cle: string): boolean {
  if (cle === TRANSVERSE) return true;
  if (estLivre(cle)) return true;

  const ouverts = apercus();
  if (ouverts.size === 0) return env.NODE_ENV === "development";

  return ouverts.has("*") || ouverts.has(cle);
}

/**
 * Les clés ouvertes sur cette instance.
 *
 * Calculé sur le serveur et descendu à la barre du haut : `env` n'existe pas
 * dans le navigateur, et la liste des modules livrés n'a pas à faire l'aller-
 * retour dans le paquet client.
 */
export function modulesOuverts(): string[] {
  return MODULES.map((m) => m.key).filter(moduleOuvert);
}

/**
 * Vrai quand l'instance accepte d'afficher des jeux d'essai.
 *
 * Sert à ce qui n'appartient à aucun module en particulier — le tableau de
 * bord, qui agrège des alertes de partout. Le même interrupteur que
 * `moduleOuvert`, pour qu'une instance ne puisse pas fermer les modules
 * fictifs tout en gardant leurs alertes en page d'accueil.
 */
export function apercuActif(): boolean {
  return MODULES.some((m) => !estLivre(m.key) && moduleOuvert(m.key));
}
