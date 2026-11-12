import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";

/**
 * Communication : ce qui prévient quelqu'un.
 *
 *   · `notifications` — à l'intérieur : la cloche d'un utilisateur ;
 *   · `envois`        — vers l'extérieur : un e-mail ou un WhatsApp, à un
 *                        client ou à un collaborateur, tracé un par un ;
 *   · `campagnes`     — un message groupé, qui produit un envoi par destinataire ;
 *   · `desinscriptions` — qui ne veut plus rien recevoir, sur quel canal.
 */

export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Destinataire : un compte qui ouvre le logiciel. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Famille : `tache`, `depense`, `bon`, `message`, `campagne`… */
    categorie: text("categorie").notNull(),
    titre: text("titre").notNull(),
    corps: text("corps"),
    /** Écran où agir. Relatif à l'application. */
    lien: text("lien"),
    lueLe: timestamp("lue_le", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_destinataire_idx").on(t.organizationId, t.userId, t.lueLe, t.createdAt)],
);

export const canalEnvoi = pgEnum("canal_envoi", ["email", "whatsapp"]);
export const statutEnvoi = pgEnum("statut_envoi", ["en_attente", "envoye", "echec", "ignore"]);

/**
 * Un message parti — ou qui aurait dû partir — vers l'extérieur.
 *
 * Tout est gardé, échecs compris : « le client dit n'avoir rien reçu » se
 * vérifie ici. `ignore` dit un envoi volontairement retenu — destinataire
 * désinscrit, sans adresse — pour que la campagne compte juste.
 */
export const envois = pgTable(
  "envois",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    canal: canalEnvoi("canal").notNull(),
    /** Adresse e-mail ou numéro au format international. */
    destinataire: text("destinataire").notNull(),
    nom: text("nom"),
    tiersId: uuid("tiers_id"),
    employeId: uuid("employe_id"),
    objet: text("objet"),
    corps: text("corps").notNull(),
    /** Ce qui a provoqué l'envoi : `facture`, `relance`, `campagne`, `essai`… */
    origine: text("origine").notNull(),
    campagneId: uuid("campagne_id"),
    statut: statutEnvoi("statut").notNull().default("en_attente"),
    raison: text("raison"),
    envoyeLe: timestamp("envoye_le", { withTimezone: true }),
    userId: uuid("user_id"),
    ...timestamps,
  },
  (t) => [
    index("envois_org_date_idx").on(t.organizationId, t.createdAt),
    index("envois_campagne_idx").on(t.campagneId),
    index("envois_tiers_idx").on(t.organizationId, t.tiersId),
  ],
);

/**
 * Désinscription : ce destinataire ne reçoit plus rien sur ce canal.
 * L'adresse est normalisée (minuscules, ou chiffres seuls pour un numéro).
 */
export const desinscriptions = pgTable(
  "desinscriptions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    canal: canalEnvoi("canal").notNull(),
    adresse: text("adresse").notNull(),
    /** `lien` (le destinataire a cliqué), `demande` (saisie par l'entreprise). */
    origine: text("origine").notNull(),
    ...timestamps,
  },
  (t) => [unique("desinscriptions_unique").on(t.organizationId, t.canal, t.adresse)],
);

export const publicCampagne = pgEnum("public_campagne", ["personnel", "clients"]);
export const statutCampagne = pgEnum("statut_campagne", ["brouillon", "envoyee"]);

/**
 * Message groupé : au personnel ou aux clients, par e-mail, WhatsApp ou dans
 * l'application. Le filtre décide qui le reçoit ; l'envoi le fige en lignes
 * d'`envois`, une par destinataire — le compte rendu en sort.
 */
export const campagnes = pgTable(
  "campagnes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    numero: text("numero"),
    titre: text("titre").notNull(),
    public: publicCampagne("public").notNull(),
    /** Canaux : `email`, `whatsapp`, `application` (cloche, personnel seulement). */
    canaux: text("canaux").array().notNull(),
    filtre: jsonb("filtre").$type<Record<string, string | boolean | null>>().notNull().default({}),
    objet: text("objet"),
    corps: text("corps").notNull(),
    statut: statutCampagne("statut").notNull().default("brouillon"),
    destinataires: integer("destinataires").notNull().default(0),
    envoyes: integer("envoyes").notNull().default(0),
    echecs: integer("echecs").notNull().default(0),
    ignores: integer("ignores").notNull().default(0),
    envoyeeLe: timestamp("envoyee_le", { withTimezone: true }),
    userId: uuid("user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("campagnes_canaux", sql`cardinality(${t.canaux}) > 0`),
    index("campagnes_org_idx").on(t.organizationId, t.createdAt),
  ],
);

export type NotificationInterne = typeof notifications.$inferSelect;
export type Envoi = typeof envois.$inferSelect;
export type CanalEnvoi = Envoi["canal"];
export type Campagne = typeof campagnes.$inferSelect;
