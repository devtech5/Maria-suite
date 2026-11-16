import "server-only";

import { eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import { newId } from "@/lib/ids";

import { normaliserReglages, type ReglagesCalculs } from "./regles";
import { reglagesCalculs } from "./schema";

export interface EtatReglages {
  valeurs: ReglagesCalculs;
  /** Attestés par un responsable ; sinon les valeurs restent « à vérifier ». */
  verifie: boolean;
  verifieLe: Date | null;
  /** Une ligne existe : l'entreprise a déjà réglé quelque chose. */
  personnalises: boolean;
  /** Fuseau de l'entreprise, pour dater l'attestation. */
  fuseau: string;
}

/** Lue une fois par requête : la coque du module et la page la demandent toutes deux. */
export const reglagesCalculsDe = cache(async (organizationId: string): Promise<EtatReglages> => {
  const [r] = await db
    .select({ valeurs: reglagesCalculs.valeurs, verifieLe: reglagesCalculs.verifieLe })
    .from(reglagesCalculs)
    .where(eq(reglagesCalculs.organizationId, organizationId))
    .limit(1);
  const [o] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return {
    valeurs: normaliserReglages(r?.valeurs),
    verifie: Boolean(r?.verifieLe),
    verifieLe: r?.verifieLe ?? null,
    personnalises: Boolean(r),
    fuseau: o?.fuseau ?? "Africa/Abidjan",
  };
});

/**
 * Enregistre les ratios, déjà vérifiés par `verifierReglages`. L'attestation
 * se donne à chaque enregistrement : changer un ratio sans la cocher le
 * remet « à vérifier ».
 */
export async function enregistrerReglagesCalculsPour(organizationId: string, userId: string, valeurs: ReglagesCalculs, atteste: boolean): Promise<void> {
  const ligne = {
    valeurs,
    verifieLe: atteste ? new Date() : null,
    verifieParUserId: atteste ? userId : null,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(reglagesCalculs)
      .values({ id: newId(), organizationId, ...ligne })
      .onConflictDoUpdate({ target: reglagesCalculs.organizationId, set: { ...ligne, updatedAt: new Date(), version: sql`${reglagesCalculs.version} + 1` } });
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "calculs.reglages",
      entityType: "reglages_calculs",
      entityId: organizationId,
      after: { valeurs, atteste },
    });
  });
}
