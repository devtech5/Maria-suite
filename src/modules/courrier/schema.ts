import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";
import { courriers } from "@/modules/documents/schema";
import { services } from "@/modules/personnes/schema";

/**
 * Courrier et colis : le registre unique des plis arrivés et partis.
 *
 * Distinct des courriers RÉDIGÉS du module Documents (`courriers`, une
 * lettre composée au papier à en-tête) : un pli au départ peut y renvoyer.
 * Règles dans `./regles.ts`.
 */
export const plis = pgTable(
  "plis",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    sens: text("sens").notNull(),
    /** `CA-2026-00042` ou `CD-2026-00042`, attribué à l'enregistrement. */
    numero: text("numero").notNull(),
    statut: text("statut").notNull(),
    nature: text("nature").notNull(),
    canal: text("canal").notNull(),

    objet: text("objet").notNull(),
    /** L'expéditeur d'un pli arrivé, le destinataire d'un pli parti. */
    correspondant: text("correspondant").notNull(),
    /** Référence portée par le pli (la leur à l'arrivée, la nôtre au départ). */
    reference: text("reference"),
    dateDocument: date("date_document"),
    confidentiel: boolean("confidentiel").notNull().default(false),

    enregistreLe: timestamp("enregistre_le", { withTimezone: true }).notNull().defaultNow(),
    enregistrePar: uuid("enregistre_par").references(() => users.id, { onDelete: "set null" }),

    // Imputation par la direction.
    imputeUserId: uuid("impute_user_id").references(() => users.id, { onDelete: "set null" }),
    imputeServiceId: uuid("impute_service_id").references(() => services.id, { onDelete: "set null" }),
    instructions: text("instructions"),
    delaiReponse: date("delai_reponse"),
    imputePar: uuid("impute_par").references(() => users.id, { onDelete: "set null" }),
    imputeLe: timestamp("impute_le", { withTimezone: true }),

    // Accusé de réception, traitement.
    accuseLe: timestamp("accuse_le", { withTimezone: true }),
    traiteLe: timestamp("traite_le", { withTimezone: true }),
    traitePar: uuid("traite_par").references(() => users.id, { onDelete: "set null" }),
    noteTraitement: text("note_traitement"),
    /** Le pli parti qui répond à ce pli arrivé. */
    reponsePliId: uuid("reponse_pli_id"),
    derniereRelanceLe: timestamp("derniere_relance_le", { withTimezone: true }),

    // Départ : expédition et remise.
    courrierId: uuid("courrier_id").references(() => courriers.id, { onDelete: "set null" }),
    transporteur: text("transporteur"),
    numeroSuivi: text("numero_suivi"),
    expedieLe: timestamp("expedie_le", { withTimezone: true }),
    remisLe: timestamp("remis_le", { withTimezone: true }),
    dechargeNom: text("decharge_nom"),

    /** Scan du pli (PDF ou photo), et photo de la décharge signée. */
    scan: text("scan"),
    scanType: text("scan_type"),
    decharge: text("decharge"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("plis_numero_unique").on(t.organizationId, t.numero),
    index("plis_registre_idx").on(t.organizationId, t.sens, t.enregistreLe),
    index("plis_impute_idx").on(t.organizationId, t.imputeUserId, t.statut),
    check("plis_sens", sql`${t.sens} in ('arrivee', 'depart')`),
    check(
      "plis_statut",
      sql`(${t.sens} = 'arrivee' and ${t.statut} in ('enregistre', 'impute', 'recu', 'traite')) or (${t.sens} = 'depart' and ${t.statut} in ('a_expedier', 'expedie', 'remis'))`,
    ),
  ],
);

export type Pli = typeof plis.$inferSelect;
