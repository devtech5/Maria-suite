import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees } from "@/modules/personnes/schema";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import type { BaremePaie } from "./calcul";

/**
 * Paie émise.
 *
 * Un bulletin calculé n'engage rien ; un bulletin émis fige ses montants,
 * porte un numéro et passe en comptabilité avec tous ceux du mois. Le barème
 * appliqué est recopié sur la période : changer un taux demain ne réécrit pas
 * les bulletins d'hier.
 */

/** Barème de paie de l'entreprise, et qui l'a vérifié. */
export const parametresPaie = pgTable(
  "parametres_paie",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bareme: jsonb("bareme").$type<BaremePaie>().notNull(),
    /** Celui qui atteste avoir confronté les taux aux textes et à un bulletin réel. */
    verifieParUserId: uuid("verifie_par_user_id"),
    verifieLe: timestamp("verifie_le", { withTimezone: true }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("parametres_paie_organisation_unique").on(t.organizationId)],
);

export const statutPeriodePaie = pgEnum("statut_periode_paie", ["preparation", "validee"]);

export const periodesPaie = pgTable(
  "periodes_paie",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** AAAA-MM. */
    mois: text("mois").notNull(),
    statut: statutPeriodePaie("statut").notNull().default("preparation"),
    baremeApplique: jsonb("bareme_applique").$type<BaremePaie>(),
    totalBrut: money("total_brut").notNull().default(0),
    totalNet: money("total_net").notNull().default(0),
    totalCnps: money("total_cnps").notNull().default(0),
    totalImpot: money("total_impot").notNull().default(0),
    totalPatronal: money("total_patronal").notNull().default(0),
    ecriture: text("ecriture"),
    valideeLe: timestamp("validee_le", { withTimezone: true }),
    valideeParUserId: uuid("validee_par_user_id"),
    cnpsVerseeLe: date("cnps_versee_le"),
    cnpsEcriture: text("cnps_ecriture"),
    impotVerseLe: date("impot_verse_le"),
    impotEcriture: text("impot_ecriture"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("periodes_paie_mois_unique").on(t.organizationId, t.mois),
    check("periodes_paie_mois_format", sql`${t.mois} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("periodes_paie_validee", sql`${t.statut} = 'preparation' OR (${t.ecriture} IS NOT NULL AND ${t.baremeApplique} IS NOT NULL)`),
  ],
);

export const bulletinsPaie = pgTable(
  "bulletins_paie",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodeId: uuid("periode_id")
      .notNull()
      .references(() => periodesPaie.id, { onDelete: "cascade" }),
    employeId: uuid("employe_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Attribué à la validation : BUL-2026-10-0001. */
    numero: text("numero"),
    matricule: text("matricule").notNull(),
    nom: text("nom").notNull(),
    poste: text("poste").notNull(),
    numeroCnps: text("numero_cnps"),

    salaireBase: money("salaire_base").notNull(),

    // Absences, en centièmes de jour (voir `absencesDuMois`). Les trois
    // premiers viennent du contrat et de Présences à chaque préparation ;
    // les absences saisies sur le bulletin, elles, se conservent.
    /** Jours décomptables du mois : la base du prorata. */
    joursMois: integer("jours_mois").notNull().default(0),
    joursHorsContrat: integer("jours_hors_contrat").notNull().default(0),
    joursSansSolde: integer("jours_sans_solde").notNull().default(0),
    /** Absences non rémunérées constatées à la main (absence injustifiée). */
    joursAbsenceSaisis: integer("jours_absence_saisis").notNull().default(0),
    /** Part du salaire de base non due pour ces jours. */
    retenueAbsence: money("retenue_absence").notNull().default(0),
    /** Congés payés pris dans le mois, et solde en fin de mois : imprimés, sans effet sur le montant. */
    congesPris: integer("conges_pris").notNull().default(0),
    soldeConges: integer("solde_conges"),

    primesImposables: money("primes_imposables").notNull().default(0),
    indemnitesNonImposables: money("indemnites_non_imposables").notNull().default(0),
    retenuesDiverses: money("retenues_diverses").notNull().default(0),
    /** Rappel de salaire, signé : négatif, il reprend un trop-perçu. */
    rappel: money("rappel").notNull().default(0),
    rappelLibelle: text("rappel_libelle"),

    brut: money("brut").notNull(),
    cnpsSalarie: money("cnps_salarie").notNull(),
    baseImposable: money("base_imposable").notNull(),
    impot: money("impot").notNull(),
    net: money("net").notNull(),
    cnpsPatronal: money("cnps_patronal").notNull(),
    prestationsFamiliales: money("prestations_familiales").notNull(),
    accidentTravail: money("accident_travail").notNull(),
    coutTotal: money("cout_total").notNull(),

    payeLe: date("paye_le"),
    paiementEcriture: text("paiement_ecriture"),
    compteTresorerieId: uuid("compte_tresorerie_id").references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("bulletins_paie_salarie_unique").on(t.periodeId, t.employeId),
    unique("bulletins_paie_numero_unique").on(t.organizationId, t.numero),
    check("bulletins_paie_net", sql`${t.net} >= 0 AND ${t.brut} >= 0`),
    check("bulletins_paie_rappel", sql`${t.rappel} = 0 OR ${t.rappelLibelle} IS NOT NULL`),
    check(
      "bulletins_paie_absences",
      sql`${t.joursMois} >= 0 AND ${t.joursHorsContrat} >= 0 AND ${t.joursSansSolde} >= 0 AND ${t.joursAbsenceSaisis} >= 0 AND ${t.congesPris} >= 0 AND ${t.retenueAbsence} BETWEEN 0 AND ${t.salaireBase}`,
    ),
    check("bulletins_paie_paye", sql`${t.payeLe} IS NULL OR ${t.paiementEcriture} IS NOT NULL`),
    index("bulletins_paie_periode_idx").on(t.periodeId),
    index("bulletins_paie_employe_idx").on(t.organizationId, t.employeId),
  ],
);

export type PeriodePaie = typeof periodesPaie.$inferSelect;
export type BulletinPaie = typeof bulletinsPaie.$inferSelect;
