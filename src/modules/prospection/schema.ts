import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";
import { commerciaux } from "@/modules/commerciaux/schema";
import { natureTiers, tiers } from "@/modules/tiers/schema";

/**
 * Prospection : le plan d'un commercial, ses prospects et les actions qui
 * les approchent. Règles dans `./regles.ts`.
 */
export const plansProspection = pgTable(
  "plans_prospection",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** `PP-2026-00042`, attribué à la création. */
    numero: text("numero").notNull(),
    commercialId: uuid("commercial_id")
      .notNull()
      .references(() => commerciaux.id, { onDelete: "restrict" }),
    titre: text("titre").notNull(),
    debut: date("debut").notNull(),
    fin: date("fin").notNull(),
    /** Communes, quartiers, villes couverts : Cocody, Yopougon, Bouaké… */
    zone: text("zone"),
    /** Qui l'on vise et pourquoi : « mutuelles de santé, offre de groupe ». */
    cibles: text("cibles"),
    /** Contacts à réaliser sur la période (actions faites). */
    objectifContacts: integer("objectif_contacts").notNull().default(0),
    /** Prospects à convertir en clients. */
    objectifClients: integer("objectif_clients").notNull().default(0),
    /** Chiffre d'affaires visé, en francs ; indicatif. */
    objectifCa: money("objectif_ca").notNull().default(0),
    statut: text("statut").notNull().default("ouvert"),
    notes: text("notes"),
    closLe: timestamp("clos_le", { withTimezone: true }),
    creePar: uuid("cree_par").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("plans_prospection_numero_unique").on(t.organizationId, t.numero),
    index("plans_prospection_commercial_idx").on(t.organizationId, t.commercialId, t.debut),
    check("plans_prospection_periode", sql`${t.fin} >= ${t.debut}`),
    check("plans_prospection_objectifs", sql`${t.objectifContacts} >= 0 AND ${t.objectifClients} >= 0 AND ${t.objectifCa} >= 0`),
    check("plans_prospection_statut", sql`${t.statut} in ('ouvert', 'clos')`),
  ],
);

export const prospects = pgTable(
  "prospects",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plansProspection.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    /** Même type que la fiche client qu'il deviendra. */
    nature: natureTiers("nature").notNull().default("entreprise"),
    /** La personne à voir : le président de la mutuelle, le gérant. */
    contact: text("contact"),
    fonction: text("fonction"),
    telephone: text("telephone"),
    email: text("email"),
    ville: text("ville"),
    secteur: text("secteur"),
    /** Ce qu'on pense pouvoir lui vendre. */
    besoin: text("besoin"),
    /** Montant d'affaires estimé, en francs. */
    potentiel: money("potentiel").notNull().default(0),
    statut: text("statut").notNull().default("a_contacter"),
    motifPerte: text("motif_perte"),
    /** La fiche client née de la conversion. */
    tiersId: uuid("tiers_id").references(() => tiers.id, { onDelete: "set null" }),
    convertiLe: timestamp("converti_le", { withTimezone: true }),
    creePar: uuid("cree_par").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("prospects_plan_idx").on(t.organizationId, t.planId),
    check("prospects_potentiel", sql`${t.potentiel} >= 0`),
    check("prospects_statut", sql`${t.statut} in ('a_contacter', 'en_discussion', 'interesse', 'converti', 'perdu')`),
    check("prospects_converti", sql`${t.statut} <> 'converti' OR ${t.tiersId} IS NOT NULL`),
  ],
);

export const actionsProspection = pgTable(
  "actions_prospection",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    datePrevue: date("date_prevue").notNull(),
    heure: text("heure"),
    canal: text("canal").notNull(),
    objet: text("objet").notNull(),
    statut: text("statut").notNull().default("prevue"),
    compteRendu: text("compte_rendu"),
    realiseeLe: timestamp("realisee_le", { withTimezone: true }),
    realiseePar: uuid("realisee_par").references(() => users.id, { onDelete: "set null" }),
    creePar: uuid("cree_par").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("actions_prospection_prospect_idx").on(t.organizationId, t.prospectId),
    index("actions_prospection_date_idx").on(t.organizationId, t.datePrevue),
    check("actions_prospection_canal", sql`${t.canal} in ('visite', 'appel', 'whatsapp', 'email', 'rendez_vous', 'demonstration')`),
    check("actions_prospection_statut", sql`${t.statut} in ('prevue', 'realisee', 'annulee')`),
    check("actions_prospection_heure", sql`${t.heure} IS NULL OR ${t.heure} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

export type PlanProspection = typeof plansProspection.$inferSelect;
export type Prospect = typeof prospects.$inferSelect;
export type ActionProspection = typeof actionsProspection.$inferSelect;
