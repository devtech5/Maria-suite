import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { articles } from "@/modules/catalogue/schema";
import { projets } from "@/modules/projets/schema";

/**
 * Ratios des calculs chantier d'une entreprise : dosages du béton et du
 * mortier, agglos au m², pertes, conditionnements. Une ligne par entreprise,
 * créée au premier enregistrement ; sans elle, les valeurs de départ
 * (`REGLAGES_DEFAUT`) s'appliquent.
 *
 * `valeurs` est un JSON relu par `normaliserReglages` : un ratio ajouté au
 * code plus tard prend sa valeur de départ sans migration. Les ratios
 * restent « à vérifier » tant qu'un responsable ne les a pas attestés.
 */
export const reglagesCalculs = pgTable(
  "reglages_calculs",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    valeurs: jsonb("valeurs").notNull(),
    verifieLe: timestamp("verifie_le", { withTimezone: true }),
    verifieParUserId: uuid("verifie_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("reglages_calculs_org").on(t.organizationId)],
);

export type LigneReglagesCalculs = typeof reglagesCalculs.$inferSelect;

/**
 * Note de calcul : un calcul figé sur un projet, numéroté `NC-AAAA-NNNNN`
 * (`document_sequences`, clé `note_calcul`). Saisie, résultat, matériaux et
 * ratios du jour sont copiés : changer un ratio demain ne réécrit pas la
 * note d'hier. Elle ne se modifie pas ; elle s'annule, avec un motif, et le
 * numéro reste.
 */
export const notesCalcul = pgTable(
  "notes_calcul",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    projetId: uuid("projet_id")
      .notNull()
      .references(() => projets.id),
    type: text("type").notNull(),
    libelle: text("libelle").notNull(),
    saisie: jsonb("saisie").notNull(),
    resultat: jsonb("resultat").notNull(),
    /** Ce qu'il faut acheter, en millièmes de l'unité d'achat (`Materiau[]`). */
    materiaux: jsonb("materiaux").notNull(),
    /** Les ratios en vigueur au calcul, et s'ils étaient attestés. */
    reglages: jsonb("reglages").notNull(),
    reglagesVerifies: boolean("reglages_verifies").notNull(),
    creeParUserId: uuid("cree_par_user_id").notNull(),
    annuleeLe: timestamp("annulee_le", { withTimezone: true }),
    motifAnnulation: text("motif_annulation"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("notes_calcul_numero").on(t.organizationId, t.numero),
    index("notes_calcul_projet_idx").on(t.organizationId, t.projetId),
    check("notes_calcul_type", sql`${t.type} IN ('beton', 'maconnerie', 'carrelage', 'pente', 'escalier', 'equerre')`),
    check("notes_calcul_libelle", sql`length(${t.libelle}) BETWEEN 2 AND 200`),
    check("notes_calcul_annulation", sql`(${t.annuleeLe} IS NULL) = (${t.motifAnnulation} IS NULL)`),
  ],
);

/** Pièces nées d'une note : devis client, commandes fournisseur (une par fournisseur). */
export const notesCalculSuites = pgTable(
  "notes_calcul_suites",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notesCalcul.id, { onDelete: "cascade" }),
    nature: text("nature").notNull(),
    /** `pieces_commerciales.id` pour un devis, `commandes_achat.id` pour une commande. */
    pieceId: uuid("piece_id").notNull(),
    /** Ce que l'écran affiche : numéro de commande, ou client du devis encore brouillon. */
    libelle: text("libelle").notNull(),
    creeParUserId: uuid("cree_par_user_id").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("notes_calcul_suites_note_idx").on(t.organizationId, t.noteId),
    check("notes_calcul_suites_nature", sql`${t.nature} IN ('devis', 'commande')`),
  ],
);

/**
 * Correspondance d'un matériau des calculs (`ciment`, `fer_ha10`,
 * `carreau_600x600`) avec l'article du catalogue qui se commande et se
 * vend : son prix chiffre la note, sa ligne part sur le devis ou la commande.
 */
export const calculsArticles = pgTable(
  "calculs_articles",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cle: text("cle").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("calculs_articles_cle").on(t.organizationId, t.cle), check("calculs_articles_cle_forme", sql`${t.cle} ~ '^[a-z0-9_]{2,40}$'`)],
);

export type NoteCalcul = typeof notesCalcul.$inferSelect;
