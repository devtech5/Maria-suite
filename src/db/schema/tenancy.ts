import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { currencyCode, money, primaryId, rowVersion, timestamps } from "./_shared";
import { users } from "./auth";
import { roles } from "./rbac";

export const organizationStatus = pgEnum("organization_status", [
  "essai",
  "actif",
  "suspendu",
  "resilie",
]);

export const membershipStatus = pgEnum("membership_status", [
  "invite",
  "actif",
  "suspendu",
]);

/**
 * L'entreprise cliente. C'est la frontière d'isolation : toute donnée métier
 * porte un organization_id, sans exception.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: primaryId(),
    name: text("name").notNull(),
    /** Identifiant lisible, utilisé dans les URL. */
    slug: text("slug").notNull(),

    /** Pays d'exercice — pilote la fiscalité, la paie et les moyens de paiement. */
    countryCode: text("country_code").notNull().default("CI"),
    currency: currencyCode().notNull().default("XOF"),
    timezone: text("timezone").notNull().default("Africa/Abidjan"),

    /**
     * Identifiant fiscal. En Côte d'Ivoire, le Numéro de Compte Contribuable.
     * Le libellé affiché dépend du pays : ne jamais coder « NINEA » en dur.
     */
    taxId: text("tax_id"),
    legalForm: text("legal_form"),
    taxRegime: text("tax_regime"),

    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    logoUrl: text("logo_url"),
    /**
     * Logo, en image réduite (data URL, 96 Ko au plus), réduit dans le
     * navigateur avant l'envoi. Exception assumée à la règle « les fichiers
     * vont au dépôt » : le ticket de caisse l'imprime HORS CONNEXION, et une
     * URL signée de cinq minutes n'y survivrait pas.
     */
    logo: text("logo"),
    /** Registre du commerce (RCCM en zone OHADA). */
    rccm: text("rccm"),
    /** Couleur primaire de l'entreprise, #RRGGBB : en-tête et titre des documents. */
    couleurDocuments: text("couleur_documents"),
    /** Couleur secondaire, #RRGGBB : filets d'accent des documents. */
    couleurSecondaire: text("couleur_secondaire"),
    /** Mentions de pied de page : coordonnées bancaires, conditions, capital. */
    piedDePage: text("pied_de_page"),
    /** Devise (formule) de l'entreprise, en pied des documents. */
    slogan: text("slogan"),
    /** Site internet, dans les coordonnées de l'en-tête. */
    siteWeb: text("site_web"),
    /** Capital social, en unités entières de la devise (FCFA). */
    capitalSocial: money("capital_social"),

    status: organizationStatus("status").notNull().default("essai"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    /** Formule souscrite : `essentiel`, `pro`… Nulle pendant l'essai. */
    plan: text("plan"),
    /**
     * Dernier jour couvert par un paiement. Prolongé à chaque paiement
     * enregistré ; au-delà, sept jours de grâce, puis lecture seule.
     */
    payeJusquAu: date("paye_jusqu_au"),

    /**
     * Minutes sans activité avant que l'écran se verrouille. La caisse en est
     * exemptée : elle reste ouverte entre deux clients.
     */
    delaiVerrouillageMinutes: integer("delai_verrouillage_minutes").notNull().default(15),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("organizations_slug_unique").on(t.slug),
    check("organizations_logo_taille", sql`${t.logo} IS NULL OR (length(${t.logo}) <= 131072 AND ${t.logo} LIKE 'data:image/%')`),
    check("organizations_delai_verrouillage", sql`${t.delaiVerrouillageMinutes} BETWEEN 1 AND 240`),
    check("organizations_couleur", sql`${t.couleurDocuments} IS NULL OR ${t.couleurDocuments} ~ '^#[0-9a-fA-F]{6}$'`),
    check("organizations_couleur_secondaire", sql`${t.couleurSecondaire} IS NULL OR ${t.couleurSecondaire} ~ '^#[0-9a-fA-F]{6}$'`),
    check("organizations_capital_social_positif", sql`${t.capitalSocial} IS NULL OR ${t.capitalSocial} >= 0`),
  ],
);

/**
 * Rattachement d'un utilisateur à une entreprise, avec son rôle.
 * Un même utilisateur peut appartenir à plusieurs entreprises.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),

    status: membershipStatus("status").notNull().default("invite"),
    /** Le créateur de l'entreprise : ne peut pas être révoqué. */
    isOwner: boolean("is_owner").notNull().default(false),

    invitedByUserId: uuid("invited_by_user_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("memberships_org_user_unique").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/**
 * Modules activés par entreprise. Le produit se vend au module : cette table
 * porte à la fois le périmètre fonctionnel visible et l'assiette de facturation.
 * La clé correspond à une entrée du registre des modules (src/modules).
 */
export const organizationModules = pgTable(
  "organization_modules",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [unique("organization_modules_unique").on(t.organizationId, t.moduleKey)],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  modules: many(organizationModules),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  role: one(roles, { fields: [memberships.roleId], references: [roles.id] }),
}));

export const organizationModulesRelations = relations(organizationModules, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationModules.organizationId],
    references: [organizations.id],
  }),
}));
