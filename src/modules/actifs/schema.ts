import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees, workers } from "@/modules/personnes/schema";
import { tiers } from "@/modules/tiers/schema";

/**
 * Nature de l'actif.
 *
 * Quatre types pour cinq entrées du périmètre : parc informatique, parc
 * automobile, garage, flotte et patrimoine sont le MÊME objet — une chose
 * affectée à quelqu'un, entretenue, avec des échéances et un coût cumulé.
 * Seuls le libellé de la fiche et les échéances usuelles changent.
 */
export const typeActif = pgEnum("type_actif", [
  "vehicule",
  "informatique",
  "engin",
  "mobilier",
  // Bureau, entrepôt, magasin : un local s'entretient comme un engin —
  // nettoyage, plomberie, climatisation, contrôle des extincteurs.
  "local",
]);

/**
 * État de service.
 *
 * `entretien` et `immobilise` se distinguent : le premier est prévu et
 * temporaire, le second subi. Les confondre ferait passer une panne longue
 * pour une vidange, et le taux de disponibilité du parc perdrait tout sens.
 */
export const statutActif = pgEnum("statut_actif", [
  "actif",
  "entretien",
  "immobilise",
  "cede",
]);

/**
 * Actif : une chose qu'on suit parce qu'elle coûte, s'use et s'entretient.
 *
 * Ce que cette table NE porte PAS : ni coût de maintenance cumulé, ni relevé de
 * compteur courant. Le premier est la somme des interventions, le second le
 * dernier relevé enregistré — les stocker à côté des lignes qui les composent
 * garantit qu'ils divergeront, comme un stock tenu ailleurs que dans ses
 * mouvements.
 *
 * L'actif peut appartenir à un CLIENT et non à l'entreprise : c'est le cas du
 * garage, qui suit la voiture qu'on lui confie sans la posséder. `proprietaire`
 * porte alors le tiers, et l'intervention devient facturable au lieu d'être une
 * charge. Sans cette colonne, il faudrait un module « garage » distinct pour
 * dire exactement la même chose.
 */
export const actifs = pgTable(
  "actifs",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Référence courte : VEH-001, INF-004. Compteur propre à chaque type. */
    code: text("code").notNull(),
    designation: text("designation").notNull(),

    type: typeActif("type").notNull().default("vehicule"),
    statut: statutActif("statut").notNull().default("actif"),

    /**
     * À qui l'actif est confié. Deux colonnes et non une, parce qu'un salarié
     * et un intervenant sont deux natures de personnes qui ne se fusionnent
     * jamais : un fourgon confié à un chauffeur salarié n'engage pas les mêmes
     * responsabilités qu'une bétonnière laissée à un tâcheron.
     */
    employeId: uuid("employe_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    intervenantId: uuid("intervenant_id").references(() => workers.id, {
      onDelete: "set null",
    }),

    /**
     * Propriétaire, quand ce n'est pas l'entreprise. Renseigné : l'actif est
     * celui d'un client, ses interventions se facturent et sa valeur n'entre
     * pas dans celle du parc.
     */
    proprietaireId: uuid("proprietaire_id").references(() => tiers.id, {
      onDelete: "restrict",
    }),

    /** Lieu de rattachement : Abidjan, Bouaké, un chantier. */
    site: text("site"),

    dateAcquisition: date("date_acquisition"),
    /** Valeur d'entrée, en francs entiers. Zéro pour un actif de client. */
    valeurAcquisition: money("valeur_acquisition").notNull().default(0),

    /**
     * Unité du compteur : « km », « h ». Nulle quand l'usage ne se mesure pas
     * — une chambre froide s'entretient au calendrier, pas au kilométrage.
     */
    uniteCompteur: text("unite_compteur"),

    notes: text("notes"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("actifs_code_unique").on(t.organizationId, t.code),
    check("actifs_valeur_positive", sql`${t.valeurAcquisition} >= 0`),
    /**
     * Un actif est confié à UNE personne, pas à deux. La contrainte évite le
     * cas où l'écran affiche un nom et la responsabilité en désigne un autre.
     */
    check(
      "actifs_une_seule_affectation",
      sql`${t.employeId} IS NULL OR ${t.intervenantId} IS NULL`,
    ),
    index("actifs_org_statut_idx").on(t.organizationId, t.statut),
    index("actifs_org_type_idx").on(t.organizationId, t.type),
    index("actifs_proprietaire_idx").on(t.proprietaireId),
  ],
);

