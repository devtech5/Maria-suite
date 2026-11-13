import "server-only";

import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import {
  demandesSignature,
  documents,
  signataires,
  type StatutSignature,
  type TypeEntiteDocument,
  type VisibiliteDocument,
} from "@/modules/documents/schema";

/**
 * Amorçage des documents de démonstration.
 *
 * Périmètre volontairement resserré. Le concurrent en fait un pilier : son
 * module embarque un tableur et un traitement de texte reconstruits à la main,
 * des mois d'effort pour concurrencer un logiciel que le client possède déjà.
 *
 * Ici, ce n'est pas un espace de stockage mais une PIÈCE JOINTE disponible
 * partout. Sa seule valeur propre est le rattachement — un contrat lié à son
 * client, un justificatif lié à son écriture, un permis lié à son conducteur.
 *
 * Ces fiches sont versées SANS FICHIER : un jeu de démonstration ne va pas
 * téléverser douze pièces vers le dépôt à chaque installation, et une fiche
 * sans pièce est un cas réel — l'original papier rangé dans un tiroir dont on
 * suit seulement l'échéance.
 */

export interface DocumentDemo {
  nom: string;
  categorie: string;
  entiteType: TypeEntiteDocument;
  /** Nom de l'objet visé, résolu par les repères passés à l'amorçage. */
  entiteNom: string;
  visibilite: VisibiliteDocument;
  /** Échéance de validité, date nue ISO. */
  expireLe?: string;
}

export const DOCUMENTS_DEMO: DocumentDemo[] = [
  { nom: "Attestation CNPS — Amani Tatiana", categorie: "Ressources humaines", entiteType: "employe", entiteNom: "Amani Tatiana", visibilite: "prive" },
  { nom: "Contrat de travail — Aya Danielle", categorie: "Ressources humaines", entiteType: "employe", entiteNom: "Aya Danielle", visibilite: "prive", expireLe: "2026-08-31" },
  { nom: "Pièce d'identité — Ouattara Ibrahim", categorie: "Ressources humaines", entiteType: "intervenant", entiteNom: "Ouattara Ibrahim", visibilite: "prive" },
  { nom: "Carte grise — Toyota Hilux", categorie: "Parc", entiteType: "actif", entiteNom: "VEH-001", visibilite: "equipe" },
  { nom: "Police d'assurance — Yamaha AG100", categorie: "Parc", entiteType: "actif", entiteNom: "VEH-003", visibilite: "equipe", expireLe: "2026-08-31" },
  { nom: "Visite technique — Renault Kangoo", categorie: "Parc", entiteType: "actif", entiteNom: "VEH-002", visibilite: "equipe", expireLe: "2026-09-12" },
  { nom: "Facture d'achat — Bétonnière 350 L", categorie: "Parc", entiteType: "actif", entiteNom: "ENG-001", visibilite: "restreint" },
];

/**
 * Documents qui ne visent que l'entreprise elle-même.
 *
 * Ils n'ont pas de repère à résoudre : le registre de commerce ou l'agrément
 * ne se rattachent à aucun client ni à aucun véhicule.
 */
export const DOCUMENTS_ORGANISATION: DocumentDemo[] = [
  { nom: "Registre de commerce", categorie: "Administratif", entiteType: "organisation", entiteNom: "", visibilite: "restreint" },
  { nom: "Déclaration fiscale d'existence", categorie: "Administratif", entiteType: "organisation", entiteNom: "", visibilite: "restreint" },
];

export interface SignatureDemo {
  /** Nom du document à faire signer, tel qu'il figure plus haut. */
  document: string;
  statut: StatutSignature;
  codeSecurite: boolean;
  /** Validité restante, en jours. Négative pour une demande expirée. */
  expireDansJours: number;
  signataires: { nom: string; interne: boolean; signe: boolean }[];
}

