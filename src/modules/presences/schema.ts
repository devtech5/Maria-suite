import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees } from "@/modules/personnes/schema";

/**
 * Réglages de présence d'une entreprise : horaires attendus, jours
 * travaillés, règle d'acquisition des congés. Une ligne par entreprise,
 * créée au premier besoin avec la règle du pays.
 *
 * La règle des congés suit le même principe que le barème de paie : préremplie
 * depuis le pays, elle reste « à vérifier » tant qu'un responsable ne l'a pas
 * attestée.
 */
export const reglagesPresence = pgTable(
  "reglages_presence",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Pointer chaque compte à sa première activité du jour. */
    pointageAuto: boolean("pointage_auto").notNull().default(true),
    heureArrivee: text("heure_arrivee").notNull().default("08:00"),
    heureDepart: text("heure_depart").notNull().default("17:00"),
    toleranceMinutes: integer("tolerance_minutes").notNull().default(15),
    /** Jours travaillés, ISO : 1 = lundi … 7 = dimanche. */
    joursTravailles: integer("jours_travailles").array().notNull().default(sql`'{1,2,3,4,5}'::integer[]`),
    /** Centièmes de jour acquis par mois de service : 220 = 2,2 jours. */
    congesCentiemesParMois: integer("conges_centiemes_par_mois").notNull(),
    decompte: text("decompte").notNull().default("ouvrables"),
    verifieLe: timestamp("verifie_le", { withTimezone: true }),
    verifieParUserId: uuid("verifie_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("reglages_presence_org").on(t.organizationId),
    check("reglages_presence_heures", sql`${t.heureArrivee} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.heureDepart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("reglages_presence_tolerance", sql`${t.toleranceMinutes} BETWEEN 0 AND 240`),
    check("reglages_presence_taux", sql`${t.congesCentiemesParMois} BETWEEN 0 AND 1000`),
    check("reglages_presence_decompte", sql`${t.decompte} IN ('ouvrables', 'ouvres')`),
    check("reglages_presence_jours", sql`cardinality(${t.joursTravailles}) > 0 AND ${t.joursTravailles} <@ '{1,2,3,4,5,6,7}'::integer[]`),
  ],
);

export const sourcePresence = pgEnum("source_presence", ["automatique", "manuel"]);

/**
 * Une journée de présence : qui, quel jour, arrivé quand, vu pour la
 * dernière fois quand.
 *
 * Le pointage automatique porte le COMPTE (`user_id`) et, quand ce compte est
 * celui d'un salarié, sa fiche (`employee_id`). Un magasinier sans compte se
 * pointe à la main, par sa fiche seule. D'où deux colonnes facultatives et
 * une contrainte : au moins l'une des deux.
 */
export const presences = pgTable(
  "presences",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    /** Jour dans le fuseau de l'entreprise. */
    jour: date("jour").notNull(),
    arrivee: timestamp("arrivee", { withTimezone: true }).notNull(),
    /** Dernière activité vue : sert de départ tant qu'aucun départ n'est pointé. */
    derniereActivite: timestamp("derniere_activite", { withTimezone: true }).notNull(),
    depart: timestamp("depart", { withTimezone: true }),
    source: sourcePresence("source").notNull().default("automatique"),
    /** Qui a saisi ou corrigé à la main, et pourquoi. */
    corrigeParUserId: uuid("corrige_par_user_id"),
    motif: text("motif"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("presences_qui", sql`${t.userId} IS NOT NULL OR ${t.employeeId} IS NOT NULL`),
    check("presences_ordre", sql`${t.derniereActivite} >= ${t.arrivee} AND (${t.depart} IS NULL OR ${t.depart} >= ${t.arrivee})`),
    uniqueIndex("presences_compte_jour").on(t.organizationId, t.userId, t.jour).where(sql`${t.userId} IS NOT NULL`),
    uniqueIndex("presences_salarie_jour").on(t.organizationId, t.employeeId, t.jour).where(sql`${t.employeeId} IS NOT NULL`),
    index("presences_org_jour").on(t.organizationId, t.jour),
  ],
);

/** Jours fériés de l'entreprise : proposés depuis le pays, complétés à la main. */
export const joursFeries = pgTable(
  "jours_feries",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jour: date("jour").notNull(),
    libelle: text("libelle").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("jours_feries_jour").on(t.organizationId, t.jour)],
);

export const natureConge = pgEnum("nature_conge", ["paye", "maladie", "maternite", "paternite", "evenement_familial", "sans_solde", "recuperation", "autre"]);
export const statutConge = pgEnum("statut_conge", ["demande", "approuve", "refuse", "annule"]);

/**
 * Demande de congé ou d'absence, numérotée CONG-AAAA-NNNNN.
 *
 * Le nombre de jours est figé à la décision : un férié ajouté ensuite ne doit
 * pas réécrire un congé déjà accordé, ni le solde qui en découle.
 */
export const conges = pgTable(
  "conges",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    numero: text("numero").notNull(),
    nature: natureConge("nature").notNull().default("paye"),
    debut: date("debut").notNull(),
    fin: date("fin").notNull(),
    /** Part l'après-midi du premier jour. */
    debutDemi: boolean("debut_demi").notNull().default(false),
    /** Rentre l'après-midi du dernier jour. */
    finDemi: boolean("fin_demi").notNull().default(false),
    /** Jours décomptés, en centièmes. */
    joursCentiemes: integer("jours_centiemes").notNull(),
    motif: text("motif"),
    /** Clé de stockage du justificatif (certificat médical, acte). */
    justificatif: text("justificatif"),
    statut: statutConge("statut").notNull().default("demande"),
    demandeParUserId: uuid("demande_par_user_id").notNull(),
    decideParUserId: uuid("decide_par_user_id"),
    decideLe: timestamp("decide_le", { withTimezone: true }),
    commentaire: text("commentaire"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("conges_numero").on(t.organizationId, t.numero),
    check("conges_periode", sql`${t.fin} >= ${t.debut}`),
    check("conges_jours", sql`${t.joursCentiemes} >= 0`),
    index("conges_salarie").on(t.organizationId, t.employeeId, t.debut),
    index("conges_statut").on(t.organizationId, t.statut),
  ],
);

export const motifAjustement = pgEnum("motif_ajustement_conge", ["reprise", "majoration", "correction"]);

/**
 * Mouvement manuel de solde. Une REPRISE fixe le solde à une date et fait
 * repartir le décompte de là — c'est ainsi qu'un salarié embauché il y a dix
 * ans arrive avec son vrai solde, et non dix ans d'acquis jamais pris.
 */
export const ajustementsConge = pgTable(
  "ajustements_conge",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    jour: date("jour").notNull(),
    motif: motifAjustement("motif").notNull(),
    /** Centièmes, signés. Pour une reprise : le solde à cette date. */
    centiemes: integer("centiemes").notNull(),
    note: text("note"),
    creeParUserId: uuid("cree_par_user_id").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("ajustements_conge_borne", sql`${t.centiemes} BETWEEN -100000 AND 100000`),
    index("ajustements_conge_salarie").on(t.organizationId, t.employeeId, t.jour),
  ],
);

/**
 * Demande de permission (quelques heures) ou d'absence (journées entières),
 * numérotée PERM-AAAA-NNNNN. Elle se décide comme un congé, sans en être un :
 * la décision fixe aussi le TRAITEMENT du temps (payé, à récupérer, déduit des
 * congés, non payé). Déduite des congés, elle figé ses centièmes de jour,
 * retirés du solde comme un congé payé pris.
 */
export const demandesPermission = pgTable(
  "demandes_permission",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    numero: text("numero").notNull(),
    /** heures : une plage dans une journée · journees : un ou plusieurs jours entiers. */
    genre: text("genre").notNull(),
    debut: date("debut").notNull(),
    fin: date("fin").notNull(),
    heureDebut: text("heure_debut"),
    heureFin: text("heure_fin"),
    /** Durée d'une permission d'heures. */
    minutes: integer("minutes").notNull().default(0),
    /** Jours décomptés d'une absence, en centièmes. */
    joursCentiemes: integer("jours_centiemes").notNull().default(0),
    motif: text("motif").notNull(),
    precision: text("precision"),
    justificatif: text("justificatif"),
    statut: statutConge("statut").notNull().default("demande"),
    /** Fixé à la décision. */
    traitement: text("traitement"),
    /** Centièmes retirés du solde de congés : seulement si « déduite des congés ». */
    centiemesDeduits: integer("centiemes_deduits").notNull().default(0),
    demandeParUserId: uuid("demande_par_user_id").notNull(),
    decideParUserId: uuid("decide_par_user_id"),
    decideLe: timestamp("decide_le", { withTimezone: true }),
    commentaire: text("commentaire"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("demandes_permission_numero").on(t.organizationId, t.numero),
    check("demandes_permission_genre", sql`${t.genre} IN ('heures', 'journees')`),
    check("demandes_permission_periode", sql`${t.fin} >= ${t.debut}`),
    check(
      "demandes_permission_heures",
      sql`${t.genre} = 'journees' OR (${t.fin} = ${t.debut} AND ${t.heureDebut} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.heureFin} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.heureFin} > ${t.heureDebut})`,
    ),
    check("demandes_permission_motif", sql`${t.motif} IN ('medical', 'administratif', 'familial', 'enfant', 'personnel', 'autre')`),
    check("demandes_permission_traitement", sql`${t.traitement} IS NULL OR ${t.traitement} IN ('payee', 'a_recuperer', 'deduite_conges', 'non_payee')`),
    check("demandes_permission_durees", sql`${t.minutes} >= 0 AND ${t.joursCentiemes} >= 0 AND ${t.centiemesDeduits} >= 0`),
    index("demandes_permission_salarie").on(t.organizationId, t.employeeId, t.debut),
    index("demandes_permission_statut").on(t.organizationId, t.statut),
  ],
);

export type ReglagesPresence = typeof reglagesPresence.$inferSelect;
export type Presence = typeof presences.$inferSelect;
export type Conge = typeof conges.$inferSelect;
export type DemandePermission = typeof demandesPermission.$inferSelect;
