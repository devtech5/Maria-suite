import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  money,
  primaryId,
  quantity,
  rowVersion,
  timestamps,
} from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { NATURES_PIECE } from "./pieces";
import { moyenReglement } from "@/modules/ventes/schema";

/**
 * Service de l'entreprise : Direction générale, Ressources humaines, Travaux
 * et chantiers.
 *
 * Le référentiel de l'organigramme : chaque poste s'y rattache, et le
 * service d'un collaborateur se choisit dans cette liste. La fiche garde le
 * libellé en toutes lettres (`employees.service`) ; un renommage ici s'y
 * propage. Un service ne se supprime pas : il se retire (`actif`).
 *
 * `pole` range le service dans l'organigramme : direction, fonctions
 * support, métiers (`POLES`, services.ts).
 */
export const services = pgTable(
  "services",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Sigle : DG, DAF, BET. */
    code: text("code").notNull(),
    libelle: text("libelle").notNull(),
    pole: text("pole").notNull().default("support"),
    mission: text("mission"),
    ordre: integer("ordre").notNull().default(0),
    actif: boolean("actif").notNull().default(true),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("services_libelle_unique").on(t.organizationId, t.libelle),
    unique("services_code_unique").on(t.organizationId, t.code),
    index("services_org_idx").on(t.organizationId, t.ordre),
    check("services_pole_check", sql`${t.pole} in ('direction', 'support', 'metiers')`),
  ],
);

/**
 * Poste de travail : Comptable, Chef de projet, Gardien.
 *
 * Le référentiel dans lequel se choisit le poste d'un collaborateur. La fiche garde
 * le libellé en toutes lettres (`employees.poste`) ; un renommage ici s'y
 * propage. Un poste ne se supprime pas : il se retire (`actif`), et les
 * fiches qui le portent le gardent.
 */
export const postes = pgTable(
  "postes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    libelle: text("libelle").notNull(),
    ordre: integer("ordre").notNull().default(0),
    actif: boolean("actif").notNull().default(true),
    /** Service auquel le poste appartient. Nul tant qu'on ne l'a pas rangé. */
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("postes_libelle_unique").on(t.organizationId, t.libelle),
    index("postes_org_idx").on(t.organizationId, t.ordre),
  ],
);

/**
 * Nature du contrat de travail.
 *
 * Seul le contrat à durée indéterminée n'a pas de terme : les trois autres en
 * portent un, et la contrainte plus bas l'impose. Un écran qui affiche
 * « contrat expiré » sur un CDI fait douter de tout le reste — le concurrent
 * annonce « OK (>60 j) : 0 » alors que huit CDI sont en cours.
 */
export const typeContrat = pgEnum("type_contrat", ["cdi", "cdd", "stage", "essai"]);

/**
 * Collaborateur déclaré.
 *
 * Ni un `users` — le compte qui ouvre le logiciel — ni un `workers`. La
 * caissière peut être les trois à la fois, mais ce sont trois lignes dans trois
 * tables : son compte se révoque le jour où elle part, son contrat se garde
 * dix ans, et sa fiche de pointage n'existe pas.
 *
 * Ce que cette table NE porte PAS : ni cumul de paie, ni solde de congés, ni
 * ancienneté. Comme pour les encours tiers et les quantités de stock, ces
 * valeurs se déduisent des lignes qui les composent.
 */
