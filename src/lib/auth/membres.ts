import "server-only";

import { and, asc, desc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { memberships, roles, users } from "@/db/schema";

export interface Membre {
  membershipId: string;
  userId: string;
  nom: string;
  /** Identifiant de connexion. Nul pour un compte antérieur au passage à l'e-mail. */
  email: string | null;
  roleId: string;
  roleCle: string;
  roleNom: string;
  statut: "invite" | "actif" | "suspendu";
  proprietaire: boolean;
  rejointLe: Date | null;
}

/**
 * Les personnes qui ouvrent le logiciel dans cette entreprise.
 *
 * À ne pas confondre avec le personnel : un membre est un compte de connexion.
 * Le salarié déclaré vit dans `employees`, l'intervenant payé à la tâche dans
 * `workers`, et ni l'un ni l'autre n'a besoin d'un accès pour être payé.
 *
 * Le propriétaire vient en tête : c'est lui qui répond de l'entreprise, et
 * c'est la ligne qu'on cherche quand on ouvre l'écran pour vérifier qui a la
 * main.
 */
export async function listerMembres(organizationId: string): Promise<Membre[]> {
  return db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      nom: users.fullName,
      email: users.email,
      roleId: roles.id,
      roleCle: roles.key,
      roleNom: roles.name,
      statut: memberships.status,
      proprietaire: memberships.isOwner,
      rejointLe: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(desc(memberships.isOwner), asc(users.fullName));
}

export interface RoleAttribuable {
  id: string;
  cle: string;
  nom: string;
  description: string | null;
  /** Fourni par Maria Suite : ses droits viennent du code, il ne se recompose pas. */
  systeme: boolean;
}

/**
 * Rôles que l'entreprise peut attribuer.
 *
 * Uniquement les siens : les rôles sont copiés dans chaque entreprise à sa
 * création, un rôle d'ailleurs n'a rien à faire dans la liste.
 *
 * Le rôle de propriétaire en est retiré. Il n'y a qu'un propriétaire, celui
 * qui a créé l'entreprise, et sa qualité tient au rattachement (`is_owner`),
 * pas au rôle. Le laisser dans la liste permettrait à un gérant de fabriquer
 * un second détenteur de tous les droits — abonnement compris — sans que
 * personne ne l'ait décidé. Céder son entreprise est un geste à part, qui
 * viendra avec sa propre confirmation.
 */
export async function rolesAttribuables(
  organizationId: string,
): Promise<RoleAttribuable[]> {
  return db
    .select({
      id: roles.id,
      cle: roles.key,
      nom: roles.name,
      description: roles.description,
      systeme: roles.isSystem,
    })
    .from(roles)
    .where(
      and(eq(roles.organizationId, organizationId), ne(roles.key, "proprietaire")),
    )
    .orderBy(desc(roles.isSystem), asc(roles.name));
}

/**
 * Un rattachement de cette entreprise, relu depuis la base.
 *
 * Toute action sur un membre passe par ici avant d'écrire : l'identifiant
 * arrive du navigateur, et rien ne garantit qu'il désigne un membre de
 * l'entreprise où l'on travaille. Sans ce contrôle, un identifiant deviné
 * suffirait à promouvoir quelqu'un chez le voisin.
 */
export async function rattachementDe(
  organizationId: string,
  membershipId: string,
): Promise<{
  id: string;
  userId: string;
  roleId: string;
  proprietaire: boolean;
} | null> {
  const [ligne] = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      roleId: memberships.roleId,
      proprietaire: memberships.isOwner,
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.organizationId, organizationId),
      ),
    );

  return ligne ?? null;
}

/**
 * Le compte n'appartient-il qu'à cette entreprise ?
 *
 * Condition pour qu'un responsable puisse lui redonner un mot de passe. Sans
 * elle, le gérant d'une boutique pourrait réinitialiser le mot de passe d'une
 * personne qui possède par ailleurs sa propre entreprise — et entrer chez elle.
 */
export async function compteExclusifA(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const [ailleurs] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), ne(memberships.organizationId, organizationId)),
    )
    .limit(1);

  return !ailleurs;
}
