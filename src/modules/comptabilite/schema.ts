import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

export const journalCode = pgEnum("journal_code", ["VE", "AC", "CA", "BQ", "OD"]);

export const statutEcriture = pgEnum("statut_ecriture", [
  "brouillon",
  "validee",
  "verrouillee",
]);

/** Nature de la pièce à l'origine de l'écriture. */
export const originePiece = pgEnum("origine_piece", [
  "facture",
  "avoir",
  "reglement",
  "achat",
  "bon_caisse",
  "vente_pos",
  "bon_paiement",
  "saisie",
  "virement",
  "avance",
  "arrete_caisse",
  "releve",
  "paie",
  "tva",
  "cloture",
  "reprise",
  "commission",
  "prestation",
  "mouvement",
  "impot",
  "affectation",
]);

/**
 * Écriture comptable.
 *
 * Toute écriture porte sa pièce d'origine. C'est ce qui la rend explicable :
 * un solde qu'on ne sait pas rattacher à un document est un solde qu'on ne
 * sait pas justifier devant un contrôle.
 *
 * `piece_numero` est conservé en texte à côté de `piece_id` : si la pièce
 * source venait à disparaître, l'écriture doit rester lisible. Une comptabilité
 * ne se réécrit pas parce qu'un document a été supprimé ailleurs.
 */
export const ecritures = pgTable(
  "ecritures",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    journal: journalCode("journal").notNull(),
    /** Numéro séquentiel, attribué par journal et par exercice. */
    numero: text("numero").notNull(),
    /** Exercice de rattachement : « 2026 ». */
    exercice: text("exercice").notNull(),

    /** Date comptable — celle de la pièce, pas celle de la saisie. */
    dateEcriture: date("date_ecriture").notNull(),
    libelle: text("libelle").notNull(),

    origine: originePiece("origine").notNull(),
    pieceId: uuid("piece_id"),
    /**
     * Numéro de la pièce d'origine. C'est LUI qui porte l'unicité, pas
     * `piece_id` : un identifiant technique peut être absent, alors qu'une
     * pièce sans numéro n'existe pas. Et en Postgres, plusieurs NULL passent
     * une contrainte d'unicité — l'unicité sur `piece_id` n'aurait donc rien
     * empêché dès qu'il est vide.
     */
    pieceNumero: text("piece_numero").notNull(),

    statut: statutEcriture("statut").notNull().default("validee"),
    /**
     * Une écriture verrouillée appartient à une période déclarée. Elle ne se
     * modifie plus : on la corrige par une contre-passation, jamais en place.
     */
    verrouilleeLe: timestamp("verrouillee_le", { withTimezone: true }),
    passeeParUserId: uuid("passee_par_user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    /**
     * Une pièce ne se comptabilise qu'une fois.
     *
     * Sans cette contrainte, un double clic sur « Comptabiliser » doublerait
     * le chiffre d'affaires — et l'erreur ne se verrait qu'à la balance.
     */
    unique("ecritures_piece_unique").on(t.organizationId, t.origine, t.pieceNumero),
    unique("ecritures_numero_unique").on(t.organizationId, t.journal, t.exercice, t.numero),
    index("ecritures_org_date_idx").on(t.organizationId, t.dateEcriture),
    index("ecritures_piece_idx").on(t.pieceId),
  ],
);

/**
 * Ligne d'écriture.
 *
 * Une ligne est soit au débit, soit au crédit, jamais les deux. La contrainte
 * est posée en base et pas seulement dans le code : une ligne à la fois
 * débitrice et créditrice fausserait tous les cumuls sans rien déclencher.
 *
 * L'équilibre global — somme des débits égale somme des crédits — est garanti
 * par la transaction d'écriture, qui refuse de poser une écriture qui ne tombe
 * pas juste.
 */
export const lignesEcriture = pgTable(
  "lignes_ecriture",
  {
    id: primaryId(),
    ecritureId: uuid("ecriture_id")
      .notNull()
      .references(() => ecritures.id, { onDelete: "cascade" }),
    /** Dupliqué depuis l'écriture : tout filtrage passe par l'entreprise. */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Compte général du plan SYSCOHADA : 411, 701, 4431… */
    compte: text("compte").notNull(),
    libelleCompte: text("libelle_compte").notNull(),
    /** Compte auxiliaire du tiers, quand le compte général en admet un. */
    auxiliaire: text("auxiliaire"),

    debit: money("debit").notNull().default(0),
    credit: money("credit").notNull().default(0),

    /** Ordre d'affichage : une écriture se lit dans l'ordre où elle a été posée. */
    ordre: integer("ordre").notNull().default(0),

    /**
     * Code de lettrage. Deux lignes portant le même code sont rapprochées :
     * une facture et son règlement. Nul tant que la créance est ouverte.
     */
    lettrage: text("lettrage"),

    ...timestamps,
  },
  (t) => [
    check(
      "lignes_ecriture_sens_unique",
      sql`(${t.debit} = 0) OR (${t.credit} = 0)`,
    ),
    check(
      "lignes_ecriture_montants_positifs",
      sql`${t.debit} >= 0 AND ${t.credit} >= 0`,
    ),
    index("lignes_ecriture_ecriture_idx").on(t.ecritureId),
    index("lignes_ecriture_compte_idx").on(t.organizationId, t.compte),
    index("lignes_ecriture_lettrage_idx").on(t.organizationId, t.lettrage),
  ],
);
