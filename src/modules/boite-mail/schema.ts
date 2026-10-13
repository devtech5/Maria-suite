import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";

/**
 * Boîte mail connectée par un utilisateur : sa propre adresse, consultée sans
 * quitter Maria Suite.
 *
 * Les MESSAGES ne sont pas copiés en base : ils restent chez le fournisseur et
 * se lisent en direct, à chaque ouverture. Maria Suite ne garde que les réglages
 * de connexion et le mot de passe d'application, CHIFFRÉ (`src/lib/chiffrement`)
 * — il doit être relu à chaque connexion, il ne peut donc pas être haché.
 *
 * Personnelle : seul son titulaire la lit. Ni le gérant ni le propriétaire
 * n'ouvrent la boîte d'un collègue.
 */
export const comptesCourriel = pgTable(
  "comptes_courriel",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    adresse: text("adresse").notNull(),
    nomAffiche: text("nom_affiche"),
    imapHote: text("imap_hote").notNull(),
    imapPort: integer("imap_port").notNull(),
    imapSecurise: boolean("imap_securise").notNull().default(true),
    smtpHote: text("smtp_hote").notNull(),
    smtpPort: integer("smtp_port").notNull(),
    smtpSecurise: boolean("smtp_securise").notNull().default(true),
    identifiant: text("identifiant").notNull(),
    motDePasseChiffre: text("mot_de_passe_chiffre").notNull(),
    signature: text("signature"),
    verifieLe: timestamp("verifie_le", { withTimezone: true }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("comptes_courriel_utilisateur").on(t.organizationId, t.userId),
    check("comptes_courriel_ports", sql`${t.imapPort} BETWEEN 1 AND 65535 AND ${t.smtpPort} BETWEEN 1 AND 65535`),
  ],
);

export type CompteCourriel = typeof comptesCourriel.$inferSelect;
