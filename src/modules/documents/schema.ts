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

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

/**
 * Périmètre volontairement resserré.
 *
 * Le concurrent en fait un pilier : son module embarque un tableur et un
 * traitement de texte reconstruits à la main — des mois d'effort pour
 * concurrencer un logiciel que le client possède déjà.
 *
 * Ici, ce n'est pas un espace de stockage mais une PIÈCE JOINTE disponible
 * partout. Sa seule valeur propre est le rattachement : un contrat lié à son
 * client, un justificatif lié à son écriture, un permis lié à son conducteur.
 * Un fichier qui ne pointe vers rien n'est qu'un fichier.
 */

/**
 * Nature de l'entité à laquelle un document se rattache.
 *
 * Rattachement POLYMORPHE, comme `entity_codes` : un type et un identifiant,
 * sans clé étrangère. Une colonne par entité obligerait à migrer la table à
 * chaque module livré, et une pièce jointe doit pouvoir viser un objet dont le
 * module n'existe pas encore.
 *
 * Le prix est assumé : rien en base n'empêche un identifiant orphelin. C'est
 * la résolution à l'affichage qui le signale, et un rattachement perdu coûte
 * moins cher qu'un schéma qu'on n'ose plus faire évoluer.
 */
export const typeEntiteDocument = pgEnum("type_entite_document", [
  "tiers",
  "employe",
  "intervenant",
  "actif",
  "article",
  "vente",
  "ecriture",
  "contrat",
  "mission",
  "organisation",
]);

/**
 * Qui peut voir le document.
 *
 * `prive` n'est pas décoratif : une pièce d'identité, un contrat de travail ou
 * un avertissement disciplinaire ne se montrent pas à toute l'équipe. Le
 * niveau se décide au dépôt, pas après coup.
 */
export const visibiliteDocument = pgEnum("visibilite_document", [
  "prive",
  "restreint",
  "equipe",
]);

/**
 * Document : le fichier vit dans le dépôt, sa fiche vit ici.
 *
 * `chemin` est la clé dans le dépôt de fichiers, préfixée par l'entreprise.
 * Elle peut être NULLE : une fiche sans fichier reste légitime tant que le
 * dépôt n'est pas configuré, ou quand le document est un original papier dont
 * on suit seulement l'échéance — une police d'assurance rangée dans un tiroir
 * expire tout aussi bien.
 *
 * Le nom d'origine est conservé à part : le chemin porte un identifiant, pas
 * un nom lisible, et « Contrat de bail — Cocody 101.pdf » doit se réafficher
 * tel qu'il a été déposé.
 */
export const documents = pgTable(
  "documents",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    nom: text("nom").notNull(),
    /** Regroupement libre : Contrats, Ressources humaines, Parc, Comptabilité. */
    categorie: text("categorie"),

    /** Rattachement. Les deux vont ensemble ou pas du tout. */
    entiteType: typeEntiteDocument("entite_type"),
    entiteId: uuid("entite_id"),
    /**
     * Libellé de l'entité au moment du dépôt. Recopié, jamais lu par jointure :
     * un rattachement polymorphe ne se joint pas, et l'écran doit rester
     * lisible même si l'objet visé a été renommé ou archivé.
     */
    entiteLibelle: text("entite_libelle"),

    visibilite: visibiliteDocument("visibilite").notNull().default("equipe"),

    /** Clé dans le dépôt de fichiers. Nulle tant qu'aucun fichier n'est joint. */
    chemin: text("chemin"),
    /** Nom du fichier tel que déposé, pour le réafficher et le retélécharger. */
    nomFichier: text("nom_fichier"),
    typeMime: text("type_mime"),
    tailleOctets: bigint("taille_octets", { mode: "number" }),

    /**
     * Échéance propre au document : assurance, agrément, visite, contrat.
     *
     * C'est ce qui distingue une pièce jointe d'un fichier posé sur un bureau.
     * Une attestation qui expire sans que personne ne le sache immobilise un
     * véhicule au premier contrôle.
     */
    expireLe: date("expire_le"),

    notes: text("notes"),
    deposeParUserId: uuid("depose_par_user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    /** Un chemin ne sert qu'un document : deux fiches sur le même fichier feraient
        disparaître l'une en supprimant l'autre. */
    unique("documents_chemin_unique").on(t.organizationId, t.chemin),
    /**
     * Le rattachement est un couple : un type sans identifiant ne vise rien, un
     * identifiant sans type ne se résout pas.
     */
    check(
      "documents_rattachement_complet",
      sql`(${t.entiteType} IS NULL AND ${t.entiteId} IS NULL)
          OR (${t.entiteType} IS NOT NULL AND ${t.entiteId} IS NOT NULL)`,
    ),
    check(
      "documents_taille_positive",
      sql`${t.tailleOctets} IS NULL OR ${t.tailleOctets} > 0`,
    ),
    index("documents_entite_idx").on(t.organizationId, t.entiteType, t.entiteId),
    index("documents_expiration_idx").on(t.organizationId, t.expireLe),
  ],
);

/**
 * État d'une demande de signature.
 *
 * `partielle` existe parce qu'un document à moitié signé n'engage personne, et
 * qu'il faut néanmoins savoir qui a déjà signé pour relancer les autres. Le
 * confondre avec `envoyee` ferait relancer ceux qui ont fait leur part.
 */
