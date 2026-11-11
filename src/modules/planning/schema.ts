import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

/**
 * Planning : où en est chacun, et quand il est joignable.
 *
 * Deux natures de données, jamais confondues :
 *
 *   · les HORAIRES HABITUELS — « disponible du lundi au vendredi, 8 h à
 *     12 h et 14 h à 18 h ». Ils disent quand on peut compter sur quelqu'un
 *     tant que rien d'autre n'est déclaré ;
 *   · les CRÉNEAUX — « en mission à Bouaké mardi de 9 h à 17 h », « en
 *     courses jusqu'à 15 h ». Un créneau l'emporte sur les horaires.
 *
 * Le planning appartient à un UTILISATEUR (`users`) : c'est celui qui ouvre
 * l'application qui dit où il est. Un intervenant sans compte reçoit une
 * mission, il ne tient pas de planning.
 */
export const statutPlanning = pgEnum("statut_planning", [
  "disponible",
  "occupe",
  "en_reunion",
  "en_mission",
  "sur_terrain",
  "en_course",
  "en_deplacement",
  "en_pause",
  "teletravail",
  "en_conge",
  "absent",
  "arret_maladie",
  "conge_maternite",
]);

export const creneauxPlanning = pgTable(
  "creneaux_planning",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** À qui appartient le créneau. */
    userId: uuid("user_id").notNull(),
    statut: statutPlanning("statut").notNull(),
    debut: timestamp("debut", { withTimezone: true }).notNull(),
    fin: timestamp("fin", { withTimezone: true }).notNull(),
    /** Où : « Chantier Cocody », « Plateau, siège SGBCI ». */
    lieu: text("lieu"),
    note: text("note"),
    /** Qui l'a saisi : l'intéressé, ou un administrateur pour lui. */
    saisiParUserId: uuid("saisi_par_user_id").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("creneaux_planning_periode", sql`${t.fin} > ${t.debut}`),
    // Un mois au plus : au-delà, c'est un congé ou un départ, pas un statut.
    // Sauf l'arrêt maladie et le congé de maternité (14 semaines, prolongeables) :
    // six mois au plus. Comparés en texte : une valeur d'énumération ajoutée
    // ne se cite pas dans la transaction qui l'ajoute.
    check(
      "creneaux_planning_duree",
      sql`${t.fin} - ${t.debut} <= interval '31 days' or (${t.statut}::text in ('arret_maladie', 'conge_maternite') and ${t.fin} - ${t.debut} <= interval '183 days')`,
    ),
    index("creneaux_planning_user_idx").on(t.organizationId, t.userId, t.debut),
    index("creneaux_planning_periode_idx").on(t.organizationId, t.debut, t.fin),
  ],
);

export const horairesPlanning = pgTable(
  "horaires_planning",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    /** Jour ISO : 1 = lundi … 7 = dimanche. */
    jour: integer("jour").notNull(),
    /** Minutes depuis minuit, heure de l'entreprise : 8 h 30 = 510. */
    debutMinutes: integer("debut_minutes").notNull(),
    finMinutes: integer("fin_minutes").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("horaires_planning_jour", sql`${t.jour} BETWEEN 1 AND 7`),
    check("horaires_planning_plage", sql`${t.debutMinutes} >= 0 AND ${t.finMinutes} <= 1440 AND ${t.finMinutes} > ${t.debutMinutes}`),
    index("horaires_planning_user_idx").on(t.organizationId, t.userId, t.jour),
  ],
);

export type CreneauPlanning = typeof creneauxPlanning.$inferSelect;
export type HorairePlanning = typeof horairesPlanning.$inferSelect;
export type StatutPlanning = CreneauPlanning["statut"];
