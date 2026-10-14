import "server-only";

import { and, eq, getTableColumns, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { employees } from "@/modules/personnes/schema";

import { atteinteObjectif, calculerCommission } from "./calcul";
import { realisationsDuMois } from "./creation";
import { commerciaux, commissions } from "./schema";

/**
 * Commerciaux, avec le nom et le téléphone lus à leur fiche — le salarié,
 * sinon le compte — : un salarié renommé au Personnel l'est ici aussi. Le
 * nom enregistré ne sert plus que pour l'apporteur sans fiche.
 */
export async function listerCommerciaux(organizationId: string) {
  const nom = sql<string>`coalesce(${employees.nom}, ${users.fullName}, ${commerciaux.nom})`;
  return db
    .select({
      ...getTableColumns(commerciaux),
      nom,
      telephone: sql<string | null>`coalesce(${employees.telephone}, ${users.phone}, ${commerciaux.telephone})`,
    })
    .from(commerciaux)
    .leftJoin(employees, eq(employees.id, commerciaux.employeeId))
    .leftJoin(users, eq(users.id, commerciaux.userId))
    .where(and(eq(commerciaux.organizationId, organizationId), isNull(commerciaux.deletedAt)))
    .orderBy(nom);
}

/**
 * Le tableau du mois : pour chaque commercial, ses réalisations, la
 * commission calculée aujourd'hui et, si elle l'est, la commission validée.
 * L'écart entre les deux signale une vente enregistrée après validation.
 */
export async function tableauCommissions(organizationId: string, mois: string) {
  const [liste, realisations, validees] = await Promise.all([
    listerCommerciaux(organizationId),
    realisationsDuMois(db, organizationId, mois),
    db.select().from(commissions).where(and(eq(commissions.organizationId, organizationId), eq(commissions.mois, mois))),
  ]);
  const parCommercial = new Map(validees.map((v) => [v.commercialId, v]));
  return liste
    .filter((c) => c.actif || parCommercial.has(c.id) || realisations.has(c.id))
    .map((c) => {
      const realisation = realisations.get(c.id) ?? { caHt: 0, marge: 0 };
      const calcul = calculerCommission(realisation, { base: c.base, tauxBp: c.tauxBp, paliers: c.paliers, fixeMensuel: c.fixeMensuel });
      return {
        commercial: c,
        realisation,
        calcul,
        objectif: atteinteObjectif(realisation.caHt, c.objectifMensuel),
        validee: parCommercial.get(c.id) ?? null,
      };
    });
}

/** Commissions validées, pas encore payées : pour le tableau de bord et le plan de trésorerie. */
export async function commissionsAPayer(organizationId: string) {
  return db
    .select({ id: commissions.id, mois: commissions.mois, total: commissions.total, commercialId: commissions.commercialId })
    .from(commissions)
    .where(and(eq(commissions.organizationId, organizationId), eq(commissions.statut, "validee")));
}