export const statutSignature = pgEnum("statut_signature", [
  "brouillon",
  "envoyee",
  "partielle",
  "signee",
  "expiree",
  "annulee",
]);

/**
 * Demande de signature.
 *
 * ⚠️ Ce module SUIT une signature, il ne la CERTIFIE pas. Il n'y a ici ni
 * certificat, ni horodatage qualifié, ni prestataire de confiance : le
 * dispositif enregistre qui a signé, quand, et depuis quelle adresse. C'est
 * une trace d'accord, pas une signature électronique qualifiée au sens
 * réglementaire — et l'écran doit le dire plutôt que de le laisser croire.
 *
 * Une demande n'aboutit que lorsque TOUS les signataires ont signé. Tant qu'il
 * en manque un, le document n'a aucune valeur, même partiellement signé.
 */
export const demandesSignature = pgTable(
  "demandes_signature",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : SIG-2026-00057. */
    reference: text("reference").notNull(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    statut: statutSignature("statut").notNull().default("brouillon"),

    /**
     * Code à six chiffres transmis HORS du canal d'envoi — de vive voix, par un
     * autre numéro. C'est lui qui empêche un tiers ayant accès au message de
     * signer à la place du destinataire. Sans lui, le lien seul suffit.
     */
    codeSecurite: boolean("code_securite").notNull().default(false),

    /** Terme de la demande. Passé, elle se relance depuis le début. */
    expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
    /** Date de complétion : renseignée quand le DERNIER signataire a signé. */
    signeeLe: timestamp("signee_le", { withTimezone: true }),

    notes: text("notes"),
    userId: uuid("user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("demandes_signature_reference_unique").on(t.organizationId, t.reference),
    index("demandes_signature_statut_idx").on(t.organizationId, t.statut),
    index("demandes_signature_document_idx").on(t.documentId),
  ],
);

/**
 * Signataire d'une demande.
 *
 * `interne` distingue le salarié du tiers extérieur : le premier signe depuis
 * son compte, le second depuis un lien reçu. Les traiter pareil obligerait à
 * ouvrir un compte à chaque client qui signe un devis.
 */
export const signataires = pgTable(
  "signataires",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    demandeId: uuid("demande_id")
      .notNull()
      .references(() => demandesSignature.id, { onDelete: "cascade" }),

    nom: text("nom").notNull(),
    interne: boolean("interne").notNull().default(false),
    telephone: text("telephone"),
    email: text("email"),

    /** Rang d'affichage et de relance. */
    ordre: bigint("ordre", { mode: "number" }).notNull().default(0),

    signeLe: timestamp("signe_le", { withTimezone: true }),
    /**
     * Adresse d'où la signature a été apposée. Seule trace technique conservée :
     * elle ne prouve pas une identité, elle situe un geste.
     */
    signeDepuis: text("signe_depuis"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    index("signataires_demande_idx").on(t.demandeId, t.ordre),
  ],
);

export type Document = typeof documents.$inferSelect;
export type DemandeSignature = typeof demandesSignature.$inferSelect;
export type Signataire = typeof signataires.$inferSelect;
export type TypeEntiteDocument = NonNullable<Document["entiteType"]>;
export type VisibiliteDocument = Document["visibilite"];
export type StatutSignature = DemandeSignature["statut"];

/**
 * Courrier officiel, rédigé sur le papier à en-tête de l'entreprise.
 *
 * Le module reste une pièce jointe, pas un traitement de texte : un courrier
 * se compose d'un lieu, d'une date, d'un objet, d'un corps en paragraphes et
 * d'un signataire — rien de plus, et c'est la mise en page commune qui en
 * fait une lettre. Le corps est du TEXTE : une ligne, un paragraphe. Aucune
 * balise n'y est interprétée, si bien qu'un courrier ne peut rien injecter
 * dans la page qui l'imprime.
 *
 * Le numéro (COUR-2026-00012) est attribué à la création, dans la transaction
 * qui l'enregistre : une lettre envoyée se cite par sa référence, et deux
 * secrétaires qui créent un courrier au même instant ne doivent pas recevoir
 * la même.
 */
export const courriers = pgTable(
  "courriers",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Numéro séquentiel : COUR-2026-00012. */
    numero: text("numero").notNull(),

    /** « Abidjan », imprimé devant la date : « Abidjan, le 16 octobre 2026 ». */
    lieu: text("lieu").notNull(),
    /** Date portée par la lettre, sans heure : celle de la signature, pas de la saisie. */
    dateCourrier: date("date_courrier").notNull(),

    /** Bloc d'adresse, une ligne par ligne imprimée. Facultatif : une note de service n'en a pas. */
    destinataire: text("destinataire"),
    objet: text("objet").notNull(),
    /** Texte brut. Chaque ligne non vide devient un paragraphe. */
    corps: text("corps").notNull(),

    signataire: text("signataire").notNull(),
    fonction: text("fonction"),

    redigeParUserId: uuid("redige_par_user_id"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    unique("courriers_numero_unique").on(t.organizationId, t.numero),
    index("courriers_date_idx").on(t.organizationId, t.dateCourrier),
  ],
);

export type Courrier = typeof courriers.$inferSelect;
