import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { actifs } from "@/modules/actifs/schema";
import { tiers } from "@/modules/tiers/schema";

/**
 * Parc informatique.
 *
 * Un équipement EST un actif : utilisateur attribué, pannes, garantie et
 * entretiens passent par le moteur Actifs. Ce module ajoute la fiche technique
 * — numéro de série, système, adresse réseau — et les licences logicielles,
 * qui ne sont pas des objets mais des droits d'usage comptés par poste.
 */

export const categorieEquipement = pgEnum("categorie_equipement", [
  "portable",
  "fixe",
  "serveur",
  "ecran",
  "imprimante",
  "reseau",
  "telephone",
  "tablette",
  "onduleur",
  "peripherique",
  "autre",
]);

export const equipementsInformatiques = pgTable(
  "equipements_informatiques",
  {
    actifId: uuid("actif_id")
      .primaryKey()
      .references(() => actifs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    categorie: categorieEquipement("categorie").notNull().default("portable"),
    marque: text("marque"),
    modele: text("modele"),
    /** Numéro de série du fabricant : c'est lui que demande le SAV. */
    numeroSerie: text("numero_serie"),
    systeme: text("systeme"),
    processeur: text("processeur"),
    memoireGo: integer("memoire_go"),
    stockageGo: integer("stockage_go"),
    /** Nom sur le réseau : PC-COMPTA-01. */
    nomReseau: text("nom_reseau"),
    adresseIp: text("adresse_ip"),
    adresseMac: text("adresse_mac"),
    accessoires: text("accessoires"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    // Deux équipements ne portent pas le même numéro de série ; plusieurs
    // peuvent ne pas en avoir (câble, souris), d'où l'unicité sur les seuls
    // numéros renseignés — PostgreSQL ne compare pas les NULL.
    unique("equipements_numero_serie_unique").on(t.organizationId, t.numeroSerie),
    check("equipements_memoire", sql`${t.memoireGo} IS NULL OR ${t.memoireGo} BETWEEN 0 AND 100000`),
    check("equipements_stockage", sql`${t.stockageGo} IS NULL OR ${t.stockageGo} BETWEEN 0 AND 10000000`),
  ],
);

export const typeLicence = pgEnum("type_licence", ["abonnement", "perpetuelle"]);

/**
 * Licence logicielle : un droit d'usage pour N postes.
 *
 * Les postes utilisés ne se stockent pas : c'est le nombre d'équipements
 * auxquels la licence est attribuée. Une licence qui en compte plus que ses
 * postes est en défaut de conformité — c'est ce qu'un audit d'éditeur cherche.
 */
export const licencesLogicielles = pgTable(
  "licences_logicielles",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    logiciel: text("logiciel").notNull(),
    editeur: text("editeur"),
    type: typeLicence("type").notNull().default("abonnement"),
    /** Clé d'activation. Ne s'affiche qu'à qui tient les licences. */
    cle: text("cle"),
    postes: integer("postes").notNull().default(1),
    /** Fin d'abonnement ou de support. Nulle pour une licence perpétuelle sans support. */
    expireLe: date("expire_le"),
    /** Coût de la période (abonnement) ou d'achat (perpétuelle), en francs entiers. */
    cout: money("cout").notNull().default(0),
    /** Fournisseur de la licence, choisi parmi les tiers. */
    fournisseurId: uuid("fournisseur_id").references(() => tiers.id, { onDelete: "set null" }),
    /**
     * Nom du fournisseur : recopié de la fiche à l'enregistrement, ou saisi
     * pour un revendeur sans fiche (une boutique en ligne).
     */
    fournisseur: text("fournisseur"),
    notes: text("notes"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("licences_postes", sql`${t.postes} BETWEEN 1 AND 100000`),
    check("licences_cout", sql`${t.cout} >= 0`),
    index("licences_expiration_idx").on(t.organizationId, t.expireLe),
  ],
);

/** Licence installée sur un équipement : un poste consommé. */
export const licencesAttribuees = pgTable(
  "licences_attribuees",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    licenceId: uuid("licence_id")
      .notNull()
      .references(() => licencesLogicielles.id, { onDelete: "cascade" }),
    actifId: uuid("actif_id")
      .notNull()
      .references(() => actifs.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    ...timestamps,
  },
  (t) => [unique("licences_attribuees_unique").on(t.licenceId, t.actifId), index("licences_attribuees_actif_idx").on(t.actifId)],
);

export type EquipementInformatique = typeof equipementsInformatiques.$inferSelect;
export type LicenceLogicielle = typeof licencesLogicielles.$inferSelect;
export type CategorieEquipement = EquipementInformatique["categorie"];
