import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";
import { urlSignee } from "@/lib/stockage";

import {
  documents,
  type StatutSignature,
  type TypeEntiteDocument,
  type VisibiliteDocument,
} from "./schema";

// ------------------------------------------------------------------ documents

export interface LigneDocument {
  id: string;
  nom: string;
  categorie: string | null;
  entiteType: TypeEntiteDocument | null;
  entiteId: string | null;
  entiteLibelle: string | null;
  visibilite: VisibiliteDocument;
  /** Vrai quand une pièce est réellement jointe, et donc ouvrable. */
  avecFichier: boolean;
  nomFichier: string | null;
  tailleOctets: number | null;
  expireLe: string | null;
  /** Jours avant expiration. Nul quand le document n'expire pas. */
  joursAvantExpiration: number | null;
  deposeLe: Date;
  auteur: string | null;
}

/**
 * Jours civils avant une date nue.
 *
 * En UTC, sur des dates sans heure : passer par l'heure locale ferait basculer
 * une échéance d'un jour selon le fuseau du navigateur.
 */
export function joursAvant(dateIso: string, aujourdhui: Date): number | null {
  const terme = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(terme)) return null;

  const jour = Date.UTC(
    aujourdhui.getUTCFullYear(),
    aujourdhui.getUTCMonth(),
    aujourdhui.getUTCDate(),
  );

  return Math.round((terme - jour) / 86_400_000);
}

/**
 * La bibliothèque, du plus récent au plus ancien.
 *
 * Le filtrage se fait ensuite à l'écran, sur le rattachement : un arbre de
 * dossiers obligerait à décider où ranger un contrat qui concerne à la fois un
 * client et un véhicule. Le rattachement répond à la seule question qu'on se
 * pose devant l'écran — quelles pièces ai-je sur ce client, ce véhicule, cet
 * employé.
 */
export async function listerDocuments(
  organizationId: string,
  aujourdhui = new Date(),
  limite = 200,
  filtres?: FiltresListe,
): Promise<LigneDocument[]> {
  // Filtrés en base quand l'adresse porte une recherche : sinon une pièce
  // au-delà des deux cents dernières ne se retrouverait jamais. Mêmes champs
  // que la bibliothèque, et la période porte sur l'expiration.
  const recherche = filtres
    ? and(
        motsDans([sql`d.nom`, sql`d.entite_libelle`, sql`d.categorie`], motsRecherche(filtres.q)),
        dansPeriodeSql(sql`d.expire_le`, filtres.periode),
      )
    : undefined;
  const lignes = await db.execute<{
    id: string;
    nom: string;
    categorie: string | null;
    entite_type: TypeEntiteDocument | null;
    entite_id: string | null;
    entite_libelle: string | null;
    visibilite: VisibiliteDocument;
    chemin: string | null;
    nom_fichier: string | null;
    taille_octets: string | null;
    expire_le: string | null;
    created_at: Date;
    auteur: string | null;
  }>(sql`
    select
      d.id,
      d.nom,
      d.categorie,
      d.entite_type,
      d.entite_id,
      d.entite_libelle,
      d.visibilite,
      d.chemin,
      d.nom_fichier,
      d.taille_octets,
      d.expire_le,
      d.created_at,
      u.full_name as auteur
    from documents d
      left join users u on u.id = d.depose_par_user_id
    where d.organization_id = ${organizationId}
      and d.deleted_at is null
      and ${recherche ?? sql`true`}
    order by d.created_at desc
    limit ${limite}
  `);

  return lignes.map((ligne) => ({
    id: ligne.id,
    nom: ligne.nom,
    categorie: ligne.categorie,
    entiteType: ligne.entite_type,
    entiteId: ligne.entite_id,
    entiteLibelle: ligne.entite_libelle,
    visibilite: ligne.visibilite,
    avecFichier: ligne.chemin !== null,
    nomFichier: ligne.nom_fichier,
    tailleOctets: ligne.taille_octets === null ? null : Number(ligne.taille_octets),
    expireLe: ligne.expire_le,
    joursAvantExpiration: ligne.expire_le
      ? joursAvant(ligne.expire_le, aujourdhui)
      : null,
    deposeLe: new Date(ligne.created_at),
    auteur: ligne.auteur,
  }));
}

/**
 * URL de lecture d'un document, valable cinq minutes.
 *
 * Signée À LA DEMANDE et jamais stockée : une URL de bucket privé qui traîne
 * dans une page en cache resterait valable pour qui la retrouve. Le document
 * est relu ici pour vérifier qu'il appartient bien à l'entreprise — sans quoi
 * un identifiant deviné donnerait accès au contrat d'une autre.
 */