export const SIGNATURES_DEMO: SignatureDemo[] = [
  {
    document: "Contrat de travail — Aya Danielle",
    statut: "partielle",
    codeSecurite: true,
    expireDansJours: 5,
    signataires: [
      { nom: "Koffi Bernard", interne: true, signe: true },
      { nom: "Aya Danielle", interne: true, signe: false },
    ],
  },
  {
    document: "Facture d'achat — Bétonnière 350 L",
    statut: "signee",
    codeSecurite: false,
    expireDansJours: 3,
    signataires: [
      { nom: "Koffi Bernard", interne: true, signe: true },
      { nom: "Quincaillerie Adjamé", interne: false, signe: true },
    ],
  },
  {
    document: "Police d'assurance — Yamaha AG100",
    statut: "expiree",
    codeSecurite: false,
    expireDansJours: -9,
    signataires: [
      { nom: "Koffi Bernard", interne: true, signe: true },
      { nom: "Kouadio Yao", interne: false, signe: false },
    ],
  },
];

export interface ResultatDocuments {
  documents: number;
  signatures: number;
}

/**
 * Verse les documents de démonstration dans une entreprise.
 *
 * `reperes` associe un nom à un identifiant déjà en base — collaborateurs,
 * intervenants, actifs. Un document dont la cible n'existe pas est versé SANS
 * rattachement plutôt que d'être ignoré : la contrainte en base exige que le
 * type et l'identifiant aillent ensemble, et une pièce sans lien reste une
 * pièce.
 *
 * Les insertions sont GROUPÉES : sur le pooler en mode transaction, une
 * insertion par ligne sérialise autant d'allers-retours vers Abidjan.
 */
export async function amorcerDocuments(
  tx: Transaction,
  organizationId: string,
  reperes: Map<string, { id: string; libelle: string }>,
  userId?: string,
): Promise<ResultatDocuments> {
  const lignes: (typeof documents.$inferInsert)[] = [];
  const parNom = new Map<string, string>();

  for (const doc of [...DOCUMENTS_DEMO, ...DOCUMENTS_ORGANISATION]) {
    const id = newId();
    parNom.set(doc.nom, id);

    // L'entreprise se vise elle-même : pas de repère à chercher.
    const cible =
      doc.entiteType === "organisation"
        ? { id: organizationId, libelle: "L'entreprise" }
        : reperes.get(doc.entiteNom);

    lignes.push({
      id,
      organizationId,
      nom: doc.nom,
      categorie: doc.categorie,
      entiteType: cible ? doc.entiteType : null,
      entiteId: cible?.id ?? null,
      entiteLibelle: cible?.libelle ?? null,
      visibilite: doc.visibilite,
      expireLe: doc.expireLe ?? null,
      notes: "Fiche de démonstration, sans pièce jointe.",
      deposeParUserId: userId ?? null,
    });
  }

  if (lignes.length > 0) await tx.insert(documents).values(lignes);

  // ------------------------------------------------------------ signatures
  const exercice = String(new Date().getFullYear());
  const demandes: (typeof demandesSignature.$inferInsert)[] = [];
  const equipes: (typeof signataires.$inferInsert)[] = [];

  for (const demande of SIGNATURES_DEMO) {
    const documentId = parNom.get(demande.document);
    if (!documentId) continue;

    const id = newId();
    const reference = await prochainNumero(tx, organizationId, {
      cle: "signature",
      prefix: `SIG-${exercice}-`,
      padding: 5,
      periode: exercice,
    });

    const expireLe = new Date();
    expireLe.setDate(expireLe.getDate() + demande.expireDansJours);

    demandes.push({
      id,
      organizationId,
      reference,
      documentId,
      statut: demande.statut,
      codeSecurite: demande.codeSecurite,
      expireLe,
      signeeLe: demande.statut === "signee" ? new Date() : null,
      userId: userId ?? null,
    });

    demande.signataires.forEach((signataire, index) => {
      equipes.push({
        id: newId(),
        organizationId,
        demandeId: id,
        nom: signataire.nom,
        interne: signataire.interne,
        ordre: index,
        signeLe: signataire.signe ? new Date() : null,
      });
    });
  }

  if (demandes.length > 0) {
    await tx.insert(demandesSignature).values(demandes);
    await tx.insert(signataires).values(equipes);
  }

  return { documents: lignes.length, signatures: demandes.length };
}
