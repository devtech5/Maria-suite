import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees } from "@/modules/personnes/schema";

/**
 * Moyens généraux : fournitures de bureau.
 *
 * L'entretien des locaux n'a pas de table ici : un local est un actif de type
 * `local`, et ses nettoyages, réparations et contrôles passent par le moteur
 * Actifs (interventions, échéances), comme la vidange d'un véhicule.
 *
 * Les fournitures se comptent à l'UNITÉ entière — ramette, boîte, cartouche,
 * rouleau. Personne ne sort une demi-ramette du placard ; une quantité à
 * virgule n'aurait ici aucun sens et ne ferait qu'ouvrir la porte à la dérive.
 */

/** Une fourniture du placard : ce qu'on achète, range et distribue. */
export const fournitures = pgTable(
  "fournitures",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    designation: text("designation").notNull(),
    /** Unité de comptage : ramette, boîte, cartouche. */
    unite: text("unite").notNull().default("unité"),
    /** En dessous de ce stock, la fourniture est à racheter. Zéro : pas d'alerte. */
    seuil: integer("seuil").notNull().default(0),
    /** Une fourniture qu'on n'achète plus se retire du catalogue ; ses mouvements restent. */
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("fournitures_designation_unique").on(t.organizationId, t.designation),
    check("fournitures_seuil", sql`${t.seuil} >= 0`),
  ],
);

export const sensMouvementFourniture = pgEnum("sens_mouvement_fourniture", ["entree", "sortie"]);

/**
 * Mouvement de fourniture : une entrée (achat, don) ou une sortie (remise à un
 * salarié ou à un service).
 *
 * Le stock n'est stocké NULLE PART : c'est la somme des entrées moins celle
 * des sorties. Un compteur tenu à côté finirait par diverger de ses
 * mouvements, et l'inventaire du placard deviendrait inexplicable.
 *
 * Le coût ne vit que sur l'entrée : c'est l'achat qui coûte. Comme pour une
 * intervention sur un actif, il ne pose pas d'écriture comptable — la charge
 * naît avec la facture du fournisseur ou le bon de caisse.
 */
export const mouvementsFournitures = pgTable(
  "mouvements_fournitures",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fournitureId: uuid("fourniture_id")
      .notNull()
      .references(() => fournitures.id, { onDelete: "restrict" }),
    sens: sensMouvementFourniture("sens").notNull(),
    quantite: integer("quantite").notNull(),
    date: date("date").notNull(),
    /** Coût total de l'entrée, en francs. Jamais sur une sortie. */
    cout: money("cout"),
    /** Bénéficiaire d'une sortie : un salarié… */
    employeId: uuid("employe_id").references(() => employees.id, { onDelete: "set null" }),
    /** …et/ou un service : Comptabilité, Accueil, Chantier de Cocody. */
    service: text("service"),
    note: text("note"),
    userId: uuid("user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("mouvements_fournitures_quantite", sql`${t.quantite} > 0`),
    check("mouvements_fournitures_cout", sql`${t.cout} IS NULL OR (${t.sens} = 'entree' AND ${t.cout} >= 0)`),
    index("mouvements_fournitures_fourniture_idx").on(t.organizationId, t.fournitureId),
    index("mouvements_fournitures_date_idx").on(t.organizationId, t.date),
  ],
);

export type Fourniture = typeof fournitures.$inferSelect;
export type MouvementFourniture = typeof mouvementsFournitures.$inferSelect;
export type SensMouvementFourniture = (typeof sensMouvementFourniture.enumValues)[number];
