import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";

import {
  PIECES,
  TAILLE_MAX_PIECE,
  TYPES_PIECE,
  etatsPieces,
  type NaturePiece,
} from "./pieces";
import { employees, piecesEmploye, type PieceEmploye } from "./schema";

/**
 * Dossier du salarié : état civil, photo, pièces.
 *
 * Les pièces sont des données sensibles (casier judiciaire, RIB, CMU). Toute
 * lecture passe par une fonction de ce fichier, et toute ouverture de fichier
 * se trace : l'entreprise doit pouvoir dire qui a consulté le casier d'un
 * salarié, et quand.
 */

export interface FichierRecu {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

export interface SaisiePiece {
  nature: NaturePiece;
  numero?: string | null;
  organisme?: string | null;
  precision?: string | null;
  delivreeLe?: string | null;
  expireLe?: string | null;
  notes?: string | null;
}

/** Premier fichier non vide d'un champ de formulaire, lu en mémoire. */
export async function fichierDe(donnees: FormData, champ: string): Promise<FichierRecu | null> {
  const brut = donnees.get(champ);
  if (!(brut instanceof File) || brut.size === 0) return null;
  return { nom: brut.name || "document", typeMime: brut.type, contenu: await brut.arrayBuffer() };
}

/** Salarié de l'entreprise, ou erreur : un identifiant venu du client ne prouve rien. */
export async function salarieDe(organizationId: string, employeeId: string) {
  const [salarie] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)));
  return salarie ?? null;
}

/** Pièces en vigueur d'un salarié, retirées exclues. */
export async function piecesDuSalarie(organizationId: string, employeeId: string): Promise<PieceEmploye[]> {
  return db
    .select()
    .from(piecesEmploye)
    .where(
      and(
        eq(piecesEmploye.organizationId, organizationId),
        eq(piecesEmploye.employeeId, employeeId),
        isNull(piecesEmploye.deletedAt),
      ),
    )
    .orderBy(asc(piecesEmploye.nature), asc(piecesEmploye.createdAt));
}

/** Contrôle d'un fichier de pièce : format reconnu, taille tenable. */
export function refusFichier(fichier: FichierRecu): string | null {
  if (!(fichier.typeMime in TYPES_PIECE)) {
    return `« ${fichier.nom} » : format non accepté. PDF, photo (JPEG, PNG, WebP) ou document Word.`;
  }
  if (fichier.contenu.byteLength > TAILLE_MAX_PIECE) return `« ${fichier.nom} » dépasse 10 Mo.`;
  if (fichier.contenu.byteLength === 0) return `« ${fichier.nom} » est vide.`;
  return null;
}

function propre(valeur: string | null | undefined): string | null {
  const v = valeur?.trim();
  return v ? v : null;
}

/**
 * Ajoute une pièce au dossier.
 *
 * Le fichier part AVANT l'insertion : un dépôt raté laisse la base intacte.
 * Si l'insertion échoue ensuite, le fichier est retiré — pas de scan de CNI
 * orphelin dans le dépôt. Pas de transaction autour du téléversement : un
 * appel réseau ne tient pas une connexion du pooler.
 */
