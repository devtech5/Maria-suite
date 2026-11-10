import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema/tenancy";

import { reglementVersions } from "./schema";

export const CLE_MODULE_REGLEMENT = "reglement";

/**
 * La version en vigueur que ce compte n'a pas encore acceptée, ou null.
 *
 * Appelée par `exigerEntreprise` à chaque page et à chaque action : une seule
 * requête indexée, qui tient compte du fuseau de l'entreprise et du module
 * coupé (« Utilisateurs › Modules ») — un règlement coupé ne bloque personne.
 *
 * Fichier à part, sans journal ni notification : la couche d'accès l'importe,
 * et le journal importe la couche d'accès.
 */
export async function versionAAccepter(organizationId: string, userId: string): Promise<string | null> {
  const [ligne] = await db
    .select({
      id: reglementVersions.id,
      accepte: sql<boolean>`exists (select 1 from reglement_acceptations a where a.version_id = ${reglementVersions.id} and a.user_id = ${userId})`,
    })
    .from(reglementVersions)
    .innerJoin(organizations, eq(organizations.id, reglementVersions.organizationId))
    .where(
      and(
        eq(reglementVersions.organizationId, organizationId),
        eq(reglementVersions.statut, "publie"),
        isNull(reglementVersions.deletedAt),
        sql`${reglementVersions.dateEffet} <= (now() at time zone coalesce(nullif(${organizations.timezone}, ''), 'Africa/Abidjan'))::date`,
        sql`not exists (select 1 from organization_modules om where om.organization_id = ${reglementVersions.organizationId} and om.module_key = ${CLE_MODULE_REGLEMENT} and not om.enabled)`,
      ),
    )
    .orderBy(desc(reglementVersions.dateEffet), desc(reglementVersions.numero))
    .limit(1);
  return ligne && !ligne.accepte ? ligne.id : null;
}