/**
 * Nature de l'intervention.
 *
 * `preventif` est prévu, `correctif` subi, `controle` imposé par un tiers —
 * visite technique, contrôle réglementaire. La proportion de correctif sur
 * préventif est le seul indicateur qui dise si un parc est tenu ou subi.
 */
export const natureIntervention = pgEnum("nature_intervention", [
  "preventif",
  "correctif",
  "controle",
]);

/**
 * Intervention : ce qui a été fait sur un actif, et ce que cela a coûté.
 *
 * Une intervention ne pose PAS d'écriture comptable, et c'est délibéré. Le
 * coût constaté ici est un engagement de dépense ; la charge naît quand la
 * facture du prestataire est enregistrée, ou quand le bon de caisse est payé.
 * Les deux ensemble compteraient la dépense deux fois — c'est le raisonnement
 * qui vaut déjà pour le stock, dont les mouvements portent une valeur sans
 * jamais toucher le journal.
 *
 * Quand l'actif appartient à un client, l'intervention est FACTURABLE : son
 * montant est un produit à venir, pas une charge. C'est ce qui permet au même
 * moteur de porter un parc automobile et un garage.
 */
export const interventions = pgTable(
  "interventions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : INT-000123. */
    numero: text("numero").notNull(),

    actifId: uuid("actif_id")
      .notNull()
      .references(() => actifs.id, { onDelete: "restrict" }),

    nature: natureIntervention("nature").notNull().default("correctif"),
    libelle: text("libelle").notNull(),

    /**
     * Qui a fait le travail. Le tiers quand c'est un garage extérieur, le
     * texte libre quand c'est l'atelier interne — qui n'a pas de fiche tiers.
     */
    prestataireId: uuid("prestataire_id").references(() => tiers.id, {
      onDelete: "set null",
    }),
    prestataire: text("prestataire"),

    /** Coût de l'intervention, en francs entiers. */
    cout: money("cout").notNull().default(0),

    /**
     * Vrai quand l'actif appartient à un client : le montant est alors un
     * produit à facturer et non une charge. Figé à la saisie, et non déduit à
     * la lecture : un actif racheté au client plus tard ne doit pas requalifier
     * rétroactivement les interventions déjà facturées.
     */
    facturable: boolean("facturable").notNull().default(false),

    effectueeLe: timestamp("effectuee_le", { withTimezone: true })
      .notNull()
      .defaultNow(),

    notes: text("notes"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("interventions_numero_unique").on(t.organizationId, t.numero),
    check("interventions_cout_positif", sql`${t.cout} >= 0`),
    index("interventions_actif_idx").on(t.organizationId, t.actifId),
    index("interventions_journal_idx").on(t.organizationId, t.effectueeLe),
  ],
);

/**
 * Relevé de compteur : kilométrage, heures de marche.
 *
 * Une table à part, et non une colonne sur l'actif. Un compteur n'est pas un
 * état que l'on met à jour : c'est une SUITE de constats datés. Le garder en
 * colonne perdrait l'historique — donc la consommation entre deux entretiens,
 * donc la seule information qui dise si un moteur commence à fatiguer.
 *
 * Le relevé courant est le plus récent, jamais le plus élevé : un compteur
 * remplacé repart de zéro, et prendre le maximum ferait attendre l'entretien
 * suivant pendant deux cent mille kilomètres.
 */