export async function ajouterPiecePour(
  organizationId: string,
  userId: string,
  employeeId: string,
  saisie: SaisiePiece,
  fichier: FichierRecu | null,
): Promise<{ id: string }> {
  const salarie = await salarieDe(organizationId, employeeId);
  if (!salarie) throw new Error("Salarié introuvable.");

  const definition = PIECES[saisie.nature];
  if (definition.fichierRequis && !fichier) throw new Error(`${definition.libelle} : joignez le document.`);
  if (saisie.nature === "autre" && !propre(saisie.precision)) throw new Error("Nommez la pièce.");

  const delivreeLe = definition.delivrance ? propre(saisie.delivreeLe) : null;
  const expireLe = definition.expiration ? propre(saisie.expireLe) : null;
  if (delivreeLe && expireLe && expireLe < delivreeLe) throw new Error("La fin de validité précède la délivrance.");

  const id = newId();
  let chemin: string | null = null;
  if (fichier) {
    const refus = refusFichier(fichier);
    if (refus) throw new Error(refus);
    chemin = cheminDe(organizationId, id, TYPES_PIECE[fichier.typeMime]);
    const depot = await deposer({ chemin, contenu: fichier.contenu, typeMime: fichier.typeMime });
    if (!depot.ok) throw new Error(depot.raison);
  }

  try {
    await db.insert(piecesEmploye).values({
      id,
      organizationId,
      employeeId,
      nature: saisie.nature,
      numero: definition.numero ? propre(saisie.numero) : null,
      organisme: definition.organisme ? propre(saisie.organisme) : null,
      precision: definition.precision ? propre(saisie.precision) : null,
      delivreeLe,
      expireLe,
      chemin,
      nomFichier: fichier ? fichier.nom.slice(0, 200) : null,
      typeMime: fichier ? fichier.typeMime : null,
      tailleOctets: fichier ? fichier.contenu.byteLength : null,
      notes: propre(saisie.notes),
      userId,
    });
  } catch (erreur) {
    if (chemin) await supprimer(chemin);
    throw erreur;
  }

  // Le numéro n'entre pas au journal : il y serait lisible par quiconque
  // consulte le journal, sans le droit sur les dossiers.
  await tracerPour(organizationId, userId, {
    action: "piece_employe.ajouter",
    entite: "employe",
    entiteId: employeeId,
    apres: { nature: definition.libelle, salarie: salarie.nom, fichier: Boolean(fichier) },
  });
  return { id };
}

/**
 * Retire une pièce : la ligne reste (qui l'avait déposée, quand), le fichier
 * quitte le dépôt. Une CNI déposée sur le mauvais salarié ne doit plus être
 * lisible par personne.
 */
export async function retirerPiecePour(organizationId: string, userId: string, pieceId: string): Promise<void> {
  const condition = and(
    eq(piecesEmploye.organizationId, organizationId),
    eq(piecesEmploye.id, pieceId),
    isNull(piecesEmploye.deletedAt),
  );
  const [avant] = await db.select({ chemin: piecesEmploye.chemin }).from(piecesEmploye).where(condition);
  if (!avant) throw new Error("Pièce introuvable.");

  const [piece] = await db
    .update(piecesEmploye)
    .set({ deletedAt: new Date(), chemin: null, nomFichier: null, typeMime: null, updatedAt: new Date() })
    .where(condition)
    .returning({ employeeId: piecesEmploye.employeeId, nature: piecesEmploye.nature });
  if (!piece) throw new Error("Pièce introuvable.");

  // Après la mise à jour : un échec ici laisse au pire un fichier que plus
  // aucune ligne ne désigne, jamais une ligne qui désigne un fichier absent.
  if (avant.chemin && !(await supprimer(avant.chemin))) {
    console.error("Dossier salarié : fichier de pièce retirée resté dans le dépôt", avant.chemin);
  }

  await tracerPour(organizationId, userId, {
    action: "piece_employe.retirer",
    entite: "employe",
    entiteId: piece.employeeId,
    apres: { nature: PIECES[piece.nature].libelle },
  });
}

/**
 * Autorise l'ouverture du fichier d'une pièce et la journalise. Rend la clé
 * du fichier ; l'URL signée se demande au clic, jamais dans le HTML.
 */
export async function ouvrirPiecePour(organizationId: string, userId: string, pieceId: string): Promise<string | null> {
  const [piece] = await db
    .select({
      chemin: piecesEmploye.chemin,
      nature: piecesEmploye.nature,
      employeeId: piecesEmploye.employeeId,
      nom: employees.nom,
    })
    .from(piecesEmploye)
    .innerJoin(employees, eq(employees.id, piecesEmploye.employeeId))
    .where(
      and(
        eq(piecesEmploye.organizationId, organizationId),
        eq(piecesEmploye.id, pieceId),
        isNull(piecesEmploye.deletedAt),
      ),
    );
  if (!piece?.chemin) return null;

  await tracerPour(organizationId, userId, {
    action: "piece_employe.ouvrir",
    entite: "employe",
    entiteId: piece.employeeId,
    apres: { nature: PIECES[piece.nature].libelle, salarie: piece.nom },
  });
  return piece.chemin;
}

