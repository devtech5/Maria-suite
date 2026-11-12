import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { actifs } from "@/modules/actifs/schema";
import { employees, workers } from "@/modules/personnes/schema";
import { prestataires } from "@/modules/prestataires/schema";
import { tiers } from "@/modules/tiers/schema";

/**
 * Nature de la mission.
 *
 * Cinq natures pour six entrées du périmètre : livraison, chantier, collecte de
 * terrain, projet, intervention (et, au-delà, l'exploitation agricole). Le
 * modèle est toujours le même — un travail confié à quelqu'un, découpé en
 * étapes, dont on rapporte la preuve depuis le terrain. Seul le préfixe de la
 * référence et les étapes usuelles changent.
 */
export const natureMission = pgEnum("nature_mission", [
  "livraison",
  "chantier",
  "collecte",
  "projet",
  "intervention",
]);

export const statutMission = pgEnum("statut_mission", [
  "planifiee",
  "en_cours",
  "terminee",
  "echouee",
  "annulee",
]);

/**
 * Ce qui atteste une étape. Une livraison contestée, une réserve de chantier ou
 * un relevé de terrain ne valent que par leur preuve : sans elle, il ne reste
 * qu'une case cochée, et une case cochée ne tranche aucun litige.
 */
export const typePreuve = pgEnum("type_preuve", [
  "photo",
  "position",
  "signature",
  "note",
  "formulaire",
]);

/**
 * Mission : un travail confié, avec un lieu, une échéance, des étapes.
 *
 * Ce que cette table NE porte PAS : ni avancement, ni nombre de preuves. Le
 * premier est la part d'étapes accomplies, le second le nombre de lignes de
 * `preuves_mission` — les stocker à côté des lignes qui les composent
 * garantit qu'ils divergeront.
 *
 * L'exécutant est un collaborateur du Personnel OU un intervenant, jamais les deux (même règle que
 * pour les actifs) : un livreur occasionnel payé à la course et un chauffeur
 * sous contrat n'engagent pas les mêmes obligations. Les deux colonnes nulles
 * sont admises — une mission se planifie avant d'être attribuée.
 *
 * `montant` est ce qui se facture au client, en francs entiers. La facture
 * elle-même relève des pièces commerciales.
 */
export const missions = pgTable(
  "missions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** LIV-2026-00012 : préfixe par nature, compteur annuel sans trou. */
    reference: text("reference").notNull(),
    nature: natureMission("nature").notNull(),
    titre: text("titre").notNull(),
    lieu: text("lieu"),

    statut: statutMission("statut").notNull().default("planifiee"),

    employeId: uuid("employe_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    intervenantId: uuid("intervenant_id").references(() => workers.id, {
      onDelete: "set null",
    }),

    clientId: uuid("client_id").references(() => tiers.id, {
      onDelete: "set null",
    }),
    /** Engin ou véhicule employé : relie le terrain au parc et à son coût. */
    actifId: uuid("actif_id").references(() => actifs.id, {
      onDelete: "set null",
    }),

    /** Montant facturable au client. Zéro pour une mission interne. */
    montant: money("montant").notNull().default(0),

    /**
     * Budget des intervenants de la mission : ce qu'on peut engager, en francs
     * entiers. Nul tant qu'aucun intervenant n'est prévu. Les intervenants
     * (manutention, vendeuse, entreprise, prestataire) se confient dans la
     * limite de ce budget et se paient sur place, décharge à l'appui.
     */
    budget: money("budget"),

    echeanceLe: timestamp("echeance_le", { withTimezone: true }),
    debuteLe: timestamp("debute_le", { withTimezone: true }),
    clotureLe: timestamp("cloture_le", { withTimezone: true }),

    /** Pourquoi une mission a échoué ou a été annulée. */
    motif: text("motif"),
    notes: text("notes"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("missions_reference_unique").on(t.organizationId, t.reference),
    check("missions_montant_positif", sql`${t.montant} >= 0`),
    check("missions_budget_positif", sql`${t.budget} IS NULL OR ${t.budget} >= 0`),
    check(
      "missions_un_seul_executant",
      sql`${t.employeId} IS NULL OR ${t.intervenantId} IS NULL`,
    ),
    /** Échouer ou annuler sans dire pourquoi ne s'explique pas au client. */
    check(
      "missions_issue_motivee",
      sql`${t.statut} NOT IN ('echouee', 'annulee') OR ${t.motif} IS NOT NULL`,
    ),
    index("missions_org_statut_idx").on(t.organizationId, t.statut),
    index("missions_org_echeance_idx").on(t.organizationId, t.echeanceLe),
    index("missions_employe_idx").on(t.employeId),
    index("missions_intervenant_idx").on(t.intervenantId),
  ],
);

