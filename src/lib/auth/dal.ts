import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { moduleOuvert } from "@/lib/modules/garde";
import { CLE_MODULE_REGLEMENT, versionAAccepter } from "@/modules/reglement/garde";

import { CONNEXION_EXPIREE, lireSession, type SessionActive } from "./session";

/**
 * Couche d'accès : c'est ICI que se vérifie l'authentification, pas ailleurs.
 *
 * Le fichier `proxy.ts` se contente d'une vérification optimiste sur la
 * présence du cookie, parce qu'il s'exécute sur chaque route, préchargements
 * compris, et qu'y placer une requête base coûterait à chaque navigation.
 * Un cookie présent ne prouve rien : il peut porter un jeton révoqué, expiré
 * ou inventé. La seule vérification qui engage quelque chose est celle-ci.
 *
 * `cache` de React déduplique l'appel pour la durée d'un rendu : une page qui
 * vérifie la session dans son layout, sa page et trois composants ne fait
 * qu'une requête.
 */
export const session = cache(lireSession);

export interface OptionsSession {
  /**
   * Sert la requête même si l'écran est verrouillé. Réservé à la salle
   * Meeting : on y écoute sans toucher la souris, et une réunion coupée parce
   * qu'un onglet de gestion voisin s'est voilé ferait perdre le fil à tous.
   */
  malgreVerrou?: boolean;
  /**
   * Sert la requête même si le règlement intérieur en vigueur n'est pas
   * encore accepté. Réservé à l'écran de lecture lui-même, à la garde des
   * droits et aux actions de la salle Meeting : une version entrée en vigueur
   * pendant une réunion ne doit pas la couper.
   */
  malgreReglement?: boolean;
}

/**
 * Version du règlement à accepter avant tout, dédupliquée pour la durée du
 * rendu. Null si le module n'est pas ouvert, ou si tout est accepté.
 */
const reglementEnAttente = cache(async (organizationId: string, userId: string): Promise<string | null> =>
  moduleOuvert(CLE_MODULE_REGLEMENT) ? versionAAccepter(organizationId, userId) : null,
);

/** L'écran où se lit et s'accepte le règlement en vigueur. */
export const LECTURE_REGLEMENT = "/lecture-reglement";

/**
 * Exige une session. Redirige vers la connexion sinon.
 *
 * À appeler dans tout layout, page ou action qui touche des données d'entreprise.
 */
export async function exigerSession(options: OptionsSession = {}): Promise<SessionActive> {
  const active = await session();
  if (!active) redirect(CONNEXION_EXPIREE);
  // Un mot de passe provisoire est connu de celui qui l'a donné : tant qu'il
  // n'est pas remplacé, le compte n'ouvre que l'écran de changement.
  if (active.doitChangerMotDePasse) redirect("/mot-de-passe");
  // Verrouillée après inactivité : rien ne se sert avant le mot de passe,
  // ni page ni action. Le voile du navigateur ne suffit pas — recharger la
  // page l'effacerait.
  if (active.verrouillee && !options.malgreVerrou) redirect("/verrouille");
  return active;
}

/**
 * Exige une session ET une entreprise active.
 *
 * Maria Suite ne sert qu'une entreprise : la session la sélectionne d'elle-même.
 * Un compte authentifié sans entreprise est un compte dont l'accès a été
 * révoqué ; il est renvoyé vers l'écran qui l'explique.
 */
export async function exigerEntreprise(options: OptionsSession = {}): Promise<
  SessionActive & { organizationId: string }
> {
  const active = await exigerSession(options);
  if (!active.organizationId) redirect("/sans-acces");
  // Règlement intérieur : à la première connexion et à chaque nouvelle
  // version, rien ne s'ouvre avant « J'ai lu et j'accepte ». Contrôlé ici,
  // à chaque page et à chaque action, et non dans un layout : un layout ne
  // se rejoue pas d'une page à l'autre.
  if (!options.malgreReglement && (await reglementEnAttente(active.organizationId, active.userId))) redirect(LECTURE_REGLEMENT);
  return active as SessionActive & { organizationId: string };
}
