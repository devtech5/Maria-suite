import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";
import { employees } from "@/modules/personnes/schema";

import { projets } from "./schema";

/**
 * Équipe d'un projet : le personnel que le chef de projet lui confie.
 * Règles dans `./terrain-regles.ts`.
 *
 * Interne : un collaborateur du Personnel (`employee_id`), dont le compte — s'il en
 * a un — ouvre l'interface terrain ; ou un compte sans fiche de collaborateur
 * (`user_id` seul). Externe : enregistré ici (nom, téléphone, structure), sans
 * compte. Un membre qui part est mis hors poste (`actif`), pas effacé : ses
 * relevés gardent leur auteur.
 */
export const membresProjet = pgTable(
  "membres_projet",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projetId: uuid("projet_id")
      .notNull()
      .references(() => projets.id, { onDelete: "cascade" }),

    /** `superviseur` ou `agent`. */
    role: text("role").notNull(),
    /** `interne` ou `externe`. */
    origine: text("origine").notNull(),

    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    /** Externe : son nom ; interne, le nom se lit à la fiche. */
    nom: text("nom"),
    telephone: text("telephone"),
    organisme: text("organisme"),

    actif: boolean("actif").notNull().default(true),
    confiePar: uuid("confie_par").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("membres_projet_projet_idx").on(t.organizationId, t.projetId),
    index("membres_projet_user_idx").on(t.organizationId, t.userId),
    // Un seul superviseur en poste par projet : nommer le suivant remplace l'ancien.
    uniqueIndex("membres_projet_superviseur_unique")
      .on(t.projetId)
      .where(sql`${t.role} = 'superviseur' AND ${t.actif} AND ${t.deletedAt} IS NULL`),
    // Une même personne n'est pas deux fois en poste sur un projet.
    uniqueIndex("membres_projet_employe_unique")
      .on(t.projetId, t.employeeId)
      .where(sql`${t.employeeId} IS NOT NULL AND ${t.actif} AND ${t.deletedAt} IS NULL`),
    uniqueIndex("membres_projet_compte_unique")
      .on(t.projetId, t.userId)
      .where(sql`${t.userId} IS NOT NULL AND ${t.actif} AND ${t.deletedAt} IS NULL`),
    check("membres_projet_role", sql`${t.role} in ('superviseur', 'agent')`),
    check("membres_projet_origine", sql`${t.origine} in ('interne', 'externe')`),
    // Un externe n'a ni fiche collaborateur ni compte, et un nom ; un interne a l'un des deux liens.
    check(
      "membres_projet_identite",
      sql`(${t.origine} = 'externe' AND ${t.employeeId} IS NULL AND ${t.userId} IS NULL AND ${t.nom} IS NOT NULL) OR (${t.origine} = 'interne' AND (${t.employeeId} IS NOT NULL OR ${t.userId} IS NOT NULL))`,
    ),
  ],
);

/**
 * Relevé de terrain : ce qu'un agent remonte du chantier — un constat, un
 * avancement — avec sa position GPS et ses preuves. Le superviseur et le chef
 * de projet l'examinent : validé, ou à refaire avec un motif.
 */
export const relevesProjet = pgTable(
  "releves_projet",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projetId: uuid("projet_id")
      .notNull()
      .references(() => projets.id, { onDelete: "cascade" }),
    /** Qui a exercé : un membre de l'équipe, avec ou sans compte. */
    membreId: uuid("membre_id")
      .notNull()
      .references(() => membresProjet.id, { onDelete: "restrict" }),
    /** Quel compte a saisi : l'agent lui-même, ou celui qui relève pour un externe. */
    saisiParUserId: uuid("saisi_par_user_id").references(() => users.id, { onDelete: "set null" }),

    libelle: text("libelle").notNull(),
    note: text("note"),
    /** Avancement déclaré, en pourcentage entier. */
    avancement: integer("avancement"),

    /** Position en millionièmes de degré, comme les preuves de mission. */
    latitudeMicro: integer("latitude_micro").notNull(),
    longitudeMicro: integer("longitude_micro").notNull(),
    precisionM: integer("precision_m"),

    /** Quand l'appareil l'a pris, et quand la plateforme l'a reçu. */
    priseLe: timestamp("prise_le", { withTimezone: true }).notNull(),
    recueLe: timestamp("recue_le", { withTimezone: true }).notNull().defaultNow(),

    statut: text("statut").notNull().default("soumis"),
    reviseParUserId: uuid("revise_par_user_id").references(() => users.id, { onDelete: "set null" }),
    reviseLe: timestamp("revise_le", { withTimezone: true }),
    commentaire: text("commentaire"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("releves_projet_projet_idx").on(t.organizationId, t.projetId, t.priseLe),
    index("releves_projet_membre_idx").on(t.membreId),
    check("releves_projet_statut", sql`${t.statut} in ('soumis', 'valide', 'a_refaire')`),
    check("releves_projet_avancement", sql`${t.avancement} IS NULL OR ${t.avancement} BETWEEN 0 AND 100`),
    check(
      "releves_projet_position",
      sql`${t.latitudeMicro} BETWEEN -90000000 AND 90000000 AND ${t.longitudeMicro} BETWEEN -180000000 AND 180000000 AND NOT (${t.latitudeMicro} = 0 AND ${t.longitudeMicro} = 0)`,
    ),
    check("releves_projet_renvoi_motive", sql`${t.statut} <> 'a_refaire' OR ${t.commentaire} IS NOT NULL`),
  ],
);

/** Preuve d'un relevé : une photo prise sur place, ou une capture d'écran. Le fichier vit dans le dépôt, la clé ici. */
export const preuvesReleve = pgTable(
  "preuves_releve",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    releveId: uuid("releve_id")
      .notNull()
      .references(() => relevesProjet.id, { onDelete: "cascade" }),
    /** `photo` ou `capture`. */
    nature: text("nature").notNull(),
    chemin: text("chemin").notNull(),
    nomFichier: text("nom_fichier").notNull(),
    typeMime: text("type_mime").notNull(),
    tailleOctets: bigint("taille_octets", { mode: "number" }).notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("preuves_releve_chemin_unique").on(t.organizationId, t.chemin),
    index("preuves_releve_releve_idx").on(t.releveId),
    check("preuves_releve_nature", sql`${t.nature} in ('photo', 'capture')`),
  ],
);

export type MembreProjet = typeof membresProjet.$inferSelect;
export type ReleveProjet = typeof relevesProjet.$inferSelect;
export type PreuveReleve = typeof preuvesReleve.$inferSelect;
