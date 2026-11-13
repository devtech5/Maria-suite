import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";

/**
 * Messagerie interne : entre les comptes de l'entreprise, jamais avec
 * l'extérieur (c'est le rôle de Communication).
 *
 * Deux sortes de conversations :
 *   · privée — deux personnes, une seule conversation par paire, que l'une ou
 *     l'autre l'ouvre (`cle_privee` est la paire triée) ;
 *   · groupe — créé par qui en a le droit, animé par ses administrateurs.
 */

export const typeConversation = pgEnum("type_conversation", ["privee", "groupe"]);
export const roleParticipant = pgEnum("role_participant", ["admin", "membre"]);

export const conversations = pgTable(
  "conversations",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: typeConversation("type").notNull(),
    nom: text("nom"),
    description: text("description"),
    /** « idA:idB », identifiants triés : une seule conversation privée par paire. */
    clePrivee: text("cle_privee"),
    creePar: uuid("cree_par").references(() => users.id, { onDelete: "set null" }),
    /** Dernier message : sert au tri de la liste sans relire tous les messages. */
    dernierMessageLe: timestamp("dernier_message_le", { withTimezone: true }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("conversations_privee_unique").on(t.organizationId, t.clePrivee),
    check("conversations_nom_groupe", sql`${t.type} = 'privee' OR (${t.nom} IS NOT NULL AND length(trim(${t.nom})) > 0)`),
    check("conversations_cle_privee", sql`(${t.type} = 'privee') = (${t.clePrivee} IS NOT NULL)`),
    index("conversations_org_idx").on(t.organizationId, t.dernierMessageLe),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleParticipant("role").notNull().default("membre"),
    /** Tout message antérieur ou égal est lu : c'est l'accusé de lecture. */
    luJusquAu: timestamp("lu_jusqu_au", { withTimezone: true }),
    /** Retiré ou parti : il ne lit plus rien de nouveau, son historique reste. */
    retireLe: timestamp("retire_le", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique("participants_unique").on(t.conversationId, t.userId), index("participants_user_idx").on(t.organizationId, t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    auteurId: uuid("auteur_id").references(() => users.id, { onDelete: "set null" }),
    corps: text("corps"),
    /** Pièce jointe : clé dans le dépôt, jamais le fichier en base. */
    chemin: text("chemin"),
    nomFichier: text("nom_fichier"),
    typeMime: text("type_mime"),
    tailleOctets: integer("taille_octets"),
    /** texte | sondage | evenement | contact : règles dans `./genres.ts`. */
    genre: text("genre").notNull().default("texte"),
    /** Contenu d'un message structuré ; `corps` en garde le résumé lisible. */
    donnees: jsonb("donnees").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    check("messages_genre", sql`${t.genre} in ('texte', 'sondage', 'evenement', 'contact')`),
    check("messages_contenu", sql`${t.corps} IS NOT NULL OR ${t.chemin} IS NOT NULL OR ${t.deletedAt} IS NOT NULL`),
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  ],
);

/**
 * Réponses aux messages structurés : un vote de sondage (`valeur` = indice de
 * la réponse) ou la réponse à un événement (`oui`, `peut_etre`, `non`).
 */
export const reponsesMessages = pgTable(
  "reponses_messages",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    valeur: text("valeur").notNull(),
    ...timestamps,
  },
  (t) => [unique("reponses_messages_unique").on(t.messageId, t.userId, t.valeur), index("reponses_messages_message_idx").on(t.messageId)],
);

export type Conversation = typeof conversations.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type MessageInterne = typeof messages.$inferSelect;