export const employees = pgTable(
  "employees",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Matricule interne : S0001. Attribué par `document_sequences`. */
    matricule: text("matricule").notNull(),

    nom: text("nom").notNull(),
    poste: text("poste").notNull(),

    contrat: typeContrat("contrat").notNull().default("cdi"),
    debut: date("debut").notNull(),
    /** Terme du contrat. Nul, et seulement nul, pour un CDI. */
    fin: date("fin"),

    /** Salaire brut mensuel de base, en francs entiers. */
    salaireBase: money("salaire_base").notNull().default(0),

    // État professionnel : ce que le collaborateur est DANS l'entreprise, à côté de
    // ce qu'il est à l'état civil. Facultatif, complété après l'embauche.
    /** Adresse de travail, distincte de l'adresse personnelle (`email`). */
    emailProfessionnel: text("email_professionnel"),
    /** Service ou département : Comptabilité, Logistique, Chantier de Cocody. */
    service: text("service"),
    /**
     * Supérieur hiérarchique direct : un autre collaborateur. Son départ laisse le
     * champ vide plutôt que d'effacer la fiche. Un collaborateur n'est jamais son
     * propre supérieur, ni directement (contrainte) ni par une chaîne (vérifié
     * à l'enregistrement).
     */
    superieurId: uuid("superieur_id").references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
    /** Dernier jour de la période d'essai. Nulle sans essai, jamais avant l'entrée. */
    finPeriodeEssai: date("fin_periode_essai"),

    /**
     * Numéro d'immatriculation CNPS. Facultatif en base parce qu'il arrive
     * après l'embauche, mais son absence est SIGNALÉE à l'écran : sans lui,
     * aucune déclaration sociale n'est possible.
     *
     * Le référentiel vient du pays de l'entreprise. En Côte d'Ivoire la CNPS ;
     * ailleurs autre chose. Jamais l'IPRES sénégalaise sur un écran ivoirien.
     */
    numeroCnps: text("numero_cnps"),

    telephone: text("telephone"),
    email: text("email"),
    adresse: text("adresse"),

    // État civil. Facultatif : il se complète après l'embauche, au fil des
    // pièces rapportées. Le nombre d'enfants à charge pèse sur l'impôt sur
    // salaire (parts), d'où sa place ici et non dans une note.
    /** Civilité imprimée devant le nom : M., Mme, Mlle. Clé de `CIVILITES` (personnes/calcul.ts). */
    civilite: text("civilite"),
    dateNaissance: date("date_naissance"),
    /**
     * L'équipe est prévenue de son anniversaire (jour et mois, jamais l'âge).
     * Décoché, seule la direction le voit : la date de naissance est une
     * donnée personnelle, et chacun choisit de la partager ou non.
     */
    anniversaireAnnonce: boolean("anniversaire_annonce").notNull().default(true),
    lieuNaissance: text("lieu_naissance"),
    nationalite: text("nationalite"),
    sexe: text("sexe"),
    situationFamiliale: text("situation_familiale"),
    enfantsACharge: integer("enfants_a_charge"),
    /** Personne à prévenir en cas d'urgence : son nom. */
    contactUrgence: text("contact_urgence"),
    /** Son lien avec le collaborateur, clé de `LIENS_URGENCE` (personnes/calcul.ts). */
    contactUrgenceLien: text("contact_urgence_lien"),
    /** Le numéro où la joindre. */
    contactUrgenceTelephone: text("contact_urgence_telephone"),

    /**
     * Photo d'identité, réduite dans le navigateur et gardée EN BASE (data
     * URL, 96 Ko au plus) — même exception que le logo de l'entreprise : le
     * badge et la carte professionnelle doivent s'imprimer sans réseau.
     */
    photo: text("photo"),

    /**
     * Compte de connexion du collaborateur, quand il en a un. La plupart n'en ont
     * pas : un magasinier n'ouvre pas le logiciel. Sans référence à `users`
     * pour que la révocation d'un accès n'efface pas un contrat.
     */
    userId: uuid("user_id"),

    /**
     * Un collaborateur parti ne se supprime pas : il se désactive. Ses bulletins et
     * ses déclarations doivent rester lisibles bien après son départ.
     */
    actif: boolean("actif").notNull().default(true),

    /**
     * Comment le salaire est versé : virement, mobile money, espèces, chèque.
     * Clé de `PAIEMENTS_SALAIRE` (personnes/calcul.ts).
     */
    paiementSalaire: text("paiement_salaire"),
    /** RIB, IBAN ou numéro Mobile Money où le verser. */
    coordonneesPaiement: text("coordonnees_paiement"),

    notes: text("notes"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("employees_matricule_unique").on(t.organizationId, t.matricule),
    check("employees_salaire_positif", sql`${t.salaireBase} >= 0`),
    check("employees_photo", sql`${t.photo} IS NULL OR (length(${t.photo}) <= 131072 AND ${t.photo} LIKE 'data:image/%')`),
    check("employees_sexe", sql`${t.sexe} IS NULL OR ${t.sexe} IN ('F', 'M')`),
    check("employees_civilite", sql`${t.civilite} IS NULL OR ${t.civilite} IN ('M', 'Mme', 'Mlle')`),
    check(
      "employees_paiement_salaire",
      sql`${t.paiementSalaire} IS NULL OR ${t.paiementSalaire} IN ('virement', 'mobile_money', 'especes', 'cheque')`,
    ),
    check("employees_enfants", sql`${t.enfantsACharge} IS NULL OR ${t.enfantsACharge} BETWEEN 0 AND 30`),
    check("employees_superieur_autre", sql`${t.superieurId} IS NULL OR ${t.superieurId} <> ${t.id}`),
    check("employees_essai_apres_entree", sql`${t.finPeriodeEssai} IS NULL OR ${t.finPeriodeEssai} >= ${t.debut}`),
    /**
     * Un contrat à durée déterminée sans terme n'est pas déterminé, et un CDI
     * qui en porte un n'est pas indéterminé. L'un comme l'autre passeraient
     * sans bruit et fausseraient le décompte des échéances.
     */
    check(
      "employees_terme_selon_contrat",
      sql`(${t.contrat} = 'cdi' AND ${t.fin} IS NULL)
          OR (${t.contrat} <> 'cdi' AND ${t.fin} IS NOT NULL AND ${t.fin} >= ${t.debut})`,
    ),
    index("employees_org_actif_idx").on(t.organizationId, t.actif),
    index("employees_org_fin_idx").on(t.organizationId, t.fin),
  ],
);

