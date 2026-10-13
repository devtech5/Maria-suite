import { bigint, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { organizations } from "./tenancy";

export const sequencePeriodicity = pgEnum("sequence_periodicity", [
  "aucune",
  "annuelle",
  "mensuelle",
  "journaliere",
]);

/**
 * Compteurs de numérotation des pièces.
 *
 * Toute pièce qui sort de Maria Suite — ticket de caisse, facture, devis, bon de
 * transfert, contrat — porte un numéro séquentiel, sans trou et sans doublon.
 * C'est une exigence comptable, pas un confort.
 *
 * Le format vient du terrain. Un ticket SOCOCE relevé à Yopougon porte
 * « 05-00066854/G » : préfixe du magasin, compteur sur 8 chiffres, suffixe.
 * D'où les colonnes `prefix`, `padding` et `suffix` plutôt qu'un format figé.
 *
 * `scope` isole les compteurs qui doivent avancer indépendamment : chaque
 * caisse a sa propre suite, sinon deux caisses en parallèle se marchent dessus.
 *
 * Attribution d'un numéro : toujours dans la transaction qui crée la pièce,
 * via un UPDATE ... RETURNING sur cette ligne, jamais par un SELECT puis
 * UPDATE — deux caissiers qui encaissent en même temps obtiendraient le même
 * numéro.
 */
export const documentSequences = pgTable(
  "document_sequences",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Nature de la pièce : vente, facture, devis, avoir, transfert, contrat… */
    key: text("key").notNull(),

    /**
     * Point de vente, dépôt ou agence propriétaire du compteur.
     * Chaîne vide quand le compteur est unique pour toute l'entreprise.
     */
    scope: text("scope").notNull().default(""),

    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    padding: integer("padding").notNull().default(6),

    periodicity: sequencePeriodicity("periodicity").notNull().default("annuelle"),
    /** Période courante du compteur : « 2026 », « 2026-08 », « 2026-08-23 » ou vide. */
    periodKey: text("period_key").notNull().default(""),

    nextValue: bigint("next_value", { mode: "number" }).notNull().default(1),

    ...timestamps,
  },
  (t) => [
    unique("document_sequences_unique").on(
      t.organizationId,
      t.key,
      t.scope,
      t.periodKey,
    ),
  ],
);
