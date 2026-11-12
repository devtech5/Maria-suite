import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, index, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

/**
 * Archives numériques.
 *
 * Chaque utilisateur dispose d'un espace où il dépose ce qu'il doit conserver :
 * contrats signés reçus par message, captures, relevés, exports, photos. Ce
 * n'est pas la bibliothèque de Documents, qui rattache une pièce à un client ou
 * à un véhicule : ici, la pièce appartient à la personne qui l'a déposée, et
 * l'administrateur légal de l'entreprise peut la consulter.
 *
 * Une archive ne se modifie pas. Elle porte l'empreinte SHA-256 de son
 * fichier, prise au dépôt, qui permet d'en prouver l'intégrité plus tard.
 */
/**
 * Qui voit un dossier partagé.
 *
 *   tous      — tous les membres, y compris ceux qui arriveront plus tard ;
 *   selection — seulement les membres désignés. Aucun désigné : le dossier
 *               est invisible de tous, sauf de ceux qui gèrent les dossiers.
 */
export const visibiliteDossierArchives = pgEnum("visibilite_dossier_archives", ["tous", "selection"]);

/**
 * Dossier partagé, créé par un administrateur.
 *
 * Distinct de la rubrique libre qu'un utilisateur pose sur ses propres
 * archives : celle-ci classe, le dossier partage. Il réunit des archives
 * déposées par plusieurs personnes et décide qui peut les voir.
 */
export const dossiersArchives = pgTable(
  "dossiers_archives",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    description: text("description"),
    visibilite: visibiliteDossierArchives("visibilite").notNull().default("selection"),
    /** Ceux qui voient le dossier peuvent-ils y déposer, ou seulement le lire ? */
    depotOuvert: boolean("depot_ouvert").notNull().default(false),
    creeParUserId: uuid("cree_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("dossiers_archives_nom_unique").on(t.organizationId, t.nom)],
);

/** Membres désignés pour un dossier en visibilité « sélection ». */
export const accesDossiersArchives = pgTable(
  "acces_dossiers_archives",
  {
    dossierId: uuid("dossier_id")
      .notNull()
      .references(() => dossiersArchives.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    /**
     * Ce membre peut y DÉPOSER. Voir et déposer se donnent séparément : on
     * accorde de voir à beaucoup, de déposer à quelques-uns. Un déposant voit
     * toujours le dossier (sa ligne en est la preuve).
     */
    peutDeposer: boolean("peut_deposer").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.dossierId, t.userId] }),
    index("acces_dossiers_archives_membre_idx").on(t.organizationId, t.userId),
  ],
);

export const archives = pgTable(
  "archives",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : ARC-2026-00042. */
    numero: text("numero").notNull(),
    /** Auteur et titulaire de l'archive. */
    userId: uuid("user_id").notNull(),

    titre: text("titre").notNull(),
    /**
     * Rubrique libre posée par l'auteur : Contrats, Banque, Fiscal. Elle classe
     * ses archives, elle ne partage rien — à ne pas confondre avec `dossierId`.
     */
    dossier: text("dossier"),
    /** Dossier partagé où l'archive a été déposée. Nul : espace personnel seul. */
    dossierId: uuid("dossier_id").references(() => dossiersArchives.id, { onDelete: "restrict" }),
    description: text("description"),

    chemin: text("chemin").notNull(),
    nomFichier: text("nom_fichier").notNull(),
    typeMime: text("type_mime").notNull(),
    tailleOctets: bigint("taille_octets", { mode: "number" }).notNull(),
    empreinte: char("empreinte", { length: 64 }).notNull(),

    /**
     * Retrait par l'auteur, dans le délai de correction. L'archive disparaît de
     * son espace mais reste conservée et visible de l'administrateur légal :
     * un retrait masque, il n'efface pas.
     */
    retireeLe: timestamp("retiree_le", { withTimezone: true }),
    motifRetrait: text("motif_retrait"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("archives_numero_unique").on(t.organizationId, t.numero),
    unique("archives_chemin_unique").on(t.organizationId, t.chemin),
    check("archives_taille_positive", sql`${t.tailleOctets} > 0`),
    check("archives_retrait_motive", sql`${t.retireeLe} IS NULL OR ${t.motifRetrait} IS NOT NULL`),
    index("archives_titulaire_idx").on(t.organizationId, t.userId, t.createdAt),
    index("archives_dossier_idx").on(t.dossierId, t.createdAt),
  ],
);

export type Archive = typeof archives.$inferSelect;
export type DossierArchives = typeof dossiersArchives.$inferSelect;
export type VisibiliteDossierArchives = DossierArchives["visibilite"];
