import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees, workers } from "@/modules/personnes/schema";

import type { OptionsColonne } from "./colonnes";

/**
 * Tâches.
 *
 * Une tâche se crée pour soi ou s'attribue à quelqu'un, puis s'exécute :
 * à faire → en cours → terminée. Chaque passage garde son auteur et son heure,
 * et le journal d'activité garde le reste — qui l'a créée, attribuée,
 * réattribuée, rouverte.
 *
 * L'exécutant se choisit dans le Personnel (`employees`), pas dans une liste
 * de comptes ressaisie à part. Celui qui commence et termine dans
 * l'application reste un UTILISATEUR (`assignee_user_id`) : le compte du
 * collaborateur quand il en a un, sinon le créateur, qui suit la tâche pour lui —
 * un magasinier sans compte ne verra jamais l'écran.
 */
export const statutTache = pgEnum("statut_tache", ["a_faire", "en_cours", "terminee", "annulee"]);

/** Priorité. L'ordre de l'enum est celui du tri : `urgente` passe devant. */
export const prioriteTache = pgEnum("priorite_tache", ["basse", "normale", "haute", "urgente"]);

export const taches = pgTable(
  "taches",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : TCH-2026-00042. */
    numero: text("numero").notNull(),
    titre: text("titre").notNull(),
    description: text("description"),
    priorite: prioriteTache("priorite").notNull().default("normale"),
    statut: statutTache("statut").notNull().default("a_faire"),
    /** Date limite, sans heure : « pour vendredi ». */
    echeance: date("echeance"),
    /** Premier jour prévu, sans heure : la barre du Gantt part de là. Facultatif. */
    dateDebut: date("date_debut"),

    creeParUserId: uuid("cree_par_user_id").notNull(),
    /** Qui la fait avancer dans l'application. Égal au créateur pour une tâche personnelle. */
    assigneeUserId: uuid("assignee_user_id").notNull(),
    /** Collaborateur du Personnel à qui la tâche est confiée. Nul : tâche pour soi, ou ancienne tâche. */
    assigneeEmployeId: uuid("assignee_employe_id").references(() => employees.id, { onDelete: "set null" }),
    attribueeLe: timestamp("attribuee_le", { withTimezone: true }).notNull().defaultNow(),

    demarreeLe: timestamp("demarree_le", { withTimezone: true }),
    termineeLe: timestamp("terminee_le", { withTimezone: true }),
    termineeParUserId: uuid("terminee_par_user_id"),
    /** Ce qui a été fait, dit par l'exécutant en terminant. */
    compteRendu: text("compte_rendu"),

    annuleeLe: timestamp("annulee_le", { withTimezone: true }),
    motifAnnulation: text("motif_annulation"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("taches_numero_unique").on(t.organizationId, t.numero),
    check("taches_terminee_datee", sql`${t.statut} <> 'terminee' OR ${t.termineeLe} IS NOT NULL`),
    check("taches_annulation_motivee", sql`${t.statut} <> 'annulee' OR ${t.motifAnnulation} IS NOT NULL`),
    check("taches_debut_avant_echeance", sql`${t.dateDebut} IS NULL OR ${t.echeance} IS NULL OR ${t.dateDebut} <= ${t.echeance}`),
    index("taches_assignee_idx").on(t.organizationId, t.assigneeUserId, t.statut),
    index("taches_createur_idx").on(t.organizationId, t.creeParUserId),
  ],
);

export type Tache = typeof taches.$inferSelect;
export type StatutTache = Tache["statut"];
export type PrioriteTache = Tache["priorite"];

/**
 * Colonnes personnalisées du tableau des tâches, communes à toute
 * l'entreprise : « Client », « Montant du devis », « Chantier », « Validé »…
 *
 * Le type ne change plus après la création : une valeur saisie comme nombre
 * ne se relit pas comme une étiquette. Retirer une colonne est logique — ses
 * valeurs restent en base, et la trace avec elles.
 */
export const tachesColonnes = pgTable(
  "taches_colonnes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    libelle: text("libelle").notNull(),
    /** `texte`, `nombre`, `date`, `etiquette`, `case`, `lien` (`TYPES_COLONNE`). */
    type: text("type").notNull(),
    /** Étiquettes et leurs couleurs, unité d'un nombre. */
    options: jsonb("options").$type<OptionsColonne>().notNull().default({}),
    /** Ordre d'affichage, de gauche à droite. */
    rang: integer("rang").notNull().default(0),
    creeParUserId: uuid("cree_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("taches_colonnes_type", sql`${t.type} IN ('texte', 'nombre', 'date', 'etiquette', 'case', 'lien')`),
    index("taches_colonnes_rang").on(t.organizationId, t.rang),
  ],
);

/**
 * La valeur d'une colonne pour une tâche, en texte normalisé par
 * `normaliserValeur` : un nombre est un entier écrit en chiffres, une date
 * un jour ISO, une étiquette sa clé, une case « 1 ». Nulle : vidée.
 */
