import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { money, primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees, workers } from "@/modules/personnes/schema";
import { depenses } from "@/modules/projets/schema";
import { tiers } from "@/modules/tiers/schema";

/**
 * Trésorerie interne.
 *
 * Où est l'argent de l'entreprise, comment il circule d'une poche à l'autre,
 * et qui en sort de la petite caisse. Aucune de ces tables ne porte de solde :
 * le solde d'un compte est la somme de ses écritures. Elles portent ce que la
 * comptabilité ne dit pas — qui a demandé, qui a approuvé, ce qui est en route,
 * ce que la banque a réellement passé.
 */

export const natureCompteTresorerie = pgEnum("nature_compte_tresorerie", ["caisse", "banque", "mobile_money"]);

/**
 * Compte de trésorerie : une caisse, une banque, un portefeuille mobile money.
 * Chacun est adossé à UN compte SYSCOHADA de classe 5, qui ne sert qu'à lui.
 */
export const comptesTresorerie = pgTable(
  "comptes_tresorerie",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    nature: natureCompteTresorerie("nature").notNull(),
    /** Compte SYSCOHADA : 5211, 572, 5521… */
    compte: text("compte").notNull(),
    /** Banque ou opérateur : SGBCI, Ecobank, Wave, Orange Money. */
    etablissement: text("etablissement"),
    /** RIB, IBAN ou numéro de téléphone du portefeuille. */
    reference: text("reference"),
    responsableUserId: uuid("responsable_user_id"),
    /** Sous ce solde, le compte doit être réalimenté. */
    seuilAlerte: money("seuil_alerte").notNull().default(0),
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("comptes_tresorerie_compte_unique").on(t.organizationId, t.compte),
    unique("comptes_tresorerie_nom_unique").on(t.organizationId, t.nom),
    check("comptes_tresorerie_classe5", sql`${t.compte} ~ '^5[2357][0-9]{0,4}$'`),
    check("comptes_tresorerie_seuil", sql`${t.seuilAlerte} >= 0`),
  ],
);

export const statutVirement = pgEnum("statut_virement", ["en_transit", "recu", "annule"]);

/**
 * Virement interne : alimentation de caisse, versement en banque, transfert
 * entre caisses, recharge mobile money.
 *
 * Deux temps, deux écritures : l'envoi passe l'argent au 585, la réception
 * l'en sort. Entre les deux, le 585 dit ce qui est en route — un versement
 * déposé vendredi que la banque ne créditera que lundi.
 */
export const virementsInternes = pgTable(
  "virements_internes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    montant: money("montant").notNull(),
    /** Frais d'envoi, à la charge de l'entreprise. */
    frais: money("frais").notNull().default(0),
    dateEnvoi: date("date_envoi").notNull(),
    /** Bordereau, référence de transaction, numéro de chèque. */
    reference: text("reference"),
    motif: text("motif"),
    statut: statutVirement("statut").notNull().default("en_transit"),
    ecritureEnvoi: text("ecriture_envoi"),
    envoyeParUserId: uuid("envoye_par_user_id").notNull(),
    dateReception: date("date_reception"),
    ecritureReception: text("ecriture_reception"),
    recuParUserId: uuid("recu_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("virements_internes_numero_unique").on(t.organizationId, t.numero),
    check("virements_internes_montant", sql`${t.montant} > 0 AND ${t.frais} >= 0`),
    check("virements_internes_distincts", sql`${t.sourceId} <> ${t.destinationId}`),
    check("virements_internes_recu_date", sql`${t.statut} <> 'recu' OR ${t.dateReception} IS NOT NULL`),
    index("virements_internes_statut_idx").on(t.organizationId, t.statut),
  ],
);

export const natureBonCaisse = pgEnum("nature_bon_caisse", [
  "fournitures",
  "carburant",
  "transport",
  "mission",
  "entretien",
  "telecom",
  "reception",
  "divers",
]);

export const statutBonCaisse = pgEnum("statut_bon_caisse", ["demande", "approuve", "rejete", "decaisse", "annule"]);

/**
 * Bon de caisse : une dépense payée en espèces par la petite caisse.
 * Demandé, approuvé par un autre, décaissé avec son justificatif.
 */
