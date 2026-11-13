import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { commerciaux } from "@/modules/commerciaux/schema";

import type { PlanProspection } from "./schema";

/**
 * Qui voit quel plan : la supervision, tous ; un commercial, les siens —
 * ceux de la fiche commercial liée à son compte. Même règle pour les pages et
 * pour les actions.
 */
export const accesProspection = cache(async () => {
  const session = await exigerEntreprise();
  const [planifier, superviser, enregistrerClients] = await Promise.all([
    peut("commercial.prospection.planifier"),
    peut("commercial.prospection.superviser"),
    peut("tiers.fiche.gerer"),
  ]);
  const [moi] = await db
    .select({ id: commerciaux.id, actif: commerciaux.actif })
    .from(commerciaux)
    .where(and(eq(commerciaux.organizationId, session.organizationId), eq(commerciaux.userId, session.userId), isNull(commerciaux.deletedAt)));
  const monCommercialId = moi?.actif ? moi.id : null;
  const voit = (plan: Pick<PlanProspection, "commercialId">) => superviser || (planifier && plan.commercialId === monCommercialId);
  /** Faire avancer : qui le voit, tant que le plan est ouvert. */
  const gere = (plan: Pick<PlanProspection, "commercialId" | "statut">) => plan.statut === "ouvert" && voit(plan);
  return {
    session,
    planifier: planifier || superviser,
    superviser,
    enregistrerClients,
    monCommercialId,
    voit,
    gere,
  };
});
