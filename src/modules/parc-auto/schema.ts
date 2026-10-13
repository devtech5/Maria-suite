import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { money, primaryId, quantity, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { actifs } from "@/modules/actifs/schema";
import { employees } from "@/modules/personnes/schema";

/**
 * Parc automobile.
 *
 * Un véhicule EST un actif : sa fiche, son affectation (le conducteur), ses
 * interventions, ses relevés de kilométrage et ses échéances (assurance,
 * visite technique, vignette, patente) vivent dans le moteur Actifs. Ce module
 * n'ajoute que ce qui est propre à un véhicule — immatriculation, carte grise,
 * énergie — et le carnet de carburant.
 *
 * Aucun cumul n'est stocké : kilométrage, consommation et coût au kilomètre se
 * déduisent des pleins, des relevés et des interventions.
 */

export const energieVehicule = pgEnum("energie_vehicule", ["essence", "gasoil", "hybride", "electrique", "gpl"]);

export const vehicules = pgTable(
  "vehicules",
  {
    /** Même identifiant que l'actif : un véhicule n'existe pas sans sa fiche d'actif. */
    actifId: uuid("actif_id")
      .primaryKey()
      .references(() => actifs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    immatriculation: text("immatriculation").notNull(),
    marque: text("marque"),
    modele: text("modele"),
    annee: integer("annee"),
    energie: energieVehicule("energie"),
    /** Numéro de châssis (VIN), tel qu'il figure sur la carte grise. */
    numeroChassis: text("numero_chassis"),
    numeroCarteGrise: text("numero_carte_grise"),
    puissanceFiscale: integer("puissance_fiscale"),
    places: integer("places"),
    couleur: text("couleur"),
    /** Contenance du réservoir, en litres entiers : borne la saisie d'un plein. */
    reservoirLitres: integer("reservoir_litres"),
    /** Usage déclaré : service, transport de personnes, livraison, véhicule de fonction. */
    usage: text("usage"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("vehicules_immatriculation_unique").on(t.organizationId, t.immatriculation),
    check("vehicules_annee", sql`${t.annee} IS NULL OR ${t.annee} BETWEEN 1950 AND 2100`),
    check("vehicules_places", sql`${t.places} IS NULL OR ${t.places} BETWEEN 1 AND 100`),
    check("vehicules_reservoir", sql`${t.reservoirLitres} IS NULL OR ${t.reservoirLitres} BETWEEN 1 AND 2000`),
  ],
);

/**
 * Plein de carburant.
 *
 * Le volume est en millièmes de litre (le millilitre), comme toute quantité
 * de Maria Suite ; le montant en francs entiers. Le prix au litre se déduit, il
 * ne se stocke pas.
 *
 * Le kilométrage relevé à la pompe alimente AUSSI le compteur de l'actif :
 * c'est le relevé le plus fréquent d'un véhicule, et le seul que le
 * conducteur pense à noter.
 *
 * Le plein ne pose pas d'écriture : il se paie par la trésorerie (bon de
 * caisse, carte carburant), qui porte la charge. Le compter ici aussi
 * passerait le carburant deux fois au résultat.
 */
export const pleinsCarburant = pgTable(
  "pleins_carburant",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actifId: uuid("actif_id")
      .notNull()
      .references(() => actifs.id, { onDelete: "cascade" }),

    faitLe: timestamp("fait_le", { withTimezone: true }).notNull().defaultNow(),
    volume: quantity("volume").notNull(),
    montant: money("montant").notNull(),
    kilometrage: bigint("kilometrage", { mode: "number" }),
    /**
     * Réservoir rempli à ras. La consommation ne se calcule qu'entre deux
     * pleins complets : un appoint de dix litres ne dit rien du trajet.
     */
    complet: boolean("complet").notNull().default(true),
    station: text("station"),
    conducteurId: uuid("conducteur_id").references(() => employees.id, { onDelete: "set null" }),
    notes: text("notes"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("pleins_volume_positif", sql`${t.volume} > 0`),
    check("pleins_montant_positif", sql`${t.montant} >= 0`),
    check("pleins_kilometrage_positif", sql`${t.kilometrage} IS NULL OR ${t.kilometrage} >= 0`),
    index("pleins_actif_idx").on(t.organizationId, t.actifId, t.faitLe),
  ],
);

export type Vehicule = typeof vehicules.$inferSelect;
export type PleinCarburant = typeof pleinsCarburant.$inferSelect;
export type EnergieVehicule = NonNullable<Vehicule["energie"]>;