export const bonsCaisse = pgTable(
  "bons_caisse",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    caisseId: uuid("caisse_id")
      .notNull()
      .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    nature: natureBonCaisse("nature").notNull(),
    montant: money("montant").notNull(),
    /**
     * Qui reçoit l'argent, quand il a une fiche : un fournisseur, un salarié du
     * Personnel, un intervenant. Une seule des trois, ou aucune pour le taxi
     * de passage.
     */
    beneficiaireTiersId: uuid("beneficiaire_tiers_id").references(() => tiers.id, { onDelete: "set null" }),
    beneficiaireEmployeId: uuid("beneficiaire_employe_id").references(() => employees.id, { onDelete: "set null" }),
    beneficiaireWorkerId: uuid("beneficiaire_worker_id").references(() => workers.id, { onDelete: "set null" }),
    /**
     * Nom du bénéficiaire au jour de la demande : recopié de la fiche, ou saisi
     * pour qui n'en a pas. C'est lui que porte l'écriture.
     */
    beneficiaire: text("beneficiaire").notNull(),
    motif: text("motif").notNull(),
    statut: statutBonCaisse("statut").notNull().default("demande"),
    demandeParUserId: uuid("demande_par_user_id").notNull(),
    approuveParUserId: uuid("approuve_par_user_id"),
    approuveLe: timestamp("approuve_le", { withTimezone: true }),
    motifRejet: text("motif_rejet"),
    decaisseParUserId: uuid("decaisse_par_user_id"),
    decaisseLe: timestamp("decaisse_le", { withTimezone: true }),
    ecriture: text("ecriture"),
    justificatifChemin: text("justificatif_chemin"),
    justificatifNom: text("justificatif_nom"),
    justificatifType: text("justificatif_type"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("bons_caisse_numero_unique").on(t.organizationId, t.numero),
    check("bons_caisse_montant", sql`${t.montant} > 0`),
    check("bons_caisse_rejet_motive", sql`${t.statut} <> 'rejete' OR ${t.motifRejet} IS NOT NULL`),
    check("bons_caisse_decaisse_ecrit", sql`${t.statut} <> 'decaisse' OR ${t.ecriture} IS NOT NULL`),
    check(
      "bons_caisse_une_fiche",
      sql`num_nonnulls(${t.beneficiaireTiersId}, ${t.beneficiaireEmployeId}, ${t.beneficiaireWorkerId}) <= 1`,
    ),
    index("bons_caisse_statut_idx").on(t.organizationId, t.statut),
  ],
);

export const statutAvance = pgEnum("statut_avance", ["ouverte", "soldee"]);

/**
 * Avance au personnel : de l'argent remis pour une mission, un achat à faire.
 * Elle reste ouverte tant que la personne ne l'a pas justifiée (dépenses) ou
 * rendue (reliquat). Le reste dû se déduit des régularisations.
 */
export const avancesTresorerie = pgTable(
  "avances_tresorerie",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    caisseId: uuid("caisse_id")
      .notNull()
      .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    /** Salarié du Personnel qui reçoit l'avance. */
    beneficiaireEmployeId: uuid("beneficiaire_employe_id").references(() => employees.id, { onDelete: "set null" }),
    /** Compte du bénéficiaire : celui du salarié, ou un membre sans fiche au Personnel. */
    beneficiaireUserId: uuid("beneficiaire_user_id"),
    /** Nom au jour de la remise : recopié de la fiche, ou saisi à défaut. */
    beneficiaire: text("beneficiaire").notNull(),
    montant: money("montant").notNull(),
    motif: text("motif").notNull(),
    /** Date à laquelle la personne doit avoir justifié ou rendu. */
    echeance: date("echeance"),
    statut: statutAvance("statut").notNull().default("ouverte"),
    ecriture: text("ecriture").notNull(),
    remiseParUserId: uuid("remise_par_user_id").notNull(),
    soldeeLe: timestamp("soldee_le", { withTimezone: true }),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("avances_tresorerie_numero_unique").on(t.organizationId, t.numero),
    check("avances_tresorerie_montant", sql`${t.montant} > 0`),
    index("avances_tresorerie_statut_idx").on(t.organizationId, t.statut),
  ],
);

export const typeRegularisation = pgEnum("type_regularisation", ["justification", "remboursement"]);

/** Justification (une dépense) ou remboursement (du reliquat) d'une avance. */
export const regularisationsAvance = pgTable(
  "regularisations_avance",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    avanceId: uuid("avance_id")
      .notNull()
      .references(() => avancesTresorerie.id, { onDelete: "restrict" }),
    type: typeRegularisation("type").notNull(),
    montant: money("montant").notNull(),
    /** Nature de la dépense justifiée. */
    nature: natureBonCaisse("nature"),
    /** Compte qui reçoit le remboursement. */
    caisseId: uuid("caisse_id").references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    libelle: text("libelle"),
    ecriture: text("ecriture").notNull(),
    userId: uuid("user_id").notNull(),
    ...timestamps,
  },
  (t) => [
    check("regularisations_avance_montant", sql`${t.montant} > 0`),
    check(
      "regularisations_avance_complete",
      sql`(${t.type} = 'justification' AND ${t.nature} IS NOT NULL) OR (${t.type} = 'remboursement' AND ${t.caisseId} IS NOT NULL)`,
    ),
    index("regularisations_avance_idx").on(t.avanceId),
  ],
);