/**
 * Postes occupés par un collaborateur : un ou plusieurs.
 *
 * Une personne peut tenir plusieurs postes — comptable et assistante de
 * direction, gardien et chauffeur. Un seul est principal : c'est lui
 * qu'imprime le bulletin, recopié en toutes lettres dans `employees.poste`.
 * Les lignes pointent le référentiel : un poste renommé s'y lit renommé.
 *
 * Retirer un poste à quelqu'un le supprime logiquement (`deleted_at`) ; le
 * lui rendre ranime la même ligne.
 */
export const affectationsPostes = pgTable(
  "affectations_postes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    posteId: uuid("poste_id")
      .notNull()
      .references(() => postes.id, { onDelete: "restrict" }),
    principal: boolean("principal").notNull().default(false),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("affectations_postes_unique").on(t.employeeId, t.posteId),
    uniqueIndex("affectations_postes_un_principal")
      .on(t.employeeId)
      .where(sql`${t.principal} AND ${t.deletedAt} IS NULL`),
    index("affectations_postes_org_poste_idx").on(t.organizationId, t.posteId),
  ],
);

/**
 * Base de rémunération d'un intervenant.
 *
 * `unite` couvre l'unité d'œuvre — le mètre carré d'enduit, le mètre linéaire
 * de coffrage, le sac porté. C'est le mode que les ERP concurrents ne savent
 * pas représenter, et c'est celui qui paie la moitié d'un chantier ivoirien.
 */
export const modeRemuneration = pgEnum("mode_remuneration", [
  "journee",
  "tache",
  "unite",
  "forfait",
]);

/**
 * Intervenant : ni utilisateur du logiciel, ni collaborateur déclaré.
 *
 * Maçon, ferrailleur, coffreur, manœuvre, peintre, mais aussi chauffeur
 * occasionnel, serveur extra au maquis, coiffeuse à la commission, ouvrier
 * saisonnier, mécanicien à la tâche. Il n'a ni contrat, ni numéro CNPS, ni
 * bulletin de paie — il a un pointage, un taux et un bon de paiement.
 *
 * Le confondre avec un collaborateur produirait des déclarations sociales sur des
 * gens qui n'y figurent pas, et une masse salariale fausse. Le confondre avec
 * un fournisseur perdrait le pointage, qui est la seule preuve du travail fait.
 */
export const workers = pgTable(
  "workers",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Référence interne : I0001. Attribuée par `document_sequences`. */
    code: text("code").notNull(),

    nom: text("nom").notNull(),
    /** Métier annoncé : Maçon, Ferrailleur, Chauffeur occasionnel. */
    qualification: text("qualification").notNull(),

    telephone: text("telephone"),
    /**
     * Numéro qui reçoit le paiement mobile, quand il diffère du téléphone.
     * Cas courant : l'intervenant se fait payer sur le compte d'un proche.
     */
    telephonePaiement: text("telephone_paiement"),

    mode: modeRemuneration("mode").notNull().default("journee"),

    /** Taux de référence, dans l'unité du mode, en francs entiers. */
    taux: money("taux").notNull().default(0),
    /** Ce que le taux rémunère : « jour », « m² enduit », « coffrage ». */
    uniteLibelle: text("unite_libelle").notNull().default("jour"),

    /**
     * Chantier ou équipe de rattachement, en texte. Deviendra une référence
     * quand le moteur Missions existera ; le texte tient jusque-là, et il vaut
     * mieux qu'une colonne vide.
     */
    affectation: text("affectation"),

    actif: boolean("actif").notNull().default(true),
    notes: text("notes"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("workers_code_unique").on(t.organizationId, t.code),
    check("workers_taux_positif", sql`${t.taux} >= 0`),
    index("workers_org_actif_idx").on(t.organizationId, t.actif),
  ],
);

