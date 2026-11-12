import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

import { NATURES_TIERS } from "./natures";

/** Type de client (`./natures.ts`) : particulier, entreprise, ONG, mutuelle, association, coopérative. */
export const natureTiers = pgEnum("nature_tiers", NATURES_TIERS);

/**
 * Tiers : client, fournisseur, ou les deux.
 *
 * Une seule table, et pas deux, parce que sur le terrain le même partenaire
 * tient souvent les deux rôles. Le grossiste qui livre la boutique lui rachète
 * ses invendus ; le garage qui répare le camion du transporteur lui achète ses
 * pneus. Deux fiches séparées pour la même personne morale donnent deux
 * numéros de téléphone à tenir à jour, deux adresses, et une compensation
 * entre créance et dette qu'aucun écran ne sait plus faire.
 *
 * Ce qui diffère entre les deux rôles n'est pas l'identité, c'est
 * l'imputation : un client se solde en 411, un fournisseur en 401. D'où deux
 * colonnes de compte auxiliaire sur la même ligne.
 *
 * Ce que cette table NE porte PAS : ni encours, ni chiffre d'affaires, ni
 * solde dû. Ces valeurs se déduisent des écritures — les stocker à côté des
 * lignes qui les composent garantit qu'elles divergeront. Voir
 * `soldesParAuxiliaire` dans `requetes.ts`.
 */
export const tiers = pgTable(
  "tiers",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Référence interne : C0001, F001. Attribuée par `document_sequences`. */
    code: text("code").notNull(),

    nature: natureTiers("nature").notNull().default("entreprise"),
    nom: text("nom").notNull(),

    /**
     * Les deux rôles sont des booléens indépendants, pas un enum à trois
     * valeurs : « client », « fournisseur » et « les deux » se manipuleraient
     * alors par un test à trois branches à chaque filtre.
     */
    estClient: boolean("est_client").notNull().default(true),
    estFournisseur: boolean("est_fournisseur").notNull().default(false),

    telephone: text("telephone"),
    email: text("email"),
    adresse: text("adresse"),
    ville: text("ville"),
    /** Pays du tiers. Nul = celui de l'entreprise. */
    paysCode: text("pays_code"),

    /**
     * Identifiant fiscal. En Côte d'Ivoire le Numéro de Compte Contribuable,
     * ailleurs autre chose : le libellé affiché vient du pays de l'entreprise,
     * jamais d'un référentiel codé en dur.
     */
    identifiantFiscal: text("identifiant_fiscal"),

    /** Secteur d'activité, pour le regroupement : Alimentaire, Hygiène, BTP… */
    secteur: text("secteur"),

    /** Compte auxiliaire client, classe 411 du plan SYSCOHADA. */
    compteClient: text("compte_client"),
    /** Compte auxiliaire fournisseur, classe 401. */
    compteFournisseur: text("compte_fournisseur"),

    /**
     * Encours de crédit autorisé. Zéro signifie « paiement comptant » : c'est
     * le cas par défaut, et il doit l'être — le crédit s'accorde, il ne se
     * subit pas.
     */
    plafondEncours: money("plafond_encours").notNull().default(0),
    /** Délai de règlement accordé au client, en jours. */
    delaiReglementJours: integer("delai_reglement_jours").notNull().default(0),
    /**
     * Délai de livraison constaté du fournisseur, en jours. Alimente le calcul
     * de réapprovisionnement : sans lui, la quantité suggérée arrive trop tard.
     */
    delaiLivraisonJours: integer("delai_livraison_jours").notNull().default(0),

    notes: text("notes"),

    /**
     * Un tiers ne se supprime pas tant qu'il porte des pièces : il se
     * désactive. Il disparaît des listes de saisie, ses factures restent.
     */
    actif: boolean("actif").notNull().default(true),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("tiers_code_unique").on(t.organizationId, t.code),
    /**
     * Deux tiers ne peuvent pas partager un compte auxiliaire : le lettrage
     * les confondrait, et un règlement solderait la facture d'un autre.
     * Postgres admet plusieurs NULL sous une contrainte d'unicité, donc les
     * tiers sans compte ne se gênent pas.
     */
    unique("tiers_compte_client_unique").on(t.organizationId, t.compteClient),
    unique("tiers_compte_fournisseur_unique").on(t.organizationId, t.compteFournisseur),
    check(
      "tiers_role_obligatoire",
      sql`${t.estClient} OR ${t.estFournisseur}`,
    ),
    check(
      "tiers_delais_positifs",
      sql`${t.delaiReglementJours} >= 0 AND ${t.delaiLivraisonJours} >= 0 AND ${t.plafondEncours} >= 0`,
    ),
    index("tiers_org_nom_idx").on(t.organizationId, t.nom),
    index("tiers_org_client_idx").on(t.organizationId, t.estClient),
    index("tiers_org_fournisseur_idx").on(t.organizationId, t.estFournisseur),
  ],
);

export type Tiers = typeof tiers.$inferSelect;

/**
 * Contact d'un tiers : la personne physique derrière la personne morale.
 * SOCOCE est le client — c'est elle qui doit, qui est relancée, dont le NCC
 * s'imprime ; M. Konan, responsable des achats, est celui qui a passé la
 * commande et à qui la facture est adressée. Les confondre, c'est facturer
 * M. Konan, qui ne doit rien.
 */
export const contactsTiers = pgTable(
  "contacts_tiers",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tiersId: uuid("tiers_id")
      .notNull()
      .references(() => tiers.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    /** Responsable des achats, comptable, gérant… */
    fonction: text("fonction"),
    telephone: text("telephone"),
    email: text("email"),
    /** Proposé par défaut sur les nouvelles pièces. Un seul par tiers. */
    principal: boolean("principal").notNull().default(false),
    actif: boolean("actif").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("contacts_tiers_tiers_idx").on(t.organizationId, t.tiersId),
    uniqueIndex("contacts_tiers_principal_unique").on(t.tiersId).where(sql`${t.principal} AND ${t.actif}`),
  ],
);

export type ContactTiers = typeof contactsTiers.$inferSelect;
