import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import type { RegleImpotBenefices } from "./resultat";

/**
 * Déclaration de TVA d'un mois : ce qui a été liquidé, et ce qui a été payé.
 * Les montants sont recopiés de l'écriture de liquidation au moment où elle
 * est passée ; le crédit reporté alimente la déclaration suivante.
 */
export const declarationsTva = pgTable(
  "declarations_tva",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** AAAA-MM. */
    mois: text("mois").notNull(),
    collectee: money("collectee").notNull(),
    deductible: money("deductible").notNull(),
    creditAnterieur: money("credit_anterieur").notNull().default(0),
    aPayer: money("a_payer").notNull(),
    creditReporte: money("credit_reporte").notNull().default(0),
    ecriture: text("ecriture"),
    deposeeLe: timestamp("deposee_le", { withTimezone: true }).notNull().defaultNow(),
    deposeeParUserId: uuid("deposee_par_user_id").notNull(),
    payeeLe: date("payee_le"),
    ecriturePaiement: text("ecriture_paiement"),
    compteTresorerieId: uuid("compte_tresorerie_id").references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("declarations_tva_mois_unique").on(t.organizationId, t.mois),
    check("declarations_tva_mois_format", sql`${t.mois} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("declarations_tva_montants", sql`${t.aPayer} >= 0 AND ${t.creditReporte} >= 0 AND (${t.aPayer} = 0 OR ${t.creditReporte} = 0)`),
  ],
);

/**
 * Exercice clôturé : son résultat est passé en 13, et plus aucune écriture
 * ne peut y être datée. Une réouverture contrepasse la clôture et se trace.
 */
export const exercicesClotures = pgTable(
  "exercices_clotures",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    exercice: text("exercice").notNull(),
    resultat: money("resultat").notNull(),
    ecriture: text("ecriture").notNull(),
    clotureLe: timestamp("cloture_le", { withTimezone: true }).notNull().defaultNow(),
    clotureParUserId: uuid("cloture_par_user_id").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("exercices_clotures_unique").on(t.organizationId, t.exercice),
    check("exercices_clotures_format", sql`${t.exercice} ~ '^[0-9]{4}$'`),
  ],
);

/**
 * Règle d'impôt sur les bénéfices de l'entreprise, et qui l'a vérifiée. Une
 * ligne par entreprise, créée à la première modification ; avant, la règle
 * du pays s'applique, non attestée.
 */
export const parametresFiscaux = pgTable(
  "parametres_fiscaux",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    regleImpot: jsonb("regle_impot").$type<RegleImpotBenefices>().notNull(),
    verifieLe: timestamp("verifie_le", { withTimezone: true }),
    verifieParUserId: uuid("verifie_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("parametres_fiscaux_organisation").on(t.organizationId)],
);

/**
 * Impôt sur les bénéfices d'un exercice, constaté avant sa clôture : la
 * détermination est figée avec la règle appliquée. L'écriture est nulle
 * quand rien n'est dû.
 */
export const impotsBenefices = pgTable(
  "impots_benefices",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    exercice: text("exercice").notNull(),
    resultatComptable: money("resultat_comptable").notNull(),
    reintegrations: money("reintegrations").notNull().default(0),
    deductions: money("deductions").notNull().default(0),
    resultatFiscal: money("resultat_fiscal").notNull(),
    chiffreAffaires: money("chiffre_affaires").notNull(),
    impotTheorique: money("impot_theorique").notNull(),
    imf: money("imf").notNull(),
    impotDu: money("impot_du").notNull(),
    regleAppliquee: jsonb("regle_appliquee").$type<RegleImpotBenefices>().notNull(),
    ecriture: text("ecriture"),
    constateLe: timestamp("constate_le", { withTimezone: true }).notNull().defaultNow(),
    constateParUserId: uuid("constate_par_user_id").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("impots_benefices_exercice").on(t.organizationId, t.exercice),
    check("impots_benefices_format", sql`${t.exercice} ~ '^[0-9]{4}$'`),
    check("impots_benefices_montants", sql`${t.impotDu} >= 0 AND (${t.impotDu} = 0 OR ${t.ecriture} IS NOT NULL)`),
  ],
);

/** Fractions de l'impôt d'un exercice, payées l'année suivante. */
export const fractionsImpot = pgTable(
  "fractions_impot",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    impotId: uuid("impot_id")
      .notNull()
      .references(() => impotsBenefices.id, { onDelete: "cascade" }),
    exercice: text("exercice").notNull(),
    rang: integer("rang").notNull(),
    echeance: date("echeance").notNull(),
    montant: money("montant").notNull(),
    payeeLe: date("payee_le"),
    ecriture: text("ecriture"),
    compteTresorerieId: uuid("compte_tresorerie_id").references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("fractions_impot_rang").on(t.organizationId, t.exercice, t.rang),
    check("fractions_impot_montant", sql`${t.montant} > 0`),
    check("fractions_impot_payee", sql`${t.payeeLe} IS NULL OR ${t.ecriture} IS NOT NULL`),
    index("fractions_impot_echeance").on(t.organizationId, t.echeance),
  ],
);

/** Ce que l'assemblée a décidé du résultat d'un exercice clos. */
export const affectationsResultat = pgTable(
  "affectations_resultat",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    exercice: text("exercice").notNull(),
    resultat: money("resultat").notNull(),
    reserveLegale: money("reserve_legale").notNull().default(0),
    autresReserves: money("autres_reserves").notNull().default(0),
    dividendes: money("dividendes").notNull().default(0),
    reportANouveau: money("report_a_nouveau").notNull().default(0),
    dateDecision: date("date_decision").notNull(),
    ecriture: text("ecriture").notNull(),
    decideParUserId: uuid("decide_par_user_id").notNull(),
    ...timestamps,
  },
  (t) => [unique("affectations_resultat_exercice").on(t.organizationId, t.exercice)],
);

/** Trace des réouvertures : qui, pourquoi, et les écritures contrepassées. */
export const reouverturesExercice = pgTable(
  "reouvertures_exercice",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    exercice: text("exercice").notNull(),
    motif: text("motif").notNull(),
    resultatAnnule: money("resultat_annule").notNull(),
    ecritures: text("ecritures").array().notNull(),
    rouvertParUserId: uuid("rouvert_par_user_id").notNull(),
    ...timestamps,
  },
  (t) => [index("reouvertures_exercice_idx").on(t.organizationId, t.exercice)],
);

export type DeclarationTva = typeof declarationsTva.$inferSelect;
export type ExerciceCloture = typeof exercicesClotures.$inferSelect;
