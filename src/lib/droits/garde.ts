import "server-only";

import { cache } from "react";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { accesModules, accesModulesRoles, memberships, organizationModules, rolePermissions } from "@/db/schema";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { SessionActive } from "@/lib/auth/session";
import { appliquerRestrictions, type NiveauAcces } from "./acces";
import { type Droit, avecDroitsDeTous, definitionDroit, presetRole, resoudreDroits } from "./catalogue";

export type SessionEntreprise = SessionActive & { organizationId: string };

/**
 * Garde des droits.
 *
 * Une règle, toujours la même : **l'écran cache, l'action refuse.** Masquer un
 * bouton n'est pas une protection — une action serveur est une route HTTP, et
 * quiconque tient une session peut l'appeler à la main. Toute écriture vérifie
 * donc son droit chez elle, indépendamment de ce que l'interface a bien voulu
 * afficher.
 *
 * Trois formes selon l'appelant :
 *
 *   · `peut`        — booléen, pour décider d'afficher (barre du haut, boutons)
 *   · `refusDroit`  — message d'erreur, pour une action à état de formulaire
 *   · `exigerDroit` — lève, pour une action sans état : l'appel n'aurait pas dû
 *                     partir, il n'y a pas d'interface pour en rendre compte.
 */

/**
 * Droits effectifs de la session courante, dédupliqués pour la durée du rendu.
 *
 * Deux étages : le rôle donne le plafond (dans le code pour un rôle préréglé,
 * dans `role_permissions` pour un rôle composé), puis les restrictions le
 * resserrent — modules coupés pour l'entreprise, niveau de la personne par
 * module (`src/lib/droits/acces.ts`). Une restriction ne peut rien ajouter.
 */
export const droitsActifs = cache(async (): Promise<Set<Droit>> => {
  // Le verrou et le règlement intérieur ne sont pas affaire de droits : ils
  // se contrôlent là où la session est exigée, page ou action. Les vérifier
  // ici aussi fermerait la salle Meeting, qui en est exemptée, dès qu'un
  // onglet de gestion voisin se voile.
  const session = await exigerEntreprise({ malgreVerrou: true, malgreReglement: true });
  const [duRole, restrictions] = await Promise.all([droitsDuRole(session), restrictionsDe(session)]);
  return appliquerRestrictions(avecDroitsDeTous(duRole), restrictions);
});

/** Droits que le rôle accorde, avant toute restriction par module. */
async function droitsDuRole(session: SessionEntreprise): Promise<Set<Droit>> {
  if (session.estProprietaire || presetRole(session.roleCle)) {
    return resoudreDroits({
      cleRole: session.roleCle,
      estProprietaire: session.estProprietaire,
    });
  }

  const accords = session.roleId
    ? await db
        .select({ cle: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, session.roleId))
    : [];

  return resoudreDroits({
    cleRole: session.roleCle,
    estProprietaire: false,
    accords: accords.map((a) => a.cle),
  });
}

/**
 * Modules coupés pour l'entreprise, désactivés pour le rôle, et niveaux de
 * la personne. Trois requêtes indexées par rendu, dédupliquées par `cache`.
 */
async function restrictionsDe(session: SessionEntreprise) {
  const [coupes, niveaux, duRole] = await Promise.all([
    db
      .select({ cle: organizationModules.moduleKey })
      .from(organizationModules)
      .where(
        and(
          eq(organizationModules.organizationId, session.organizationId),
          eq(organizationModules.enabled, false),
        ),
      ),
    session.estProprietaire
      ? Promise.resolve([] as { cle: string; niveau: NiveauAcces }[])
      : db
          .select({ cle: accesModules.moduleKey, niveau: accesModules.niveau })
          .from(accesModules)
          .innerJoin(memberships, eq(memberships.id, accesModules.membershipId))
          .where(
            and(
              eq(memberships.organizationId, session.organizationId),
              eq(memberships.userId, session.userId),
            ),
          ),
    session.estProprietaire || !session.roleId
      ? Promise.resolve([] as { cle: string }[])
      : db
          .select({ cle: accesModulesRoles.moduleKey })
          .from(accesModulesRoles)
          .where(
            and(
              eq(accesModulesRoles.organizationId, session.organizationId),
              eq(accesModulesRoles.roleId, session.roleId),
            ),
          ),
  ]);

  return {
    modulesCoupes: new Set(coupes.map((c) => c.cle)),
    modulesRole: new Set(duRole.map((r) => r.cle)),
    niveaux: new Map(niveaux.map((n) => [n.cle, n.niveau])),
    estProprietaire: session.estProprietaire,
  };
}

/** Vrai si la session courante détient ce droit. */
export async function peut(droit: Droit): Promise<boolean> {
  return (await droitsActifs()).has(droit);
}

/**
 * Exige un droit et rend la session. Lève si le droit manque.
 *
 * Pour les actions qui ne rendent pas d'état : un appel non autorisé y est soit
 * un bogue d'interface, soit une tentative. Dans les deux cas il n'y a rien à
 * afficher de mieux qu'une erreur.
 */
export async function exigerDroit(droit: Droit): Promise<SessionEntreprise> {
  const session = await exigerEntreprise();
  if (!(await peut(droit))) throw new Error(messageRefus(droit));
  return session;
}

/**
 * Contrôle un droit pour une action à état de formulaire.
 *
 * Rend l'objet d'erreur prêt à retourner, ou `null` si le droit est là. Le
 * formulaire affiche le refus là où il affiche déjà ses erreurs de saisie,
 * plutôt que de faire éclater une page d'erreur au visage du caissier.
 */
export async function refusDroit(droit: Droit): Promise<{ erreur: string } | null> {
  if (await peut(droit)) return null;
  return { erreur: messageRefus(droit) };
}

/**
 * Le message nomme le droit manquant, pas seulement le refus.
 *
 * « Vous n'avez pas les droits » n'apprend rien à personne : c'est le gérant
 * qui devra corriger, et il lui faut savoir quoi ouvrir.
 */
export function messageRefus(droit: Droit): string {
  return `Votre rôle ne permet pas cette opération : ${definitionDroit(droit).libelle.toLowerCase()}. Demandez ce droit au responsable de l'entreprise.`;
}
