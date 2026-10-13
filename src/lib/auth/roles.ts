import "server-only";

import { asc, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { memberships, rolePermissions, roles } from "@/db/schema";
import { type Droit, droitConnu, presetRole } from "@/lib/droits/catalogue";

export interface RoleDeLEntreprise {
  id: string;
  cle: string;
  nom: string;
  description: string | null;
  /**
   * Fourni par Maria Suite : ses droits viennent du code, ils ne se recomposent pas.
   *
   * Déduit de la clé et non de la colonne `is_system`. C'est la clé que regarde
   * `resoudreDroits`, et un écran qui se fierait à la colonne afficherait
   * « 0 droit » sur un rôle qui les ouvre tous — le cas se produit pour les
   * entreprises créées avant que les préréglages ne soient marqués.
   */
  systeme: boolean;
  /** Personnes qui le portent. Un rôle porté ne se supprime pas. */
  membres: number;
  droits: Droit[];
}

/**
 * Les rôles de l'entreprise, avec leurs droits effectifs.
 *
 * La provenance des droits diffère selon le rôle, et c'est délibéré : un rôle
 * préréglé tire les siens du code — ce qui lui vaut d'être enrichi à chaque
 * déploiement sans migration de données — tandis qu'un rôle composé par
 * l'entreprise les tire de `role_permissions`. L'écran ne montre pas cette
 * différence ; il montre juste ce que chaque rôle ouvre.
 */
export async function rolesDeLEntreprise(
  organizationId: string,
): Promise<RoleDeLEntreprise[]> {
  const lignes = await db
    .select({
      id: roles.id,
      cle: roles.key,
      nom: roles.name,
      description: roles.description,
      membres: count(memberships.id),
    })
    .from(roles)
    .leftJoin(memberships, eq(memberships.roleId, roles.id))
    .where(eq(roles.organizationId, organizationId))
    .groupBy(roles.id)
    .orderBy(desc(roles.isSystem), asc(roles.name));

  const avecNature = lignes.map((ligne) => ({
    ...ligne,
    systeme: presetRole(ligne.cle) !== undefined,
  }));

  // Une seule requête pour tous les accords, plutôt qu'une par rôle : la page
  // en affiche une dizaine, et chaque aller-retour compte depuis Abidjan.
  const personnalises = avecNature.filter((r) => !r.systeme).map((r) => r.id);

  const accords =
    personnalises.length > 0
      ? await db
          .select({ roleId: rolePermissions.roleId, cle: rolePermissions.permissionKey })
          .from(rolePermissions)
          .where(inArray(rolePermissions.roleId, personnalises))
      : [];

  const parRole = new Map<string, Droit[]>();
  for (const accord of accords) {
    // Une clé disparue du catalogue ne donne plus rien : la ligne reste en
    // base, elle ne décide plus.
    if (!droitConnu(accord.cle)) continue;
    parRole.set(accord.roleId, [...(parRole.get(accord.roleId) ?? []), accord.cle]);
  }

  return avecNature.map((role) => ({
    ...role,
    droits: role.systeme
      ? [...(presetRole(role.cle)?.droits ?? [])]
      : (parRole.get(role.id) ?? []),
  }));
}

/** Nom affiché du rôle, tel que l'entreprise l'a peut-être renommé. */
export async function nomDuRole(roleId: string | null): Promise<string | null> {
  if (!roleId) return null;
  const [role] = await db.select({ nom: roles.name }).from(roles).where(eq(roles.id, roleId));
  return role?.nom ?? null;
}