export const relevesCompteur = pgTable(
  "releves_compteur",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    actifId: uuid("actif_id")
      .notNull()
      .references(() => actifs.id, { onDelete: "cascade" }),

    /** Valeur lue, dans l'unité de l'actif. Entier : on ne relève pas 87 400,3 km. */
    valeur: bigint("valeur", { mode: "number" }).notNull(),

    /** Intervention qui a produit le relevé, quand il vient de là. */
    interventionId: uuid("intervention_id").references(() => interventions.id, {
      onDelete: "cascade",
    }),

    releveLe: timestamp("releve_le", { withTimezone: true })
      .notNull()
      .defaultNow(),

    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("releves_compteur_valeur_positive", sql`${t.valeur} >= 0`),
    index("releves_compteur_actif_idx").on(t.actifId, t.releveLe),
  ],
);

/**
 * Nature de l'échéance.
 *
 * `assurance` et `visite` sont opposables à un tiers — un contrôle routier, un
 * sinistre. `entretien` et `garantie` ne le sont pas. La distinction gouverne
 * la gravité : rouler sans assurance immobilise le véhicule et le conducteur.
 */
export const natureEcheance = pgEnum("nature_echeance", [
  "assurance",
  "visite",
  "garantie",
  "entretien",
  // Taxe annuelle du véhicule et patente de transport : opposables comme
  // l'assurance — un contrôle routier les demande.
  "vignette",
  "patente",
]);

/**
 * Échéance : ce qui arrive à terme sur un actif.
 *
 * DEUX déclencheurs qui coexistent et ne se comparent pas : une date, un seuil
 * de compteur. Les traiter pareil est l'erreur courante — un véhicule qui roule
 * peu dépasse sa date d'assurance sans jamais atteindre son seuil d'entretien,
 * un engin qui tourne en continu fait l'inverse. Une vidange « tous les
 * 5 000 km ou six mois » porte légitimement les deux, et c'est le premier
 * atteint qui déclenche.
 */
export const echeances = pgTable(
  "echeances",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    actifId: uuid("actif_id")
      .notNull()
      .references(() => actifs.id, { onDelete: "cascade" }),

    nature: natureEcheance("nature").notNull(),
    libelle: text("libelle"),

    /** Terme calendaire. Nul quand l'échéance ne se déclenche qu'au compteur. */
    echeanceLe: date("echeance_le"),
    /** Seuil de compteur. Nul quand l'échéance est purement calendaire. */
    compteurCible: bigint("compteur_cible", { mode: "number" }),

    /**
     * Une échéance honorée ne se supprime pas : elle se date. L'historique des
     * visites techniques est précisément ce qu'un contrôle demande à voir.
     */
    honoreeLe: timestamp("honoree_le", { withTimezone: true }),
    /** Intervention qui l'a honorée, quand il y en a une. */
    interventionId: uuid("intervention_id").references(() => interventions.id, {
      onDelete: "set null",
    }),

    notes: text("notes"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    /**
     * Une échéance sans déclencheur n'échoit jamais : elle resterait
     * indéfiniment dans la liste sans que personne ne sache quoi en faire.
     */
    check(
      "echeances_un_declencheur",
      sql`${t.echeanceLe} IS NOT NULL OR ${t.compteurCible} IS NOT NULL`,
    ),
    check(
      "echeances_compteur_positif",
      sql`${t.compteurCible} IS NULL OR ${t.compteurCible} >= 0`,
    ),
    index("echeances_actif_idx").on(t.organizationId, t.actifId),
    index("echeances_date_idx").on(t.organizationId, t.echeanceLe),
  ],
);

export type Actif = typeof actifs.$inferSelect;
export type Intervention = typeof interventions.$inferSelect;
export type ReleveCompteur = typeof relevesCompteur.$inferSelect;
export type Echeance = typeof echeances.$inferSelect;
export type TypeActif = Actif["type"];
export type StatutActif = Actif["statut"];
export type NatureIntervention = Intervention["nature"];
export type NatureEcheance = Echeance["nature"];
