import { sql } from "drizzle-orm";
import { check, date, integer, jsonb, pgEnum, pgTable, text, unique, uuid, boolean, timestamp } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

/** Sur quoi la part variable se calcule. */
export const baseCommission = pgEnum("base_commission", ["ca_ht", "marge"]);

export const statutCommission = pgEnum("statut_commission", ["validee", "payee"]);

/** Palier de la part variable : au-delà de `seuil` francs, `tauxBp` s'applique. */
export interface PalierCommission {
  seuil: number;
  tauxBp: number;
}

/**
 * Commercial : celui à qui une vente est attribuée.
 *
 * Ce n'est ni un utilisateur ni un salarié, mais il peut être l'un ou l'autre
 * — ou aucun des deux : un apporteur d'affaires externe ne se connecte pas et
 * n'a pas de bulletin. D'où deux liens facultatifs. Le lien utilisateur
 * attribue d'office les tickets qu'il encaisse ; le lien salarié fait passer
 * sa commission par la paie, où elle est cotisée et imposée.
 */
export const commerciaux = pgTable(
  "commerciaux",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Nom et téléphone : ceux de la fiche salarié, ou du compte, recopiés à
     * l'enregistrement et relus à jour à l'affichage. Saisis seulement pour
     * un apporteur sans fiche.
     */
    nom: text("nom").notNull(),
    telephone: text("telephone"),
    userId: uuid("user_id"),
    /**
     * Salarié rattaché. Sans clé étrangère, pour la même raison que le compte
     * de trésorerie des commissions : le schéma du personnel importe celui
     * des ventes, qui importe celui-ci. Le code vérifie le rattachement.
     */
    employeeId: uuid("employee_id"),

    base: baseCommission("base").notNull().default("ca_ht"),
    /** Taux unique de la part variable, en points de base (500 = 5 %). */
    tauxBp: integer("taux_bp").notNull().default(0),
    /** Paliers progressifs ; renseignés, ils remplacent le taux unique. */
    paliers: jsonb("paliers").$type<PalierCommission[]>(),
    /** Part fixe versée chaque mois, quelles que soient les ventes. */
    fixeMensuel: money("fixe_mensuel").notNull().default(0),
    /** Objectif mensuel de chiffre d'affaires HT ; indicatif. */
    objectifMensuel: money("objectif_mensuel").notNull().default(0),
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("commerciaux_nom_unique").on(t.organizationId, t.nom),
    unique("commerciaux_user_unique").on(t.organizationId, t.userId),
    unique("commerciaux_employe_unique").on(t.organizationId, t.employeeId),
    check("commerciaux_montants", sql`${t.tauxBp} BETWEEN 0 AND 10000 AND ${t.fixeMensuel} >= 0 AND ${t.objectifMensuel} >= 0`),
  ],
);

/**
 * Commission d'un mois, validée : les montants sont figés. Une vente
 * enregistrée après coup sur ce mois n'y change plus rien — elle se voit dans
 * l'écart entre le calcul du jour et le montant validé.
 */
export const commissions = pgTable(
  "commissions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    commercialId: uuid("commercial_id")
      .notNull()
      .references(() => commerciaux.id, { onDelete: "restrict" }),
    /** AAAA-MM. */
    mois: text("mois").notNull(),
    caHt: money("ca_ht").notNull(),
    marge: money("marge").notNull(),
    base: baseCommission("base").notNull(),
    variable: money("variable").notNull(),
    fixe: money("fixe").notNull(),
    total: money("total").notNull(),
    statut: statutCommission("statut").notNull().default("validee"),
    valideeLe: timestamp("validee_le", { withTimezone: true }).notNull().defaultNow(),
    valideeParUserId: uuid("validee_par_user_id").notNull(),
    payeeLe: date("payee_le"),
    /** « tresorerie » : écriture de paiement ; « paie » : ajoutée au bulletin. */
    modePaiement: text("mode_paiement"),
    ecriture: text("ecriture"),
    /**
     * Compte qui a payé. Sans clé étrangère : le schéma de la trésorerie
     * importe celui des ventes, qui importe celui-ci — la référence fermerait
     * la boucle à l'initialisation des modules.
     */
    compteTresorerieId: uuid("compte_tresorerie_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("commissions_mois_unique").on(t.commercialId, t.mois),
    check("commissions_mois_format", sql`${t.mois} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("commissions_total", sql`${t.total} = ${t.variable} + ${t.fixe} AND ${t.total} >= 0`),
  ],
);

export type Commercial = typeof commerciaux.$inferSelect;
export type Commission = typeof commissions.$inferSelect;
