import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";

/**
 * Visiteurs : points d'accueil, agents d'accueil, registre des visites.
 * Règles dans `./regles.ts`.
 */

/** Un point d'accueil : le siège, un chantier, un site minier. Chacun tient son registre. */
export const accueils = pgTable(
  "accueils",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    lieu: text("lieu"),
    /** Exiger la pièce d'identité à l'arrivée (oui partout par défaut). */
    pieceExigee: boolean("piece_exigee").notNull().default(true),
    actif: boolean("actif").notNull().default(true),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("accueils_nom_unique").on(t.organizationId, t.nom)],
);

/** Qui tient quel accueil. Un agent ne voit que le registre de ses accueils. */
export const accueilsAgents = pgTable(
  "accueils_agents",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accueilId: uuid("accueil_id")
      .notNull()
      .references(() => accueils.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("accueils_agents_unique").on(t.accueilId, t.userId), index("accueils_agents_user_idx").on(t.organizationId, t.userId)],
);

export const visites = pgTable(
  "visites",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accueilId: uuid("accueil_id")
      .notNull()
      .references(() => accueils.id, { onDelete: "restrict" }),
    /** `V-2026-00042`, attribué à la création (`document_sequences`, clé `visite`). */
    numero: text("numero").notNull(),
    statut: text("statut").notNull(),

    nom: text("nom").notNull(),
    telephone: text("telephone"),
    societe: text("societe"),
    motif: text("motif").notNull(),
    typePiece: text("type_piece"),
    numeroPiece: text("numero_piece"),

    /** La personne visitée, quand elle a un compte : prévenue dans la cloche à l'arrivée. */
    visiteUserId: uuid("visite_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Service ou personne visitée sans compte, en clair. */
    visiteLibelle: text("visite_libelle"),

    /** Rendez-vous annoncé à l'avance : l'heure attendue. */
    attenduLe: timestamp("attendu_le", { withTimezone: true }),
    arriveeLe: timestamp("arrivee_le", { withTimezone: true }),
    sortieLe: timestamp("sortie_le", { withTimezone: true }),

    /** Jeton du QR du badge : un scan retrouve la visite, sans rien dire d'autre. */
    jetonBadge: text("jeton_badge").notNull(),

    photoRecto: text("photo_recto"),
    photoVerso: text("photo_verso"),
    photoVisiteur: text("photo_visiteur"),
    /** Quand les photos ont été effacées, trois mois après la visite. */
    photosEffaceesLe: timestamp("photos_effacees_le", { withTimezone: true }),

    annoncePar: uuid("annonce_par").references(() => users.id, { onDelete: "set null" }),
    arriveePar: uuid("arrivee_par").references(() => users.id, { onDelete: "set null" }),
    sortiePar: uuid("sortie_par").references(() => users.id, { onDelete: "set null" }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("visites_numero_unique").on(t.organizationId, t.numero),
    unique("visites_jeton_unique").on(t.jetonBadge),
    index("visites_accueil_idx").on(t.organizationId, t.accueilId, t.statut),
    index("visites_arrivee_idx").on(t.organizationId, t.arriveeLe),
    index("visites_attendu_idx").on(t.organizationId, t.attenduLe),
    check("visites_statut", sql`${t.statut} in ('attendue', 'presente', 'sortie', 'annulee')`),
    check("visites_arrivee", sql`${t.statut} in ('attendue', 'annulee') or ${t.arriveeLe} is not null`),
    check("visites_sortie", sql`${t.statut} <> 'sortie' or ${t.sortieLe} is not null`),
  ],
);

export type Visite = typeof visites.$inferSelect;
export type Accueil = typeof accueils.$inferSelect;
