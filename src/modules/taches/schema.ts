import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees } from "@/modules/personnes/schema";

/**
 * Tâches.
 *
 * Une tâche se crée pour soi ou s'attribue à quelqu'un, puis s'exécute :
 * à faire → en cours → terminée. Chaque passage garde son auteur et son heure,
 * et le journal d'activité garde le reste — qui l'a créée, attribuée,
 * réattribuée, rouverte.
 *
 * L'exécutant se choisit dans le Personnel (`employees`), pas dans une liste
 * de comptes ressaisie à part. Celui qui commence et termine dans
 * l'application reste un UTILISATEUR (`assignee_user_id`) : le compte du
 * salarié quand il en a un, sinon le créateur, qui suit la tâche pour lui —
 * un magasinier sans compte ne verra jamais l'écran.
 */
export const statutTache = pgEnum("statut_tache", ["a_faire", "en_cours", "terminee", "annulee"]);

/** Priorité. L'ordre de l'enum est celui du tri : `urgente` passe devant. */
export const prioriteTache = pgEnum("priorite_tache", ["basse", "normale", "haute", "urgente"]);

export const taches = pgTable(
  "taches",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : TCH-2026-00042. */
    numero: text("numero").notNull(),
    titre: text("titre").notNull(),
    description: text("description"),
    priorite: prioriteTache("priorite").notNull().default("normale"),
    statut: statutTache("statut").notNull().default("a_faire"),
    /** Date limite, sans heure : « pour vendredi ». */
    echeance: date("echeance"),

    creeParUserId: uuid("cree_par_user_id").notNull(),
    /** Qui la fait avancer dans l'application. Égal au créateur pour une tâche personnelle. */
    assigneeUserId: uuid("assignee_user_id").notNull(),
    /** Salarié du Personnel à qui la tâche est confiée. Nul : tâche pour soi, ou ancienne tâche. */
    assigneeEmployeId: uuid("assignee_employe_id").references(() => employees.id, { onDelete: "set null" }),
    attribueeLe: timestamp("attribuee_le", { withTimezone: true }).notNull().defaultNow(),

    demarreeLe: timestamp("demarree_le", { withTimezone: true }),
    termineeLe: timestamp("terminee_le", { withTimezone: true }),
    termineeParUserId: uuid("terminee_par_user_id"),
    /** Ce qui a été fait, dit par l'exécutant en terminant. */
    compteRendu: text("compte_rendu"),

    annuleeLe: timestamp("annulee_le", { withTimezone: true }),
    motifAnnulation: text("motif_annulation"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("taches_numero_unique").on(t.organizationId, t.numero),
    check("taches_terminee_datee", sql`${t.statut} <> 'terminee' OR ${t.termineeLe} IS NOT NULL`),
    check("taches_annulation_motivee", sql`${t.statut} <> 'annulee' OR ${t.motifAnnulation} IS NOT NULL`),
    index("taches_assignee_idx").on(t.organizationId, t.assigneeUserId, t.statut),
    index("taches_createur_idx").on(t.organizationId, t.creeParUserId),
  ],
);

export type Tache = typeof taches.$inferSelect;
export type StatutTache = Tache["statut"];
export type PrioriteTache = Tache["priorite"];
