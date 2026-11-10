import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { accesModules, memberships, organizationModules, rolePermissions, roles } from "@/db/schema";

import { appliquerRestrictions, type NiveauAcces } from "./acces";
import { avecDroitsDeTous, resoudreDroits, type Droit } from "./catalogue";

/**
 * Comptes de l'entreprise qui détiennent un droit — pour savoir qui prévenir
 * quand une dépense attend une approbation.
 *
 * Même résolution que la garde des droits (`garde.ts`), appliquée à tous les
 * membres d'un coup : plafond du rôle, puis modules coupés et niveaux d'accès.
 * L'abonnement en lecture seule n'entre pas en compte : on prévient quand
 * même, l'approbation attendra le renouvellement.
 */
export async function utilisateursAyantDroit(organizationId: string, droit: Droit): Promise<string[]> {
  const membres = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      estProprietaire: memberships.isOwner,
      roleId: memberships.roleId,
      roleCle: roles.key,
    })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif")));
  if (membres.length === 0) return [];

  const [accords, coupes, niveaux] = await Promise.all([
    db
      .select({ roleId: rolePermissions.roleId, cle: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(inArray(rolePermissions.roleId, [...new Set(membres.map((m) => m.roleId))])),
    db
      .select({ cle: organizationModules.moduleKey })
      .from(organizationModules)
      .where(and(eq(organizationModules.organizationId, organizationId), eq(organizationModules.enabled, false))),
    db
      .select({ membershipId: accesModules.membershipId, cle: accesModules.moduleKey, niveau: accesModules.niveau })
      .from(accesModules)
      .where(inArray(accesModules.membershipId, membres.map((m) => m.membershipId))),
  ]);
  const modulesCoupes = new Set(coupes.map((c) => c.cle));

  return membres
    .filter((m) => {
      const duRole = resoudreDroits({
        cleRole: m.roleCle,
        estProprietaire: m.estProprietaire,
        accords: accords.filter((a) => a.roleId === m.roleId).map((a) => a.cle),
      });
      const effectifs = appliquerRestrictions(avecDroitsDeTous(duRole), {
        modulesCoupes,
        niveaux: new Map(niveaux.filter((n) => n.membershipId === m.membershipId).map((n) => [n.cle, n.niveau as NiveauAcces])),
        estProprietaire: m.estProprietaire,
      });
      return effectifs.has(droit);
    })
    .map((m) => m.userId);
}
