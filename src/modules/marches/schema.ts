import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { piecesCommerciales } from "@/modules/facturation/schema";
import { projets } from "@/modules/projets/schema";
import { tiers } from "@/modules/tiers/schema";

/**
 * Marchés : les deux sens de l'appel d'offres, et les conventions.
 *
 *   · `soumissions`    — l'entreprise RÉPOND à un appel d'offres (marché
 *                        public, bailleur, grand compte privé) ;
 *   · `consultations`  — l'entreprise LANCE une mise en concurrence et
 *                        compare les `offres` reçues ;
 *   · `conventions`    — contrats-cadres, leurs échéances et leurs `avenants`.
 */

// ------------------------------------------------------------- soumissions

export const typeMarche = pgEnum("type_marche", ["public", "prive", "bailleur"]);
export const statutSoumission = pgEnum("statut_soumission", ["veille", "en_preparation", "deposee", "gagnee", "perdue", "abandonnee"]);

export const soumissions = pgTable(
  "soumissions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Référence interne : AO-2026-00001. */
    numero: text("numero").notNull(),
    /** Référence officielle de l'avis : DAO n° 2026/014/MCLU. */
    reference: text("reference"),
    intitule: text("intitule").notNull(),
    /** Acheteur : ministère, mairie, ONG, société. Fiche tiers facultative. */
    autorite: text("autorite").notNull(),
    clientId: uuid("client_id").references(() => tiers.id, { onDelete: "set null" }),
    type: typeMarche("type").notNull().default("public"),
    lots: text("lots"),
    budgetEstime: money("budget_estime"),
    montantPropose: money("montant_propose"),
    caution: money("caution"),
    cautionRestituee: boolean("caution_restituee").notNull().default(false),
    /** Date et heure limites de dépôt : au-delà, l'offre n'est plus reçue. */
    dateLimite: timestamp("date_limite", { withTimezone: true }),
    deposeeLe: timestamp("deposee_le", { withTimezone: true }),
    statut: statutSoumission("statut").notNull().default("veille"),
    motifResultat: text("motif_resultat"),
    responsableId: uuid("responsable_id"),
    notes: text("notes"),
    /** Projet ouvert depuis le marché gagné : client, objet et montant repris sans ressaisie. */
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "set null" }),
    /** Devis préparé depuis le marché gagné. */
    devisId: uuid("devis_id").references(() => piecesCommerciales.id, { onDelete: "set null" }),
    userId: uuid("user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("soumissions_numero_unique").on(t.organizationId, t.numero),
    check("soumissions_montants", sql`(${t.budgetEstime} IS NULL OR ${t.budgetEstime} >= 0) AND (${t.montantPropose} IS NULL OR ${t.montantPropose} >= 0) AND (${t.caution} IS NULL OR ${t.caution} >= 0)`),
    index("soumissions_org_idx").on(t.organizationId, t.statut, t.dateLimite),
  ],
);

/**
 * Pièce du dossier de soumission : attestation de régularité fiscale, CNPS,
 * RCCM, caution… Une case à cocher et, si on l'a, le fichier. Un dossier
 * incomplet à la date limite est un dossier rejeté.
 */
export const piecesSoumission = pgTable(
  "pieces_soumission",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    soumissionId: uuid("soumission_id")
      .notNull()
      .references(() => soumissions.id, { onDelete: "cascade" }),
    libelle: text("libelle").notNull(),
    rang: integer("rang").notNull().default(0),
    fournie: boolean("fournie").notNull().default(false),
    chemin: text("chemin"),
    nomFichier: text("nom_fichier"),
    typeMime: text("type_mime"),
    ...timestamps,
  },
  (t) => [index("pieces_soumission_idx").on(t.soumissionId, t.rang)],
);

// ----------------------------------------------------------- consultations

export const statutConsultation = pgEnum("statut_consultation", ["brouillon", "ouverte", "cloturee", "attribuee", "annulee"]);
export const statutOffre = pgEnum("statut_offre", ["invitee", "recue", "retenue", "ecartee"]);

export const consultations = pgTable(
  "consultations",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** CONS-2026-00001. */
    numero: text("numero").notNull(),
    objet: text("objet").notNull(),
    description: text("description"),
    /** Ce qui sera jugé, dit aux candidats : délais, garanties, références. */
    criteres: text("criteres"),
    budget: money("budget"),
    dateLimite: date("date_limite"),
    /** Poids du prix dans la note, en points de base (6000 = 60 %). Le reste va à la note technique. */
    poidsPrixBp: integer("poids_prix_bp").notNull().default(6000),
    statut: statutConsultation("statut").notNull().default("brouillon"),
    attribueeLe: timestamp("attribuee_le", { withTimezone: true }),
    userId: uuid("user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("consultations_numero_unique").on(t.organizationId, t.numero),
    check("consultations_poids", sql`${t.poidsPrixBp} BETWEEN 0 AND 10000`),
  ],
);