export interface EtatCivil {
  dateNaissance: string | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  sexe: "F" | "M" | null;
  situationFamiliale: string | null;
  enfantsACharge: number | null;
  contactUrgence: string | null;
  contactUrgenceLien: string | null;
  contactUrgenceTelephone: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  numeroCnps: string | null;
}

export async function modifierEtatCivilPour(
  organizationId: string,
  userId: string,
  employeeId: string,
  etat: EtatCivil,
): Promise<void> {
  const [modifie] = await db
    .update(employees)
    .set({ ...etat, updatedAt: new Date() })
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)))
    .returning({ nom: employees.nom });
  if (!modifie) throw new Error("Salarié introuvable.");
  await tracerPour(organizationId, userId, {
    action: "salarie.etat_civil",
    entite: "employe",
    entiteId: employeeId,
    apres: { salarie: modifie.nom },
  });
}

export async function changerPhotoPour(
  organizationId: string,
  userId: string,
  employeeId: string,
  photo: string | null,
): Promise<void> {
  const [modifie] = await db
    .update(employees)
    .set({ photo, updatedAt: new Date() })
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)))
    .returning({ nom: employees.nom });
  if (!modifie) throw new Error("Salarié introuvable.");
  await tracerPour(organizationId, userId, {
    action: photo ? "salarie.photo" : "salarie.photo_retirer",
    entite: "employe",
    entiteId: employeeId,
    apres: { salarie: modifie.nom },
  });
}

export interface EtatDossiers {
  expirees: number;
  bientot: number;
  /** Salariés concernés, pour l'alerte. */
  salaries: number;
}

/**
 * Pièces expirées ou sur le point de l'être, chez les salariés en poste.
 * Une pièce remplacée par une plus récente ne compte plus.
 */
export async function etatDossiers(organizationId: string, aujourdhui: string): Promise<EtatDossiers> {
  const lignes = await db
    .select({
      id: piecesEmploye.id,
      employeeId: piecesEmploye.employeeId,
      nature: piecesEmploye.nature,
      delivreeLe: piecesEmploye.delivreeLe,
      expireLe: piecesEmploye.expireLe,
      creeLe: piecesEmploye.createdAt,
    })
    .from(piecesEmploye)
    .innerJoin(employees, eq(employees.id, piecesEmploye.employeeId))
    .where(
      and(
        eq(piecesEmploye.organizationId, organizationId),
        isNull(piecesEmploye.deletedAt),
        eq(employees.actif, true),
      ),
    );

  const parSalarie = new Map<string, typeof lignes>();
  for (const l of lignes) parSalarie.set(l.employeeId, [...(parSalarie.get(l.employeeId) ?? []), l]);

  const resultat: EtatDossiers = { expirees: 0, bientot: 0, salaries: 0 };
  for (const pieces of parSalarie.values()) {
    const etats = etatsPieces(pieces, aujourdhui);
    let touche = false;
    for (const { etat } of etats.values()) {
      if (etat === "expiree") {
        resultat.expirees++;
        touche = true;
      } else if (etat === "expire_bientot") {
        resultat.bientot++;
        touche = true;
      }
    }
    if (touche) resultat.salaries++;
  }
  return resultat;
}

/** Natures présentes par salarié, pour la colonne « Dossier » de la liste. */
export async function naturesParSalarie(organizationId: string): Promise<Map<string, Set<NaturePiece>>> {
  const lignes = await db
    .select({ employeeId: piecesEmploye.employeeId, nature: piecesEmploye.nature })
    .from(piecesEmploye)
    .where(and(eq(piecesEmploye.organizationId, organizationId), isNull(piecesEmploye.deletedAt)));
  const carte = new Map<string, Set<NaturePiece>>();
  for (const l of lignes) {
    const ensemble = carte.get(l.employeeId) ?? new Set<NaturePiece>();
    ensemble.add(l.nature);
    carte.set(l.employeeId, ensemble);
  }
  return carte;
}
