import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, timestamps } from "./_shared";
import { organizations } from "./tenancy";

/**
 * Abonnement : vestige de l'époque où le logiciel se vendait à plusieurs
 * entreprises. Maria Suite ne s'en sert plus ; les tables restent pour ne pas
 * imposer de migration destructive.
 */

/** Comment l'entreprise a réglé son abonnement. */
export const moyenPaiementAbonnement = pgEnum("moyen_paiement_abonnement", [
  "wave",
  "orange_money",
  "mtn_money",
  "moov_money",
  "virement",
  "especes",
  "autre",
]);

/**
 * Paiement d'abonnement, enregistré par un administrateur de la plateforme.
 *
 * Chaque paiement prolonge `organizations.paye_jusqu_au` d'un nombre de mois.
 * La ligne reste : c'est l'historique que l'entreprise consulte, et la preuve
 * en cas de contestation. Une erreur se corrige par un paiement négatif, pas
 * par une suppression.
 */
export const paiementsAbonnement = pgTable(
  "paiements_abonnement",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    plan: text("plan").notNull(),
    montant: money("montant").notNull(),
    mois: integer("mois").notNull(),
    moyen: moyenPaiementAbonnement("moyen").notNull(),
    /** Référence de la transaction mobile money ou du virement. */
    reference: text("reference"),
    recuLe: date("recu_le").notNull(),
    /** Période couverte, recopiée au moment de l'enregistrement. */
    couvreDu: date("couvre_du").notNull(),
    couvreAu: date("couvre_au").notNull(),
    /** Adresse de l'administrateur de la plateforme qui l'a saisi. */
    enregistrePar: text("enregistre_par").notNull(),
    ...timestamps,
  },
  (t) => [
    index("paiements_abonnement_org_idx").on(t.organizationId),
    check("paiements_abonnement_mois", sql`${t.mois} between -24 and 36 and ${t.mois} <> 0`),
  ],
);

export type PaiementAbonnement = typeof paiementsAbonnement.$inferSelect;
