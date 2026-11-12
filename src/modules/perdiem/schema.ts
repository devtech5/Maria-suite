import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";
import { missions } from "@/modules/missions/schema";
import { employees } from "@/modules/personnes/schema";

/**
 * Barème du perdiem : la grille des montants par jour, tenue par la
 * comptable. Règles dans `./regles.ts`.
 */
export const baremesPerdiem = pgTable(
  "baremes_perdiem",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** « Abidjan », « Intérieur du pays », « Zone minière », « International ». */
    libelle: text("libelle").notNull(),
    /** Montant PAR JOUR, en francs entiers. */
    montantJournalier: money("montant_journalier").notNull(),
    notes: text("notes"),
    /** Hors barème : plus proposé, mais les attributions passées gardent leur montant. */
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    uniqueIndex("baremes_perdiem_libelle_unique").on(t.organizationId, sql`lower(${t.libelle})`).where(sql`${t.deletedAt} IS NULL`),
    check("baremes_perdiem_montant", sql`${t.montantJournalier} > 0`),
  ],
);

/**
 * Attribution d'un perdiem : un collaborateur, un barème, des jours. Le
 * libellé et le montant du jour sont recopiés du barème au moment de
 * l'attribution : le barème peut changer, l'attribution non.
 */
export const attributionsPerdiem = pgTable(
  "attributions_perdiem",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** `PD-2026-00042`, attribué à la création. */
    numero: text("numero").notNull(),
    /** Le collaborateur, de la fiche du Personnel. */
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "set null" }),
    baremeId: uuid("bareme_id").references(() => baremesPerdiem.id, { onDelete: "set null" }),
    baremeLibelle: text("bareme_libelle").notNull(),
    montantJournalier: money("montant_journalier").notNull(),
    jours: integer("jours").notNull(),
    montantTotal: money("montant_total").notNull(),
    debut: date("debut"),
    motif: text("motif"),

    /** `a_payer`, `paye` ou `annule`. */
    statut: text("statut").notNull().default("a_payer"),
    payeLe: date("paye_le"),
    moyen: text("moyen"),
    reference: text("reference"),
    payeParUserId: uuid("paye_par_user_id").references(() => users.id, { onDelete: "set null" }),
    motifAnnulation: text("motif_annulation"),
    creeParUserId: uuid("cree_par_user_id").references(() => users.id, { onDelete: "set null" }),
    annuleLe: timestamp("annule_le", { withTimezone: true }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("attributions_perdiem_numero_unique").on(t.organizationId, t.numero),
    index("attributions_perdiem_employe_idx").on(t.organizationId, t.employeeId),
    index("attributions_perdiem_statut_idx").on(t.organizationId, t.statut),
    index("attributions_perdiem_mission_idx").on(t.missionId),
    check("attributions_perdiem_statut", sql`${t.statut} in ('a_payer', 'paye', 'annule')`),
    check("attributions_perdiem_montants", sql`${t.jours} > 0 AND ${t.montantJournalier} > 0 AND ${t.montantTotal} = ${t.jours} * ${t.montantJournalier}`),
    check("attributions_perdiem_paiement", sql`${t.statut} <> 'paye' OR (${t.payeLe} IS NOT NULL AND ${t.moyen} IS NOT NULL)`),
    check("attributions_perdiem_annulation_motivee", sql`${t.statut} <> 'annule' OR ${t.motifAnnulation} IS NOT NULL`),
    check("attributions_perdiem_moyen", sql`${t.moyen} IS NULL OR ${t.moyen} in ('especes', 'mobile_money', 'virement')`),
  ],
);

export type BaremePerdiem = typeof baremesPerdiem.$inferSelect;
export type AttributionPerdiem = typeof attributionsPerdiem.$inferSelect;
