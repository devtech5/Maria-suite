import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";
import { plis } from "@/modules/courrier/schema";
import { services } from "@/modules/personnes/schema";
import { tiers } from "@/modules/tiers/schema";

import type { Avis, Piece } from "./regles";

/**
 * Transmissions : les bordereaux qui accompagnent des pièces d'un détenteur
 * à un autre — entre services, vers une entreprise, ou attendus d'elle.
 * Règles dans `./regles.ts`.
 */
export const transmissions = pgTable(
  "transmissions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** `BT-2026-00042`, attribué à la création. */
    numero: text("numero").notNull(),
    sens: text("sens").notNull(),
    statut: text("statut").notNull(),
    objet: text("objet").notNull(),
    mention: text("mention").notNull(),
    pieces: jsonb("pieces").$type<Piece[]>().notNull(),

    // De qui, chez nous : l'émetteur d'un bordereau interne ou sortant, le
    // destinataire d'un bordereau entrant.
    emetteurUserId: uuid("emetteur_user_id").references(() => users.id, { onDelete: "set null" }),
    emetteurServiceId: uuid("emetteur_service_id").references(() => services.id, { onDelete: "set null" }),
    // Pour qui, chez nous (interne).
    destinataireUserId: uuid("destinataire_user_id").references(() => users.id, { onDelete: "set null" }),
    destinataireServiceId: uuid("destinataire_service_id").references(() => services.id, { onDelete: "set null" }),
    // L'entreprise, pour un bordereau sortant ou entrant.
    tiersId: uuid("tiers_id").references(() => tiers.id, { onDelete: "set null" }),
    entreprise: text("entreprise"),
    contact: text("contact"),

    /** Qui suit l'obligation et reçoit les relances. */
    responsableUserId: uuid("responsable_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Avant quand transmettre, ou recevoir. */
    dateLimite: date("date_limite"),

    moyen: text("moyen"),
    transmiseLe: timestamp("transmise_le", { withTimezone: true }),
    accuseLe: timestamp("accuse_le", { withTimezone: true }),
    accusePar: text("accuse_par"),
    recueLe: timestamp("recue_le", { withTimezone: true }),
    traiteeLe: timestamp("traitee_le", { withTimezone: true }),
    avis: text("avis").$type<Avis>(),
    note: text("note"),
    /** Preuve : décharge signée, accusé, scan du bordereau reçu. */
    preuve: text("preuve"),
    preuveType: text("preuve_type"),
    /** Le pli du registre du courrier qui l'a porté. */
    pliId: uuid("pli_id").references(() => plis.id, { onDelete: "set null" }),

    derniereRelanceLe: timestamp("derniere_relance_le", { withTimezone: true }),
    creePar: uuid("cree_par").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("transmissions_numero_unique").on(t.organizationId, t.numero),
    index("transmissions_org_idx").on(t.organizationId, t.sens, t.statut),
    index("transmissions_destinataire_idx").on(t.organizationId, t.destinataireUserId),
    index("transmissions_limite_idx").on(t.organizationId, t.dateLimite),
    check("transmissions_sens", sql`${t.sens} in ('interne', 'sortante', 'entrante')`),
    check("transmissions_statut", sql`${t.statut} in ('a_transmettre', 'transmise', 'accusee', 'attendue', 'recue', 'traitee', 'annulee')`),
  ],
);

export type Transmission = typeof transmissions.$inferSelect;