export async function urlDocument(
  organizationId: string,
  documentId: string,
): Promise<string | null> {
  const [document] = await db
    .select({ chemin: documents.chemin })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.organizationId, organizationId),
        isNull(documents.deletedAt),
      ),
    );

  if (!document?.chemin) return null;
  return urlSignee(document.chemin);
}

/** L'entreprise a-t-elle au moins un document ? Sert aux écrans vides. */
export async function aUnDocument(organizationId: string): Promise<boolean> {
  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.organizationId, organizationId))
    .orderBy(desc(documents.createdAt))
    .limit(1);

  return Boolean(document);
}

// ----------------------------------------------------------------- signatures

export interface LigneSignataire {
  id: string;
  nom: string;
  interne: boolean;
  signeLe: Date | null;
}

export interface LigneDemandeSignature {
  id: string;
  reference: string;
  documentId: string;
  documentNom: string;
  statut: StatutSignature;
  codeSecurite: boolean;
  expireLe: Date;
  signeeLe: Date | null;
  creeeLe: Date;
  signataires: LigneSignataire[];
  /** Ce qu'il reste à obtenir. Tant qu'il en reste un, rien n'est engagé. */
  manquants: number;
}

/**
 * Les demandes de signature, avec leurs signataires.
 *
 * Deux requêtes plutôt qu'une jointure aplatie : recomposer les signataires
 * depuis un produit cartésien coûte plus cher en code qu'un second aller-retour,
 * et le nombre de demandes ouvertes reste petit par construction.
 *
 * Le statut affiché est celui stocké, mais `manquants` est recalculé depuis les
 * lignes : c'est lui qui décide de l'affichage « X signatures manquantes », et
 * il ne peut pas mentir.
 */
export async function listerDemandesSignature(
  organizationId: string,
  limite = 40,
  filtres?: FiltresListe,
): Promise<LigneDemandeSignature[]> {
  // Filtrés en base : la liste s'arrête aux quarante dernières demandes. Un
  // signataire se cherche par son nom ; la période porte sur la date de demande.
  const recherche = filtres
    ? and(
        motsDans(
          [
            sql`s.reference`,
            sql`d.nom`,
            sql`(select string_agg(g.nom, ' ') from signataires g
                  where g.demande_id = s.id and g.organization_id = s.organization_id and g.deleted_at is null)`,
          ],
          motsRecherche(filtres.q),
        ),
        dansPeriodeSql(sql`s.created_at`, filtres.periode),
      )
    : undefined;
  const demandes = await db.execute<{
    id: string;
    reference: string;
    document_id: string;
    document_nom: string;
    statut: StatutSignature;
    code_securite: boolean;
    expire_le: Date;
    signee_le: Date | null;
    created_at: Date;
  }>(sql`
    select
      s.id,
      s.reference,
      s.document_id,
      d.nom as document_nom,
      s.statut,
      s.code_securite,
      s.expire_le,
      s.signee_le,
      s.created_at
    from demandes_signature s
      join documents d on d.id = s.document_id
    where s.organization_id = ${organizationId}
      and s.deleted_at is null
      and ${recherche ?? sql`true`}
    order by s.created_at desc
    limit ${limite}
  `);

  if (demandes.length === 0) return [];

  const lignes = await db.execute<{
    id: string;
    demande_id: string;
    nom: string;
    interne: boolean;
    signe_le: Date | null;
  }>(sql`
    select id, demande_id, nom, interne, signe_le
    from signataires
    where organization_id = ${organizationId}
      and deleted_at is null
    order by ordre asc
  `);

  const parDemande = new Map<string, LigneSignataire[]>();
  for (const ligne of lignes) {
    const liste = parDemande.get(ligne.demande_id) ?? [];
    liste.push({
      id: ligne.id,
      nom: ligne.nom,
      interne: ligne.interne,
      signeLe: ligne.signe_le === null ? null : new Date(ligne.signe_le),
    });
    parDemande.set(ligne.demande_id, liste);
  }

  return demandes.map((demande) => {
    const equipe = parDemande.get(demande.id) ?? [];

    return {
      id: demande.id,
      reference: demande.reference,
      documentId: demande.document_id,
      documentNom: demande.document_nom,
      statut: demande.statut,
      codeSecurite: demande.code_securite,
      expireLe: new Date(demande.expire_le),
      signeeLe: demande.signee_le === null ? null : new Date(demande.signee_le),
      creeeLe: new Date(demande.created_at),
      signataires: equipe,
      manquants: equipe.filter((s) => s.signeLe === null).length,
    };
  });
}
