import { relations } from "drizzle-orm";
import {
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

import { primaryId, rowVersion, timestamps } from "./_shared";
import { memberships } from "./tenancy";

export const userStatus = pgEnum("user_status", ["actif", "suspendu"]);

export const otpChannel = pgEnum("otp_channel", ["sms", "whatsapp", "email"]);

export const otpPurpose = pgEnum("otp_purpose", [
  "connexion",
  "inscription",
  "reinitialisation",
  "verification_telephone",
]);

/**
 * Compte de connexion.
 *
 * IMPORTANT — un utilisateur n'est PAS une personne métier.
 *
 * Trois natures de personnes coexistent dans Maria Suite et ne doivent jamais être
 * confondues dans une seule table :
 *
 *   1. `users`      — celui qui ouvre le logiciel (compte, rôle, permissions)
 *   2. `employees`  — le salarié déclaré (contrat, bulletin, CNPS, ITS)
 *   3. `workers`    — l'intervenant : maçon, ferrailleur, manœuvre, tâcheron,
 *                     chauffeur occasionnel, serveur extra, coach…
 *                     Payé à la journée, à la tâche ou à l'unité d'œuvre.
 *
 * Un maçon sur un chantier n'ouvre jamais l'application et n'a pas de bulletin
 * de paie : il n'a donc ni ligne ici, ni ligne dans `employees`. Les tables 2
 * et 3 vivent dans le module RH et pointent vers `users` de façon optionnelle.
 *
 * L'identification se fait par ADRESSE E-MAIL ET MOT DE PASSE. Le téléphone,
 * qui servait d'identifiant à l'origine (code à usage unique), n'est plus
 * qu'un contact facultatif. `email` reste nullable en base pour les comptes
 * créés avant ce changement ; le code exige l'adresse pour tout compte neuf,
 * et un compte sans adresse ni mot de passe ne peut tout simplement pas entrer.
 */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    /** Contact facultatif, format E.164 : +2250700000000. N'identifie plus. */
    phone: text("phone"),
    /** Identifiant de connexion, toujours en minuscules. */
    email: text("email"),
    fullName: text("full_name").notNull(),

    /** Empreinte Argon2id. Nulle : le compte ne peut pas se connecter. */
    passwordHash: text("password_hash"),
    /**
     * Mot de passe provisoire, donné par un responsable : il doit être changé
     * à la première connexion. Un mot de passe que deux personnes connaissent
     * n'authentifie plus personne.
     */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** Échecs consécutifs. Remis à zéro par une connexion réussie. */
    failedLogins: integer("failed_logins").notNull().default(0),
    /** Verrou temporaire après trop d'échecs : freine la force brute. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),

    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

    locale: text("locale").notNull().default("fr"),
    status: userStatus("status").notNull().default("actif"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("users_phone_unique").on(t.phone),
    unique("users_email_unique").on(t.email),
  ],
);

/**
 * Session ouverte sur un appareil.
 *
 * `deviceId` est fourni par le client et reste stable d'une session à l'autre :
 * c'est lui qui porte le curseur de synchronisation hors connexion.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Entreprise active. Nulle tant que l'utilisateur n'en a pas choisi une. */
    organizationId: uuid("organization_id"),

    /** Seule l'empreinte du jeton est stockée, jamais le jeton lui-même. */
    tokenHash: text("token_hash").notNull(),

    deviceId: text("device_id"),
    deviceName: text("device_name"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /**
     * Dernière activité signalée par le navigateur — souris, clavier, toucher.
     * Au-delà du délai de l'entreprise, la session se verrouille.
     * Voir `src/lib/auth/verrou.ts`.
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Écran voilé : la session reste ouverte, mais aucune page ne se sert
     * avant que le mot de passe ait été ressaisi.
     */
    verrouilleeLe: timestamp("verrouillee_le", { withTimezone: true }),
    /**
     * Dernier signe d'un écran exempté du verrou (caisse, salle Meeting) resté
     * affiché. Ne compte pas comme activité pour le verrou — une caisse ouverte
     * ne doit pas rouvrir la gestion —, seulement contre la déconnexion après
     * inactivité. Voir `sessionEchue`.
     */
    maintenueLe: timestamp("maintenue_le", { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    unique("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_device_idx").on(t.deviceId),
  ],
);

/**
 * Codes à usage unique, envoyés par SMS ou WhatsApp.
 * Le code n'est jamais stocké en clair et le nombre de tentatives est plafonné.
 */
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: primaryId(),
    /** Numéro de téléphone ou adresse e-mail visé. */
    destination: text("destination").notNull(),
    channel: otpChannel("channel").notNull(),
    purpose: otpPurpose("purpose").notNull(),

    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),

    ...timestamps,
  },
  (t) => [index("verification_codes_destination_idx").on(t.destination, t.purpose)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(memberships),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