/**
 * Pointage : ce qu'un intervenant a fait, et ce que cela engage.
 *
 * Même doctrine que les mouvements de stock. Aucun cumul n'est stocké sur
 * l'intervenant : ce qui lui est dû est la somme de ses pointages moins la
 * somme de ses bons de paiement. Un compteur tenu à côté finirait par diverger
 * — il suffit d'un pointage saisi deux fois sur un chantier où trois chefs
 * d'équipe pointent le même jour.
 *
 * Un pointage est IMMUABLE : une erreur se corrige par un pointage inverse,
 * jamais par une modification. C'est ce qui rend le décompte du soir
 * explicable devant l'intéressé, et ce qui rendra la saisie hors connexion
 * possible sur un chantier sans réseau.
 */
export const pointages = pgTable(
  "pointages",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "restrict" }),

    /**
     * Quantité pointée, SIGNÉE, en millièmes de l'unité du mode : 18 jours se
     * stockent 18000, 62 m² 62000. Le signe permet la correction — un pointage
     * négatif annule celui de la veille sans rien réécrire.
     */
    quantite: quantity("quantite").notNull(),

    /**
     * Taux appliqué, FIGÉ sur la ligne. Le taux d'aujourd'hui ne dit rien de
     * ce qui avait été convenu le mois dernier, et une revalorisation ne doit
     * pas repayer rétroactivement trois semaines de chantier.
     */
    taux: money("taux").notNull(),
    mode: modeRemuneration("mode").notNull(),
    uniteLibelle: text("unite_libelle").notNull(),

    /**
     * Montant engagé par la ligne, en francs entiers : quantité × taux, divisé
     * par mille UNE seule fois. Stocké, et non recalculé à l'affichage : la
     * division porte un arrondi, et il doit être décidé au moment du pointage,
     * pas à chaque lecture.
     */
    montant: money("montant").notNull(),

    /** Chantier, tournée, service — là où le travail a eu lieu. */
    affectation: text("affectation"),

    /** Numéro du bon de pointage. Obligatoire, comme la pièce d'un mouvement. */
    piece: text("piece").notNull(),

    /** Jour du travail, distinct de la saisie : on pointe le soir, ou le lendemain. */
    effectueLe: timestamp("effectue_le", { withTimezone: true })
      .notNull()
      .defaultNow(),

    motif: text("motif"),

    /** Auteur du pointage — le chef d'équipe. Sans référence, comme l'audit. */
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check("pointages_quantite_non_nulle", sql`${t.quantite} <> 0`),
    check("pointages_taux_positif", sql`${t.taux} >= 0`),
    index("pointages_worker_idx").on(t.organizationId, t.workerId),
    index("pointages_journal_idx").on(t.organizationId, t.effectueLe),
  ],
);

/**
 * Bon de paiement : ce qui a été réellement versé à un intervenant.
 *
 * Ce n'est pas un bulletin de paie et cela ne doit pas y ressembler. Aucune
 * cotisation, aucune retenue, aucun net à payer : un montant, un moyen, une
 * date. Sa charge se ventile en 637 — personnel extérieur — et non en 66,
 * sans quoi la masse salariale déclarée gonflerait de gens qui n'ont jamais
 * été déclarés.
 */