/**
 * Étape d'une mission.
 *
 * `preuvesRequises` dit ce qu'il faut rapporter pour la clore : une remise de
 * colis exige photo, signature et position. L'étape ne se valide pas tant que
 * l'une manque — c'est le contrôle, pas une indication.
 *
 * `faiteLe` est l'heure DU TERRAIN, pas celle de la remontée : une étape
 * validée à 09:12 sans réseau et remontée à 14:00 reste de 09:12.
 */
export const etapesMission = pgTable(
  "etapes_mission",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),

    ordre: integer("ordre").notNull(),
    libelle: text("libelle").notNull(),
    preuvesRequises: typePreuve("preuves_requises")
      .array()
      .notNull()
      .default(sql`'{}'::type_preuve[]`),

    faiteLe: timestamp("faite_le", { withTimezone: true }),
    faiteParUserId: uuid("faite_par_user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("etapes_mission_ordre_unique").on(t.missionId, t.ordre),
    index("etapes_mission_mission_idx").on(t.missionId, t.ordre),
    index("etapes_mission_org_idx").on(t.organizationId),
  ],
);

/**
 * Preuve rapportée du terrain.
 *
 * L'identifiant vient de l'appareil et l'insertion est idempotente : un réseau
 * instable renvoie deux fois la même photo, qui ne doit compter qu'une fois.
 *
 * `priseLe` est l'heure de la prise sur l'appareil, `recueLe` celle de la
 * remontée. L'écart entre les deux dit combien de temps la preuve a dormi hors
 * réseau ; c'est la première qui fait foi.
 *
 * La position est en MICRO-DEGRÉS entiers (4,0 °N = 4 000 000) : un flottant
 * dériverait, et six décimales donnent déjà la précision d'une dizaine de
 * centimètres, bien au-delà de ce que le GPS d'un téléphone sait donner.
 */
export const preuvesMission = pgTable(
  "preuves_mission",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    etapeId: uuid("etape_id").references(() => etapesMission.id, {
      onDelete: "set null",
    }),

    type: typePreuve("type").notNull(),

    /** Texte d'une note, ou nom de la personne qui a signé. */
    texte: text("texte"),
    /** Clé du fichier dans le dépôt (photo), sous le préfixe de l'entreprise. */
    fichierCle: text("fichier_cle"),
    latitudeMicro: integer("latitude_micro"),
    longitudeMicro: integer("longitude_micro"),
    /** Réponse à un formulaire, quand la preuve en est une. */
    reponseId: uuid("reponse_id"),

    priseLe: timestamp("prise_le", { withTimezone: true }).notNull(),
    recueLe: timestamp("recue_le", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check(
      "preuves_mission_contenu",
      sql`CASE ${t.type}
        WHEN 'position' THEN ${t.latitudeMicro} IS NOT NULL AND ${t.longitudeMicro} IS NOT NULL
        WHEN 'photo' THEN ${t.fichierCle} IS NOT NULL
        WHEN 'formulaire' THEN ${t.reponseId} IS NOT NULL
        ELSE ${t.texte} IS NOT NULL
      END`,
    ),
    check(
      "preuves_mission_position_bornee",
      sql`(${t.latitudeMicro} IS NULL OR ${t.latitudeMicro} BETWEEN -90000000 AND 90000000)
        AND (${t.longitudeMicro} IS NULL OR ${t.longitudeMicro} BETWEEN -180000000 AND 180000000)`,
    ),
    index("preuves_mission_mission_idx").on(t.missionId, t.priseLe),
    index("preuves_mission_etape_idx").on(t.etapeId),
  ],
);

/**
 * Type de champ d'un formulaire de collecte.
 *
 * Un formulaire est une donnée, pas du code : l'entreprise compose le sien, le
 * pousse sur les appareils, et chaque réponse en garde une COPIE de la forme
 * (voir `reponses_formulaire`).
 */
export type TypeChamp = "texte" | "nombre" | "choix" | "photo" | "position" | "oui_non";

export interface ChampFormulaire {
  /** Clé stable de la réponse : renommer le libellé ne perd pas les données. */
  cle: string;
  libelle: string;
  type: TypeChamp;
  obligatoire: boolean;
  /** Valeurs proposées, pour un champ `choix`. */
  options?: string[];
}

export const formulaires = pgTable(
  "formulaires",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    nom: text("nom").notNull(),
    usage: text("usage"),
    champs: jsonb("champs").$type<ChampFormulaire[]>().notNull(),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("formulaires_nom_unique").on(t.organizationId, t.nom),
    check("formulaires_champs_tableau", sql`jsonb_typeof(${t.champs}) = 'array'`),
    index("formulaires_org_idx").on(t.organizationId),
  ],
);