export const tachesValeurs = pgTable(
  "taches_valeurs",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tacheId: uuid("tache_id")
      .notNull()
      .references(() => taches.id, { onDelete: "cascade" }),
    colonneId: uuid("colonne_id")
      .notNull()
      .references(() => tachesColonnes.id, { onDelete: "cascade" }),
    valeur: text("valeur"),
    modifieParUserId: uuid("modifie_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("taches_valeurs_unique").on(t.tacheId, t.colonneId),
    index("taches_valeurs_org").on(t.organizationId, t.colonneId),
  ],
);

export type ColonneTache = typeof tachesColonnes.$inferSelect;

/**
 * Intervenants d'une tâche : ceux qui y travaillent, en plus du responsable
 * qui la fait avancer. Un collaborateur du Personnel OU un intervenant
 * (manœuvre, tâcheron, chauffeur occasionnel), jamais les deux sur la même
 * ligne — même règle que les missions. Un collaborateur qui a un compte voit
 * la tâche dans sa liste.
 *
 * Retirer quelqu'un est logique : la ligne garde qui l'avait ajouté, et le
 * réajouter la ranime.
 */
export const tachesIntervenants = pgTable(
  "taches_intervenants",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tacheId: uuid("tache_id")
      .notNull()
      .references(() => taches.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").references(() => workers.id, { onDelete: "cascade" }),
    ajouteParUserId: uuid("ajoute_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("taches_intervenants_un_seul", sql`(${t.employeeId} IS NULL) <> (${t.workerId} IS NULL)`),
    uniqueIndex("taches_intervenants_collaborateur").on(t.tacheId, t.employeeId).where(sql`${t.employeeId} IS NOT NULL`),
    uniqueIndex("taches_intervenants_intervenant").on(t.tacheId, t.workerId).where(sql`${t.workerId} IS NOT NULL`),
    index("taches_intervenants_tache").on(t.organizationId, t.tacheId),
  ],
);

/**
 * Sous-tâches : ce qu'il faut faire, précisément, pour mener la tâche à bien.
 * Chacune se coche, peut porter son responsable (collaborateur OU
 * intervenant) et son échéance. Retrait logique.
 */
export const tachesSousTaches = pgTable(
  "taches_sous_taches",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tacheId: uuid("tache_id")
      .notNull()
      .references(() => taches.id, { onDelete: "cascade" }),
    titre: text("titre").notNull(),
    faite: boolean("faite").notNull().default(false),
    faiteLe: timestamp("faite_le", { withTimezone: true }),
    faiteParUserId: uuid("faite_par_user_id"),
    responsableEmployeId: uuid("responsable_employe_id").references(() => employees.id, { onDelete: "set null" }),
    responsableWorkerId: uuid("responsable_worker_id").references(() => workers.id, { onDelete: "set null" }),
    echeance: date("echeance"),
    rang: integer("rang").notNull().default(0),
    creeParUserId: uuid("cree_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("taches_sous_taches_un_responsable", sql`${t.responsableEmployeId} IS NULL OR ${t.responsableWorkerId} IS NULL`),
    check("taches_sous_taches_faite_datee", sql`NOT ${t.faite} OR ${t.faiteLe} IS NOT NULL`),
    index("taches_sous_taches_tache").on(t.organizationId, t.tacheId, t.rang),
  ],
);

/**
 * Mises à jour d'une tâche : le fil où l'équipe dit où elle en est. Texte
 * brut — React l'échappe, rien de saisi n'est interprété. Retrait logique,
 * par son auteur seulement.
 */
export const tachesMessages = pgTable(
  "taches_messages",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tacheId: uuid("tache_id")
      .notNull()
      .references(() => taches.id, { onDelete: "cascade" }),
    auteurUserId: uuid("auteur_user_id").notNull(),
    corps: text("corps").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [index("taches_messages_tache").on(t.organizationId, t.tacheId, t.createdAt)],
);

/**
 * Fichiers d'une tâche. Le fichier vit dans le dépôt (`src/lib/stockage`),
 * sous `<entreprise>/<id>.<ext>` ; seule sa clé est ici. Ouvert par URL
 * signée, jamais par un lien direct.
 */
export const tachesFichiers = pgTable(
  "taches_fichiers",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tacheId: uuid("tache_id")
      .notNull()
      .references(() => taches.id, { onDelete: "cascade" }),
    nomFichier: text("nom_fichier").notNull(),
    typeMime: text("type_mime").notNull(),
    /** Octets : un entier. */
    taille: integer("taille").notNull(),
    chemin: text("chemin").notNull(),
    deposeParUserId: uuid("depose_par_user_id").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [check("taches_fichiers_taille", sql`${t.taille} > 0`), index("taches_fichiers_tache").on(t.organizationId, t.tacheId)],
);
