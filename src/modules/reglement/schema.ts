import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";

import type { Article } from "./regles";

/**
 * Règlement intérieur : versions publiées par les ressources humaines, et
 * acceptations horodatées de chaque compte.
 *
 * Une version publiée ne se modifie plus : son texte est celui que chacun a
 * accepté, et une acceptation doit pouvoir se relire telle qu'elle a été
 * donnée. Règles dans `./regles.ts`.
 */
export const reglementVersions = pgTable(
  "reglement_versions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** 1, 2, 3… attribué à la publication (`document_sequences`, clé `reglement`). Nul pour un brouillon. */
    numero: integer("numero"),
    statut: text("statut").notNull().default("brouillon"),
    titre: text("titre").notNull(),
    preambule: text("preambule"),
    articles: jsonb("articles").$type<Article[]>().notNull().default(sql`'[]'::jsonb`),
    /** Ce qui change par rapport à la version précédente, dit en une phrase à ceux qui relisent. */
    resume: text("resume"),
    dateEffet: date("date_effet"),

    publieLe: timestamp("publie_le", { withTimezone: true }),
    publiePar: uuid("publie_par").references(() => users.id, { onDelete: "set null" }),
    creePar: uuid("cree_par").references(() => users.id, { onDelete: "set null" }),
    derniereRelanceLe: timestamp("derniere_relance_le", { withTimezone: true }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("reglement_versions_numero_unique").on(t.organizationId, t.numero),
    index("reglement_versions_org_idx").on(t.organizationId, t.statut, t.dateEffet),
    // Un seul brouillon à la fois : deux rédactions parallèles finiraient par s'écraser.
    uniqueIndex("reglement_versions_un_brouillon").on(t.organizationId).where(sql`statut = 'brouillon' and deleted_at is null`),
    check("reglement_versions_statut", sql`${t.statut} in ('brouillon', 'publie')`),
    check("reglement_versions_publiee", sql`${t.statut} = 'brouillon' or (${t.numero} is not null and ${t.dateEffet} is not null and ${t.publieLe} is not null)`),
  ],
);

export const reglementAcceptations = pgTable(
  "reglement_acceptations",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => reglementVersions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** L'instant du « J'ai lu et j'accepte ». */
    accepteLe: timestamp("accepte_le", { withTimezone: true }).notNull().defaultNow(),
    adresseIp: text("adresse_ip"),
    appareil: text("appareil"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("reglement_acceptations_unique").on(t.versionId, t.userId),
    index("reglement_acceptations_user_idx").on(t.organizationId, t.userId),
  ],
);

export type ReglementVersion = typeof reglementVersions.$inferSelect;
