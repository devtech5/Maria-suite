import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";

import {
  demandesSignature,
  documents,
  signataires,
  type TypeEntiteDocument,
  type VisibiliteDocument,
} from "./schema";

// ------------------------------------------------------------------ documents

export interface NouveauDocument {
  nom: string;
  categorie?: string | null;
  entiteType?: TypeEntiteDocument | null;
  entiteId?: string | null;
  entiteLibelle?: string | null;
  visibilite?: VisibiliteDocument;
  expireLe?: string | null;
  notes?: string | null;
  /** Fichier à joindre. Absent : la fiche existe sans pièce. */
  fichier?: {
    nom: string;
    typeMime: string;
    contenu: ArrayBuffer;
  } | null;
}

/** Extension déduite du nom de fichier, pour que le dépôt garde un type lisible. */
function extensionDe(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point > 0 ? nom.slice(point + 1) : "";
}

/**
 * Enregistre un document, et dépose son fichier s'il y en a un.
 *
 * L'ordre compte, et il n'est pas symétrique. Le fichier part AVANT
 * l'enregistrement : un dépôt qui échoue doit laisser la base intacte, alors
 * qu'une fiche enregistrée sans son fichier laisserait un écran qui promet une
 * pièce impossible à ouvrir. Si l'insertion échoue après le dépôt, le fichier
 * est retiré — un orphelin coûte de l'espace, une ligne cassée coûte la
 * confiance.
 *
 * La transaction n'est PAS ouverte ici : le dépôt de fichier est un appel
 * réseau vers un service extérieur, et le tenir dans une transaction
 * PostgreSQL bloquerait une connexion du pooler le temps d'un téléversement.
 */
export async function creerDocumentPour(
  organizationId: string,
  donnees: NouveauDocument,
  userId?: string,
): Promise<{ id: string; avecFichier: boolean }> {
  if (donnees.entiteType && !donnees.entiteId) {
    throw new Error("Un rattachement sans entité ne vise rien.");
  }

  const id = newId();
  let chemin: string | null = null;

  if (donnees.fichier) {
    const cible = cheminDe(
      organizationId,
      id,
      extensionDe(donnees.fichier.nom),
    );

    const resultat = await deposer({
      chemin: cible,
      contenu: donnees.fichier.contenu,
      typeMime: donnees.fichier.typeMime,
    });

    if (!resultat.ok) throw new Error(resultat.raison);
    chemin = resultat.chemin;
  }

  try {
    await db.insert(documents).values({
      id,
      organizationId,
      nom: donnees.nom.trim(),
      categorie: donnees.categorie ?? null,
      entiteType: donnees.entiteType ?? null,
      entiteId: donnees.entiteId ?? null,
      entiteLibelle: donnees.entiteLibelle ?? null,
      visibilite: donnees.visibilite ?? "equipe",
      chemin,
      nomFichier: donnees.fichier?.nom ?? null,
      typeMime: donnees.fichier?.typeMime ?? null,
      tailleOctets: donnees.fichier?.contenu.byteLength ?? null,
      expireLe: donnees.expireLe ?? null,
      notes: donnees.notes ?? null,
      deposeParUserId: userId ?? null,
    });
  } catch (erreur) {
    // Le fichier est déjà parti : le retirer, sinon il reste sans fiche et
    // personne ne saura jamais à quoi il correspondait.
    if (chemin) await supprimer(chemin);
    throw erreur;
  }

  if (userId) {
    await db.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "document.deposer",
      entityType: "document",
      entityId: id,
      after: {
        nom: donnees.nom,
        entite: donnees.entiteType ?? null,
        avecFichier: chemin !== null,
      },
    });
  }

  return { id, avecFichier: chemin !== null };
}

/**
 * Retire un document : la fiche d'abord, le fichier ensuite.
 *
 * Ordre inverse du dépôt, pour la même raison. Une fiche effacée dont le
 * fichier reste ne casse rien ; un fichier effacé dont la fiche reste laisse un
 * écran qui promet une pièce disparue.
 *
 * La suppression est LOGIQUE en base — une suppression se réplique — mais le
 * fichier, lui, part pour de bon : garder l'original d'une pièce d'identité
 * qu'on a demandé d'effacer serait exactement ce que le module doit empêcher.
 */
export async function supprimerDocumentPour(
  organizationId: string,
  documentId: string,
  userId?: string,
): Promise<boolean> {
  const [retire] = await db
    .update(documents)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      version: sql`${documents.version} + 1`,
    })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.organizationId, organizationId),
      ),
    )
    .returning({ id: documents.id, nom: documents.nom, chemin: documents.chemin });

  if (!retire) return false;

  if (retire.chemin) await supprimer(retire.chemin);

  if (userId) {
    await db.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "document.supprimer",
      entityType: "document",
      entityId: retire.id,
      after: { nom: retire.nom, fichierRetire: retire.chemin !== null },
    });
  }

  return true;
}