/**
 * Arrêté de caisse : on compte, on compare au solde des écritures, l'écart
 * passe en charge ou en produit. Une caisse jamais arrêtée cache ses trous.
 */
export const arretesCaisse = pgTable(
  "arretes_caisse",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    compteId: uuid("compte_id")
      .notNull()
      .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    dateArrete: date("date_arrete").notNull(),
    theorique: money("theorique").notNull(),
    compte: money("compte_constate").notNull(),
    /** Compté moins théorique : négatif, il manque de l'argent. */
    ecart: money("ecart").notNull(),
    ecriture: text("ecriture"),
    observations: text("observations"),
    userId: uuid("user_id").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("arretes_caisse_numero_unique").on(t.organizationId, t.numero),
    check("arretes_caisse_ecart", sql`${t.ecart} = ${t.compte} - ${t.theorique}`),
    index("arretes_caisse_compte_idx").on(t.compteId, t.dateArrete),
  ],
);

/** Import d'un relevé bancaire : un fichier, une banque, des lignes. */
export const importsReleve = pgTable("imports_releve", {
  id: primaryId(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  compteId: uuid("compte_id")
    .notNull()
    .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
  nomFichier: text("nom_fichier").notNull(),
  lignes: bigint("lignes", { mode: "number" }).notNull(),
  userId: uuid("user_id").notNull(),
  ...timestamps,
});

/**
 * Ligne de relevé bancaire, et ce qu'on en a fait : pointée face à une ligne
 * d'écriture, ou comptabilisée (frais, intérêts) quand la banque a passé ce
 * que l'entreprise ignorait.
 */
export const lignesReleve = pgTable(
  "lignes_releve",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    importId: uuid("import_id")
      .notNull()
      .references(() => importsReleve.id, { onDelete: "cascade" }),
    compteId: uuid("compte_id")
      .notNull()
      .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    dateOperation: date("date_operation").notNull(),
    libelle: text("libelle").notNull(),
    /** Signé : positif, l'argent est entré sur le compte. */
    montant: money("montant").notNull(),
    /** Ligne d'écriture pointée en face. */
    ligneEcritureId: uuid("ligne_ecriture_id"),
    pointeeLe: timestamp("pointee_le", { withTimezone: true }),
    pointeeParUserId: uuid("pointee_par_user_id"),
    /** Écriture passée depuis le relevé (frais, intérêts). */
    ecriture: text("ecriture"),
    ...timestamps,
  },
  (t) => [
    // Une ligne d'écriture ne répond qu'à une seule ligne de relevé.
    uniqueIndex("lignes_releve_ecriture_unique")
      .on(t.organizationId, t.ligneEcritureId)
      .where(sql`${t.ligneEcritureId} IS NOT NULL`),
    check("lignes_releve_montant", sql`${t.montant} <> 0`),
    index("lignes_releve_compte_idx").on(t.compteId, t.dateOperation),
  ],
);

// --------------------------------------------------------------- mouvements

export const natureMouvement = pgEnum("nature_mouvement", [
  "client",
  "fournisseur",
  "remboursement_client",
  "apport",
  "emprunt",
  "remboursement_emprunt",
  "frais_bancaires",
  "produit_financier",
  "autre_entree",
  "autre_sortie",
]);

export const statutMouvement = pgEnum("statut_mouvement", ["valide", "annule"]);

/**
 * Mouvement libre sur un compte de trésorerie : ce qui entre ou sort sans
 * facture, sans dépense, sans virement interne. Le versement d'un client par
 * virement, l'ordre de virement à un prestataire, un apport, un prêt.
 *
 * Il passe son écriture à l'enregistrement. Une erreur ne s'efface pas : elle
 * s'annule par contre-passation, et les deux écritures restent visibles.
 */
export const mouvementsTresorerie = pgTable(
  "mouvements_tresorerie",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** MVT-2026-00001. */
    numero: text("numero").notNull(),
    compteId: uuid("compte_id")
      .notNull()
      .references(() => comptesTresorerie.id, { onDelete: "restrict" }),
    nature: natureMouvement("nature").notNull(),
    tiersId: uuid("tiers_id").references(() => tiers.id, { onDelete: "restrict" }),
    /** Nom du tiers au jour du mouvement : une fiche renommée ne réécrit pas l'historique. */
    tiersNom: text("tiers_nom"),
    montant: money("montant").notNull(),
    dateOperation: date("date_operation").notNull(),
    libelle: text("libelle").notNull(),
    /** Référence de la banque ou de l'opérateur : numéro de virement, de chèque, de transaction. */
    reference: text("reference"),
    /** Coordonnées bancaires du bénéficiaire, reportées sur l'ordre de virement. */
    ribBeneficiaire: text("rib_beneficiaire"),
    statut: statutMouvement("statut").notNull().default("valide"),
    ecriture: text("ecriture").notNull(),
    motifAnnulation: text("motif_annulation"),
    userId: uuid("user_id").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("mouvements_tresorerie_numero_unique").on(t.organizationId, t.numero),
    check("mouvements_tresorerie_montant", sql`${t.montant} > 0`),
    check("mouvements_tresorerie_annulation", sql`${t.statut} <> 'annule' OR ${t.motifAnnulation} IS NOT NULL`),
    index("mouvements_tresorerie_compte_idx").on(t.organizationId, t.compteId, t.dateOperation),
  ],
);