export const bonsPaiement = pgTable(
  "bons_paiement",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : BP-00001. Sans trou ni doublon. */
    numero: text("numero").notNull(),

    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "restrict" }),

    montant: money("montant").notNull(),

    /**
     * Moyen employé. Le crédit n'en est pas un ici : ne pas payer un
     * intervenant ne se constate pas, cela se voit au reste dû.
     */
    moyen: moyenReglement("moyen").notNull().default("especes"),
    /** Référence du transfert mobile money, du chèque, du virement. */
    reference: text("reference"),

    /**
     * Numéro de l'écriture produite par le versement, en texte comme
     * `ecritures.piece_numero` : le lien doit rester lisible même si la pièce
     * comptable venait à être reprise.
     */
    ecritureNumero: text("ecriture_numero"),

    payeLe: timestamp("paye_le", { withTimezone: true }).notNull().defaultNow(),

    notes: text("notes"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("bons_paiement_numero_unique").on(t.organizationId, t.numero),
    check("bons_paiement_montant_positif", sql`${t.montant} > 0`),
    check("bons_paiement_moyen_reel", sql`${t.moyen} <> 'credit'`),
    index("bons_paiement_worker_idx").on(t.organizationId, t.workerId),
    index("bons_paiement_journal_idx").on(t.organizationId, t.payeLe),
  ],
);

/**
 * Nature d'une pièce du dossier collaborateur. La liste et ce que chaque nature
 * porte vivent dans `./pieces.ts`, lu aussi par le navigateur.
 */
export const naturePieceEmploye = pgEnum("nature_piece_employe", NATURES_PIECE);

/**
 * Pièce du dossier d'un collaborateur : CNI, passeport, CMU, permis, casier, RIB,
 * CV, lettre de motivation…
 *
 * Données sensibles. Elles ne se lisent qu'avec `personnes.dossier.consulter`,
 * et chaque ouverture de fichier se trace au journal.
 *
 * Le fichier ne va pas en base : il part dans le dépôt (`src/lib/stockage`),
 * seule sa clé est ici. Une pièce peut exister sans fichier — le numéro et la
 * date d'expiration suffisent à surveiller un permis dont le scan manque.
 *
 * Une pièce retirée l'est logiquement (`deleted_at`) et son fichier quitte le
 * dépôt : la CNI d'un autre déposée par erreur ne doit pas rester lisible.
 */
export const piecesEmploye = pgTable(
  "pieces_employe",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    nature: naturePieceEmploye("nature").notNull(),
    numero: text("numero"),
    organisme: text("organisme"),
    precision: text("precision"),
    delivreeLe: date("delivree_le"),
    expireLe: date("expire_le"),

    /** Clé dans le dépôt : `<organisation>/<pièce>.<ext>`. */
    chemin: text("chemin"),
    nomFichier: text("nom_fichier"),
    typeMime: text("type_mime"),
    tailleOctets: integer("taille_octets"),

    notes: text("notes"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    check(
      "pieces_employe_fichier_complet",
      sql`(${t.chemin} IS NULL) = (${t.nomFichier} IS NULL) AND (${t.chemin} IS NULL) = (${t.typeMime} IS NULL)`,
    ),
    check(
      "pieces_employe_dates",
      sql`${t.expireLe} IS NULL OR ${t.delivreeLe} IS NULL OR ${t.expireLe} >= ${t.delivreeLe}`,
    ),
    index("pieces_employe_salarie_idx").on(t.organizationId, t.employeeId),
    index("pieces_employe_expiration_idx").on(t.organizationId, t.expireLe),
  ],
);

export type Employe = typeof employees.$inferSelect;
export type Intervenant = typeof workers.$inferSelect;
export type Pointage = typeof pointages.$inferSelect;
export type BonPaiement = typeof bonsPaiement.$inferSelect;
export type TypeContrat = Employe["contrat"];
export type ModeRemuneration = Intervenant["mode"];
export type PieceEmploye = typeof piecesEmploye.$inferSelect;

/**
 * Journal des annonces d'anniversaire : une ligne par personne, par fête et
 * par nature (rappel à la direction, annonce du jour). L'index unique fait
 * qu'une annonce ne part qu'une fois, même si dix pages s'ouvrent en même
 * temps ce matin-là.
 */
export const anniversairesAnnonces = pgTable(
  "anniversaires_annonces",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** Jour de la fête annoncée. */
    jour: date("jour").notNull(),
    nature: text("nature").notNull(),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("anniversaires_annonces_unique").on(t.employeeId, t.jour, t.nature),
    index("anniversaires_annonces_org_idx").on(t.organizationId, t.jour),
    check("anniversaires_annonces_nature", sql`${t.nature} in ('rappel', 'jour')`),
  ],
);