// ----------------------------------------------------------------- signatures

export interface NouvelleDemandeSignature {
  documentId: string;
  codeSecurite?: boolean;
  /** Durée de validité, en jours. */
  validiteJours?: number;
  notes?: string | null;
  signataires: {
    nom: string;
    interne?: boolean;
    telephone?: string | null;
    email?: string | null;
  }[];
}

/** Validité par défaut d'une demande : au-delà, elle se relance depuis le début. */
const VALIDITE_JOURS = 7;

/**
 * Ouvre une demande de signature et ses signataires, dans une transaction.
 *
 * Les deux ensemble : une demande sans signataire n'attend personne et
 * resterait indéfiniment « envoyée » sans que quiconque puisse la faire
 * aboutir.
 */
export async function creerDemandeSignatureDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleDemandeSignature,
  userId?: string,
): Promise<{ id: string; reference: string }> {
  if (donnees.signataires.length === 0) {
    throw new Error("Une demande sans signataire n'attend personne.");
  }

  const [document] = await tx
    .select({ id: documents.id, nom: documents.nom })
    .from(documents)
    .where(
      and(
        eq(documents.id, donnees.documentId),
        eq(documents.organizationId, organizationId),
      ),
    );

  if (!document) throw new Error("Document introuvable.");

  const exercice = String(new Date().getFullYear());
  const reference = await prochainNumero(tx, organizationId, {
    cle: "signature",
    prefix: `SIG-${exercice}-`,
    padding: 5,
    periode: exercice,
  });

  const id = newId();
  const expireLe = new Date();
  expireLe.setDate(
    expireLe.getDate() + (donnees.validiteJours ?? VALIDITE_JOURS),
  );

  await tx.insert(demandesSignature).values({
    id,
    organizationId,
    reference,
    documentId: document.id,
    statut: "envoyee",
    codeSecurite: donnees.codeSecurite ?? false,
    expireLe,
    notes: donnees.notes ?? null,
    userId: userId ?? null,
  });

  await tx.insert(signataires).values(
    donnees.signataires.map((signataire, index) => ({
      id: newId(),
      organizationId,
      demandeId: id,
      nom: signataire.nom.trim(),
      interne: signataire.interne ?? false,
      telephone: signataire.telephone ?? null,
      email: signataire.email ?? null,
      ordre: index,
    })),
  );

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "signature.demander",
      entityType: "demande_signature",
      entityId: id,
      after: {
        reference,
        document: document.nom,
        signataires: donnees.signataires.length,
      },
    });
  }

  return { id, reference };
}

/**
 * Enregistre la signature d'un signataire, et solde la demande si c'est le
 * dernier.
 *
 * Le statut se DÉDUIT des signataires, il ne se saisit pas : `partielle` tant
 * qu'il en manque, `signee` quand tous ont signé. Un statut tenu à côté des
 * lignes qui le composent finirait par mentir — une demande affichée « signée »
 * alors qu'un signataire manque produirait un document qui n'engage personne.
 */
export async function signerDans(
  tx: Transaction,
  organizationId: string,
  signataireId: string,
  depuis?: string,
): Promise<{ reference: string; complete: boolean } | null> {
  const maintenant = new Date();

  const [signe] = await tx
    .update(signataires)
    .set({
      signeLe: maintenant,
      signeDepuis: depuis ?? null,
      updatedAt: maintenant,
      version: sql`${signataires.version} + 1`,
    })
    .where(
      and(
        eq(signataires.id, signataireId),
        eq(signataires.organizationId, organizationId),
        // Signer deux fois ne veut rien dire, et écraserait la date d'origine.
        sql`${signataires.signeLe} IS NULL`,
      ),
    )
    .returning({ demandeId: signataires.demandeId });

  if (!signe) return null;

  const [restants] = await tx
    .select({ nombre: sql<string>`count(*)` })
    .from(signataires)
    .where(
      and(
        eq(signataires.demandeId, signe.demandeId),
        sql`${signataires.signeLe} IS NULL`,
      ),
    );

  const complete = Number(restants?.nombre ?? 0) === 0;

  const [demande] = await tx
    .update(demandesSignature)
    .set({
      statut: complete ? "signee" : "partielle",
      signeeLe: complete ? maintenant : null,
      updatedAt: maintenant,
      version: sql`${demandesSignature.version} + 1`,
    })
    .where(eq(demandesSignature.id, signe.demandeId))
    .returning({ reference: demandesSignature.reference });

  return { reference: demande.reference, complete };
}