// ------------------------------------------------------------------ charges

export const periodiciteCharge = pgEnum("periodicite_charge", ["mensuelle", "trimestrielle", "annuelle"]);

/**
 * Charge récurrente : loyer, facture CIE, abonnement internet, assurance,
 * patente. Ce qui revient à date fixe et qu'on ne doit pas découvrir le jour
 * de la coupure.
 *
 * Elle ne passe aucune écriture. À chaque échéance, elle prépare une dépense
 * ordinaire — demandée, approuvée par un autre, payée avec sa preuve — qui
 * suit le même circuit que les autres. Le modèle sert à ne pas oublier, pas à
 * contourner l'approbation.
 */
export const chargesRecurrentes = pgTable(
  "charges_recurrentes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    libelle: text("libelle").notNull(),
    /** Nature de la dépense préparée : décide du compte de charge. */
    categorie: text("categorie").notNull(),
    /** Montant TTC habituel, en francs entiers. Ajustable sur la dépense préparée. */
    montant: money("montant").notNull(),
    /** Points de base : 1800 = 18 %. */
    tauxTva: integer("taux_tva").notNull().default(0),
    periodicite: periodiciteCharge("periodicite").notNull(),
    /** Première échéance : son jour du mois se répète. */
    premiereEcheance: date("premiere_echeance").notNull(),
    fournisseurId: uuid("fournisseur_id").references(() => tiers.id, { onDelete: "set null" }),
    fournisseurLibelle: text("fournisseur_libelle"),
    actif: boolean("actif").notNull().default(true),
    creeParUserId: uuid("cree_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("charges_recurrentes_montant", sql`${t.montant} > 0 AND ${t.tauxTva} >= 0`),
    index("charges_recurrentes_org_idx").on(t.organizationId, t.actif),
  ],
);

/**
 * Échéance traitée d'une charge récurrente : sa dépense préparée, ou la trace
 * qu'elle a été écartée (payée autrement, mois offert).
 *
 * Une échéance par charge et par mois, garantie en base : deux clics sur
 * « Préparer » ne font pas payer deux fois le loyer.
 */
export const echeancesCharge = pgTable(
  "echeances_charge",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => chargesRecurrentes.id, { onDelete: "cascade" }),
    /** Mois de l'échéance : « 2026-10 ». */
    periode: text("periode").notNull(),
    dateEcheance: date("date_echeance").notNull(),
    depenseId: uuid("depense_id").references(() => depenses.id, { onDelete: "restrict" }),
    /** Écartée sans dépense : payée autrement, ou rien à payer ce mois-là. */
    ignoree: boolean("ignoree").notNull().default(false),
    userId: uuid("user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("echeances_charge_periode_unique").on(t.chargeId, t.periode),
    check("echeances_charge_periode", sql`${t.periode} ~ '^[0-9]{4}-[0-9]{2}$'`),
    check("echeances_charge_issue", sql`${t.ignoree} OR ${t.depenseId} IS NOT NULL`),
    index("echeances_charge_org_idx").on(t.organizationId, t.periode),
  ],
);

/**
 * Enveloppe mensuelle d'une famille de charges : « pas plus de 150 000 F de
 * carburant par mois ». Elle n'interdit rien ; elle dit quand on la dépasse.
 */
export const budgetsCharges = pgTable(
  "budgets_charges",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Famille de charges : voir `FAMILLES_CHARGE`. */
    famille: text("famille").notNull(),
    montantMensuel: money("montant_mensuel").notNull(),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("budgets_charges_famille_unique").on(t.organizationId, t.famille),
    check("budgets_charges_montant", sql`${t.montantMensuel} > 0`),
  ],
);

export type CompteTresorerie = typeof comptesTresorerie.$inferSelect;
export type VirementInterne = typeof virementsInternes.$inferSelect;
export type BonCaisse = typeof bonsCaisse.$inferSelect;
export type AvanceTresorerie = typeof avancesTresorerie.$inferSelect;
export type ChargeRecurrente = typeof chargesRecurrentes.$inferSelect;
export type MouvementTresorerie = typeof mouvementsTresorerie.$inferSelect;
