import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

/**
 * Meeting : réunions d'équipe à distance.
 *
 * Une réunion se programme (titre, ordre du jour, heure, durée, invités) ou
 * s'ouvre sur-le-champ. La première arrivée dans la salle l'ouvre ;
 * l'organisateur la termine et en rédige le compte rendu. Les images et le
 * son ne passent jamais par la base : ils vont d'un navigateur aux autres par
 * le serveur vidéo. La base tient qui est invité, qui est venu, et combien de
 * temps.
 *
 * Les participants sont des UTILISATEURS (`users`) : une réunion se rejoint
 * depuis l'application.
 */
export const statutReunion = pgEnum("statut_reunion", ["planifiee", "en_cours", "terminee", "annulee"]);

export const reunions = pgTable(
  "reunions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : REU-2026-00042. */
    numero: text("numero").notNull(),
    titre: text("titre").notNull(),
    ordreDuJour: text("ordre_du_jour"),
    debutPrevu: timestamp("debut_prevu", { withTimezone: true }).notNull(),
    dureeMinutes: integer("duree_minutes").notNull().default(60),
    statut: statutReunion("statut").notNull().default("planifiee"),

    organisateurUserId: uuid("organisateur_user_id").notNull(),

    /** Première arrivée dans la salle. */
    ouverteLe: timestamp("ouverte_le", { withTimezone: true }),
    termineeLe: timestamp("terminee_le", { withTimezone: true }),
    termineeParUserId: uuid("terminee_par_user_id"),
    compteRendu: text("compte_rendu"),

    annuleeLe: timestamp("annulee_le", { withTimezone: true }),
    motifAnnulation: text("motif_annulation"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("reunions_numero_unique").on(t.organizationId, t.numero),
    check("reunions_duree", sql`${t.dureeMinutes} BETWEEN 5 AND 480`),
    check("reunions_ouverte_datee", sql`${t.statut} NOT IN ('en_cours', 'terminee') OR ${t.ouverteLe} IS NOT NULL`),
    check("reunions_terminee_datee", sql`${t.statut} <> 'terminee' OR ${t.termineeLe} IS NOT NULL`),
    check("reunions_annulation_motivee", sql`${t.statut} <> 'annulee' OR ${t.motifAnnulation} IS NOT NULL`),
    index("reunions_org_debut_idx").on(t.organizationId, t.debutPrevu),
    index("reunions_organisateur_idx").on(t.organizationId, t.organisateurUserId),
  ],
);

/**
 * Invités d'une réunion, et leur présence dans la salle.
 *
 * `vuLe` est le dernier signal du navigateur depuis la salle : récent, le
 * participant est là et les autres lisent son flux. `secondesPresence` cumule
 * le temps passé, signal après signal : c'est la feuille de présence.
 */
export const reunionParticipants = pgTable(
  "reunion_participants",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reunionId: uuid("reunion_id")
      .notNull()
      .references(() => reunions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    inviteParUserId: uuid("invite_par_user_id").notNull(),

    rejointLe: timestamp("rejoint_le", { withTimezone: true }),
    vuLe: timestamp("vu_le", { withTimezone: true }),
    secondesPresence: integer("secondes_presence").notNull().default(0),
    micro: boolean("micro").notNull().default(false),
    camera: boolean("camera").notNull().default(false),
    ecran: boolean("ecran").notNull().default(false),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("reunion_participants_unique").on(t.reunionId, t.userId),
    check("reunion_participants_presence", sql`${t.secondesPresence} >= 0`),
    index("reunion_participants_user_idx").on(t.organizationId, t.userId),
  ],
);

export type Reunion = typeof reunions.$inferSelect;
export type ParticipantReunion = typeof reunionParticipants.$inferSelect;