/**
 * Réponse à un formulaire.
 *
 * Elle recopie les champs tels qu'ils étaient à la saisie : modifier le
 * formulaire demain ne doit pas changer le sens d'une réponse d'hier. Les
 * valeurs sont indexées par `cle`.
 */
export const reponsesFormulaire = pgTable(
  "reponses_formulaire",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formulaireId: uuid("formulaire_id")
      .notNull()
      .references(() => formulaires.id, { onDelete: "restrict" }),
    missionId: uuid("mission_id").references(() => missions.id, {
      onDelete: "set null",
    }),

    champs: jsonb("champs").$type<ChampFormulaire[]>().notNull(),
    valeurs: jsonb("valeurs").$type<Record<string, string | number | boolean>>().notNull(),

    priseLe: timestamp("prise_le", { withTimezone: true }).notNull(),
    recueLe: timestamp("recue_le", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("reponses_formulaire_form_idx").on(t.formulaireId, t.priseLe),
    index("reponses_formulaire_mission_idx").on(t.missionId),
    index("reponses_formulaire_org_idx").on(t.organizationId),
  ],
);

/**
 * Intervenant d'une mission : une personne ou une entreprise à qui l'on confie
 * UNE tâche précise — manutention, vendeuse, entreprise de nettoyage,
 * prestataire — pour un montant convenu, imputé au budget de la mission.
 * Payé sur place : le paiement exige la décharge, preuve de paiement.
 * Règles dans `./budget.ts`.
 */
export const intervenantsMission = pgTable(
  "intervenants_mission",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),

    /** La tâche précise : « Manutention », « Vente sur stand »… */
    tache: text("tache").notNull(),
    /** `intervenant`, `entreprise` ou `prestataire`. */
    nature: text("nature").notNull(),
    /** Son nom, recopié : il survit à la fiche d'origine. */
    nom: text("nom").notNull(),
    telephone: text("telephone"),
    workerId: uuid("worker_id").references(() => workers.id, { onDelete: "set null" }),
    prestataireId: uuid("prestataire_id").references(() => prestataires.id, { onDelete: "set null" }),

    /** Montant convenu pour la tâche, en francs entiers. */
    montantConvenu: money("montant_convenu").notNull(),

    /** `a_payer`, `paye` ou `annule`. */
    statut: text("statut").notNull().default("a_payer"),
    payeLe: date("paye_le"),
    /** `especes` ou `mobile_money`. */
    moyen: text("moyen"),
    /** Qui a reçu l'argent, tel qu'il signe la décharge. */
    recuPar: text("recu_par"),
    /** La décharge : photo ou scan du reçu signé. Le fichier vit dans le dépôt. */
    dechargeChemin: text("decharge_chemin"),
    dechargeNom: text("decharge_nom"),
    dechargeType: text("decharge_type"),
    payeParUserId: uuid("paye_par_user_id"),
    motifAnnulation: text("motif_annulation"),
    creeParUserId: uuid("cree_par_user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("intervenants_mission_mission_idx").on(t.organizationId, t.missionId),
    check("intervenants_mission_nature", sql`${t.nature} in ('intervenant', 'entreprise', 'prestataire')`),
    check("intervenants_mission_statut", sql`${t.statut} in ('a_payer', 'paye', 'annule')`),
    check("intervenants_mission_montant", sql`${t.montantConvenu} > 0`),
    check("intervenants_mission_moyen", sql`${t.moyen} IS NULL OR ${t.moyen} in ('especes', 'mobile_money')`),
    // Pas de paiement sans date, moyen, nom de qui a reçu, et décharge.
    check(
      "intervenants_mission_paiement",
      sql`${t.statut} <> 'paye' OR (${t.payeLe} IS NOT NULL AND ${t.moyen} IS NOT NULL AND ${t.recuPar} IS NOT NULL AND ${t.dechargeChemin} IS NOT NULL)`,
    ),
    check("intervenants_mission_annulation_motivee", sql`${t.statut} <> 'annule' OR ${t.motifAnnulation} IS NOT NULL`),
  ],
);

export type IntervenantMission = typeof intervenantsMission.$inferSelect;

export type Mission = typeof missions.$inferSelect;
export type EtapeMission = typeof etapesMission.$inferSelect;
export type PreuveMission = typeof preuvesMission.$inferSelect;
export type NatureMission = Mission["nature"];
export type StatutMission = Mission["statut"];
export type TypePreuve = PreuveMission["type"];
