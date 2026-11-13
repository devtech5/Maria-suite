import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { reunions } from "@/modules/meeting/schema";
import { employees } from "@/modules/personnes/schema";
import { taches } from "@/modules/taches/schema";

import type { Diffusion, Participant, Point } from "./regles";

/**
 * Procès-verbaux, comptes rendus et rapports.
 *
 * Brouillon → à valider → publié. La publication par la direction attribue
 * le numéro (`document_sequences`, clé `pv`), fige le texte et le diffuse :
 * une ligne de `pv_lectures` par destinataire. Corriger un PV publié, c'est
 * publier une nouvelle version sous le même numéro (`revision` + 1, `remplace_id`
 * vers la précédente), jamais réécrire celle que chacun a lue.
 */
export const procesVerbaux = pgTable(
  "proces_verbaux",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** PV-2026-00012, attribué à la première publication ; gardé par les versions suivantes. */
    numero: text("numero"),
    revision: integer("revision").notNull().default(1),
    /** La version que celle-ci corrige. */
    remplaceId: uuid("remplace_id"),

    type: text("type").notNull().default("reunion"),
    statut: text("statut").notNull().default("brouillon"),
    objet: text("objet").notNull(),
    dateSeance: date("date_seance").notNull(),
    lieu: text("lieu"),
    /** Réunion Meeting dont le PV rend compte, s'il y en a une. */
    reunionId: uuid("reunion_id").references(() => reunions.id, { onDelete: "set null" }),

    participants: jsonb("participants").$type<Participant[]>().notNull().default(sql`'[]'::jsonb`),
    points: jsonb("points").$type<Point[]>().notNull().default(sql`'[]'::jsonb`),
    conclusion: text("conclusion"),

    diffusion: jsonb("diffusion").$type<Diffusion>().notNull().default(sql`'{"tous":false,"services":[],"comptes":[]}'::jsonb`),
    /** Les destinataires doivent dire « J'ai pris connaissance ». */
    accuseRequis: boolean("accuse_requis").notNull().default(false),
    confidentiel: boolean("confidentiel").notNull().default(false),

    redigeParUserId: uuid("redige_par_user_id").notNull(),
    soumisLe: timestamp("soumis_le", { withTimezone: true }),
    /** Remarque de la direction quand elle renvoie le brouillon. */
    remarque: text("remarque"),
    publieLe: timestamp("publie_le", { withTimezone: true }),
    publieParUserId: uuid("publie_par_user_id"),
    derniereRelanceLe: timestamp("derniere_relance_le", { withTimezone: true }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("proces_verbaux_numero_revision").on(t.organizationId, t.numero, t.revision),
    check("proces_verbaux_type", sql`${t.type} IN ('reunion', 'compte_rendu', 'rapport')`),
    check("proces_verbaux_statut", sql`${t.statut} IN ('brouillon', 'a_valider', 'publie')`),
    check("proces_verbaux_publie", sql`${t.statut} <> 'publie' OR (${t.numero} IS NOT NULL AND ${t.publieLe} IS NOT NULL)`),
    check("proces_verbaux_revision", sql`${t.revision} >= 1`),
    index("proces_verbaux_org_idx").on(t.organizationId, t.statut, t.dateSeance),
    index("proces_verbaux_redacteur_idx").on(t.organizationId, t.redigeParUserId),
  ],
);

/**
 * Actions décidées : qui, quoi, pour quand. Chacune devient une tâche d'un
 * clic, une fois le PV publié ; le PV suit alors son avancement.
 */
export const pvActions = pgTable(
  "pv_actions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pvId: uuid("pv_id")
      .notNull()
      .references(() => procesVerbaux.id, { onDelete: "cascade" }),
    rang: integer("rang").notNull().default(0),
    libelle: text("libelle").notNull(),
    responsableEmployeId: uuid("responsable_employe_id").references(() => employees.id, { onDelete: "set null" }),
    echeance: date("echeance"),
    tacheId: uuid("tache_id").references(() => taches.id, { onDelete: "set null" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [index("pv_actions_pv_idx").on(t.organizationId, t.pvId, t.rang)],
);

/** Un destinataire d'un PV publié, et l'instant où il en a pris connaissance. */
export const pvLectures = pgTable(
  "pv_lectures",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pvId: uuid("pv_id")
      .notNull()
      .references(() => procesVerbaux.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    luLe: timestamp("lu_le", { withTimezone: true }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("pv_lectures_unique").on(t.pvId, t.userId), index("pv_lectures_user_idx").on(t.organizationId, t.userId)],
);

/**
 * Pièces jointes d'un PV : plans, photos, feuille de présence signée,
 * annexes. Le fichier vit dans le dépôt (`src/lib/stockage`), seule sa clé
 * est ici ; il s'ouvre par URL signée, demandée au clic.
 *
 * Elles font partie du document : jointes au brouillon, figées avec lui à la
 * publication. Une nouvelle version reprend celles de la précédente en
 * pointant le même fichier — d'où la règle de retrait : le fichier ne quitte
 * le dépôt que si plus aucune ligne ne le désigne.
 */
export const pvFichiers = pgTable(
  "pv_fichiers",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pvId: uuid("pv_id")
      .notNull()
      .references(() => procesVerbaux.id, { onDelete: "cascade" }),
    nomFichier: text("nom_fichier").notNull(),
    typeMime: text("type_mime").notNull(),
    /** Octets : un entier. */
    taille: integer("taille").notNull(),
    chemin: text("chemin").notNull(),
    deposeParUserId: uuid("depose_par_user_id").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [check("pv_fichiers_taille", sql`${t.taille} > 0`), index("pv_fichiers_pv_idx").on(t.organizationId, t.pvId), index("pv_fichiers_chemin_idx").on(t.chemin)],
);

export type ProcesVerbal = typeof procesVerbaux.$inferSelect;