/** Offre d'un fournisseur : invité d'abord, puis offre reçue, enfin retenue ou écartée. */
export const offres = pgTable(
  "offres",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "cascade" }),
    tiersId: uuid("tiers_id")
      .notNull()
      .references(() => tiers.id, { onDelete: "restrict" }),
    statut: statutOffre("statut").notNull().default("invitee"),
    montant: money("montant"),
    delaiJours: integer("delai_jours"),
    /** Note technique sur 100, portée par l'acheteur. */
    noteTechnique: integer("note_technique"),
    commentaire: text("commentaire"),
    recueLe: timestamp("recue_le", { withTimezone: true }),
    chemin: text("chemin"),
    nomFichier: text("nom_fichier"),
    typeMime: text("type_mime"),
    ...timestamps,
  },
  (t) => [
    unique("offres_unique").on(t.consultationId, t.tiersId),
    check("offres_note", sql`${t.noteTechnique} IS NULL OR ${t.noteTechnique} BETWEEN 0 AND 100`),
    check("offres_montant", sql`${t.montant} IS NULL OR ${t.montant} >= 0`),
  ],
);

// ------------------------------------------------------------- conventions

export const sensConvention = pgEnum("sens_convention", ["client", "fournisseur", "partenariat"]);

/**
 * Convention, contrat-cadre : avec un client, un fournisseur, un partenaire.
 * Son état — en vigueur, à renouveler, expirée — se DÉDUIT des dates et du
 * préavis ; seule la résiliation est un fait inscrit.
 */
export const conventions = pgTable(
  "conventions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** CONV-2026-00001. */
    numero: text("numero").notNull(),
    intitule: text("intitule").notNull(),
    sens: sensConvention("sens").notNull(),
    partenaire: text("partenaire").notNull(),
    tiersId: uuid("tiers_id").references(() => tiers.id, { onDelete: "set null" }),
    objet: text("objet"),
    /** Montant annuel ou plafond, en francs. */
    montant: money("montant"),
    debut: date("debut").notNull(),
    fin: date("fin"),
    reconductionTacite: boolean("reconduction_tacite").notNull().default(false),
    /** Jours avant la fin pour dénoncer ou renégocier. */
    preavisJours: integer("preavis_jours").notNull().default(30),
    resilieeLe: date("resiliee_le"),
    motifResiliation: text("motif_resiliation"),
    chemin: text("chemin"),
    nomFichier: text("nom_fichier"),
    typeMime: text("type_mime"),
    notes: text("notes"),
    /** Projet ouvert depuis la convention signée. */
    projetId: uuid("projet_id").references(() => projets.id, { onDelete: "set null" }),
    /** Devis préparé depuis la convention signée. */
    devisId: uuid("devis_id").references(() => piecesCommerciales.id, { onDelete: "set null" }),
    userId: uuid("user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("conventions_numero_unique").on(t.organizationId, t.numero),
    check("conventions_dates", sql`${t.fin} IS NULL OR ${t.fin} >= ${t.debut}`),
    check("conventions_preavis", sql`${t.preavisJours} BETWEEN 0 AND 730`),
    index("conventions_fin_idx").on(t.organizationId, t.fin),
  ],
);

/** Avenant : il modifie la convention, sans réécrire ce qui a été signé avant. */
export const avenants = pgTable(
  "avenants",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conventionId: uuid("convention_id")
      .notNull()
      .references(() => conventions.id, { onDelete: "cascade" }),
    rang: integer("rang").notNull(),
    objet: text("objet").notNull(),
    signeLe: date("signe_le").notNull(),
    nouvelleFin: date("nouvelle_fin"),
    nouveauMontant: money("nouveau_montant"),
    chemin: text("chemin"),
    nomFichier: text("nom_fichier"),
    typeMime: text("type_mime"),
    userId: uuid("user_id"),
    ...timestamps,
  },
  (t) => [unique("avenants_rang_unique").on(t.conventionId, t.rang)],
);

export type Soumission = typeof soumissions.$inferSelect;
export type PieceSoumission = typeof piecesSoumission.$inferSelect;
export type Consultation = typeof consultations.$inferSelect;
export type Offre = typeof offres.$inferSelect;
export type Convention = typeof conventions.$inferSelect;
export type Avenant = typeof avenants.$inferSelect;
