import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, memberships } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { tiers } from "@/modules/tiers/schema";

import { categorieConnue, depasseBudget, ecritureDepense, refusApprobation, suiviBudget, transitionDepense } from "./calcul";
import { compteTresorerieDe } from "@/modules/tresorerie/creation";
import {
  depenses,
  piecesProjet,
  projets,
  type MoyenDepense,
  type NaturePieceProjet,
  type StatutProjet,
} from "./schema";

async function journaliser(
  tx: Transaction,
  organizationId: string,
  userId: string | undefined,
  action: string,
  entiteId: string,
  apres: Record<string, unknown>,
) {
  if (!userId) return;
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action,
    entityType: action.split(".")[0],
    entityId: entiteId,
    after: apres,
  });
}

const jourIso = (date: Date) => date.toISOString().slice(0, 10);

/** Le responsable désigné doit être membre actif de l'entreprise. */
async function verifierMembre(tx: Transaction, organizationId: string, userId: string | null | undefined) {
  if (!userId) return;
  const [membre] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId), eq(memberships.status, "actif")));
  if (!membre) throw new Error("Le responsable choisi n'est pas membre de l'entreprise.");
}

async function verifierTiers(tx: Transaction, organizationId: string, tiersId: string | null | undefined) {
  if (!tiersId) return;
  const [ligne] = await tx
    .select({ id: tiers.id })
    .from(tiers)
    .where(and(eq(tiers.id, tiersId), eq(tiers.organizationId, organizationId), isNull(tiers.deletedAt)));
  if (!ligne) throw new Error("Tiers introuvable.");
}

// ------------------------------------------------------------------ projets

export interface NouveauProjet {
  nom: string;
  description?: string | null;
  clientId?: string | null;
  responsableUserId?: string | null;
  budget?: number | null;
  prixVente?: number | null;
  debut?: string | null;
  fin?: string | null;
}

export async function creerProjetDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauProjet,
  userId?: string,
): Promise<{ id: string; code: string }> {
  await verifierMembre(tx, organizationId, donnees.responsableUserId);
  await verifierTiers(tx, organizationId, donnees.clientId);
  if (donnees.debut && donnees.fin && donnees.fin < donnees.debut) throw new Error("La fin précède le début.");

  const annee = (donnees.debut ?? jourIso(new Date())).slice(0, 4);
  const code = await prochainNumero(tx, organizationId, { cle: "projet", prefix: `PRJ-${annee}-`, padding: 3, periode: annee });
  const id = newId();
  await tx.insert(projets).values({
    id,
    organizationId,
    code,
    nom: donnees.nom.trim(),
    description: donnees.description?.trim() || null,
    clientId: donnees.clientId ?? null,
    responsableUserId: donnees.responsableUserId ?? null,
    budget: donnees.budget ?? null,
    prixVente: donnees.prixVente ?? null,
    debut: donnees.debut ?? null,
    fin: donnees.fin ?? null,
    statut: donnees.debut && donnees.debut <= jourIso(new Date()) ? "en_cours" : "preparation",
  });
  await journaliser(tx, organizationId, userId, "projet.creer", id, { code, nom: donnees.nom });
  return { id, code };
}

export interface ModificationProjet {
  responsableUserId?: string | null;
  statut?: StatutProjet;
  budget?: number | null;
  prixVente?: number | null;
  fin?: string | null;
}

/** Affecte un responsable, change le statut, revoit l'enveloppe ou l'échéance. */
export async function modifierProjetDans(
  tx: Transaction,
  organizationId: string,
  projetId: string,
  modification: ModificationProjet,
  userId: string,
): Promise<{ code: string }> {
  if (modification.responsableUserId !== undefined) await verifierMembre(tx, organizationId, modification.responsableUserId);
  // La fin réelle se pose au passage en « terminé » et tombe si on rouvre :
  // c'est elle, et non l'échéance prévue, qui juge le délai.
  const termine =
    modification.statut === undefined
      ? {}
      : { termineLe: modification.statut === "termine" ? new Date().toISOString().slice(0, 10) : null };
  const [modifie] = await tx
    .update(projets)
    .set({ ...modification, ...termine, updatedAt: new Date(), version: sql`${projets.version} + 1` })
    .where(and(isNull(projets.deletedAt), eq(projets.id, projetId), eq(projets.organizationId, organizationId)))
    .returning({ code: projets.code });
  if (!modifie) throw new Error("Projet introuvable.");
  await journaliser(tx, organizationId, userId, "projet.modifier", projetId, { ...modification });
  return modifie;
}

// ----------------------------------------------------------------- dépenses

export interface NouvelleDepense {
  projetId?: string | null;
  objet: string;
  categorie: string;
  fournisseurId?: string | null;
  fournisseurLibelle?: string | null;
  montant: number;
  tauxTva?: number;
}

/** Demande de dépense : elle n'engage rien tant qu'elle n'est pas approuvée. */
export async function demanderDepenseDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleDepense,
  userId?: string,
  le: Date = new Date(),
): Promise<{ id: string; numero: string }> {
  if (!categorieConnue(donnees.categorie)) throw new Error("Nature de dépense inconnue.");
  if (!Number.isInteger(donnees.montant) || donnees.montant <= 0) throw new Error("Montant invalide.");
  await verifierTiers(tx, organizationId, donnees.fournisseurId);
  if (donnees.projetId) {
    const [projet] = await tx
      .select({ statut: projets.statut })
      .from(projets)
      .where(and(eq(projets.id, donnees.projetId), eq(projets.organizationId, organizationId), isNull(projets.deletedAt)));
    if (!projet) throw new Error("Projet introuvable.");
    if (projet.statut === "termine" || projet.statut === "annule") {
      throw new Error("Ce projet est clos : il n'accepte plus de dépense.");
    }
  }

  const annee = jourIso(le).slice(0, 4);
  const numero = await prochainNumero(tx, organizationId, { cle: "depense", prefix: `DPS-${annee}-`, padding: 5, periode: annee });
  const id = newId();
  await tx.insert(depenses).values({
    id,
    organizationId,
    numero,
    projetId: donnees.projetId ?? null,
    objet: donnees.objet.trim(),
    categorie: donnees.categorie,
    fournisseurId: donnees.fournisseurId ?? null,
    fournisseurLibelle: donnees.fournisseurLibelle?.trim() || null,
    montant: donnees.montant,
    tauxTva: donnees.tauxTva ?? 0,
    demandeeLe: le,
    demandeeParUserId: userId ?? null,
  });
  await journaliser(tx, organizationId, userId, "depense.demander", id, { numero, montant: donnees.montant });
  return { id, numero };
}

async function lireDepense(tx: Transaction, organizationId: string, depenseId: string) {
  const [ligne] = await tx
    .select({ depense: depenses, projetNom: projets.nom, budget: projets.budget })
    .from(depenses)
    .leftJoin(projets, eq(projets.id, depenses.projetId))
    .where(and(eq(depenses.id, depenseId), eq(depenses.organizationId, organizationId), isNull(depenses.deletedAt)))
    .for("update", { of: depenses });
  if (!ligne) throw new Error("Dépense introuvable.");
  return ligne;
}

/**
 * Approuve une demande. Refusée à son propre auteur (sauf au propriétaire),
 * et quand elle ferait dépasser l'enveloppe du projet — sauf à le dire
 * explicitement : un dépassement se décide, il ne se découvre pas.
 */
export async function approuverDepenseDans(
  tx: Transaction,
  organizationId: string,
  depenseId: string,
  approbateur: { userId: string; estProprietaire: boolean },
  accepterDepassement = false,
  le: Date = new Date(),
): Promise<{ numero: string }> {
  const { depense, budget } = await lireDepense(tx, organizationId, depenseId);
  if (!transitionDepense(depense.statut, "approuvee")) throw new Error(`${depense.numero} n'est plus à approuver.`);
  const refus = refusApprobation(depense.demandeeParUserId, approbateur.userId, approbateur.estProprietaire);
  if (refus) throw new Error(refus);

  if (depense.projetId && budget !== null && !accepterDepassement) {
    // Verrouille le projet : deux approbations simultanées ne passent pas
    // toutes les deux sous un plafond qui n'en admet qu'une.
    await tx.select({ id: projets.id }).from(projets).where(eq(projets.id, depense.projetId)).for("update");
    const autres = await tx
      .select({ statut: depenses.statut, montant: depenses.montant })
      .from(depenses)
      .where(and(eq(depenses.projetId, depense.projetId), sql`${depenses.id} <> ${depense.id}`, isNull(depenses.deletedAt)));
    const { engage } = suiviBudget(budget, autres);
    if (depasseBudget(budget, engage, depense.montant)) {
      throw new Error(
        `Budget dépassé : ${(engage + depense.montant - budget).toLocaleString("fr-FR")} F au-delà de l'enveloppe. Confirmez le dépassement pour approuver.`,
      );
    }
  }

  await tx
    .update(depenses)
    .set({ statut: "approuvee", approuveeLe: le, approuveeParUserId: approbateur.userId, updatedAt: new Date(), version: sql`${depenses.version} + 1` })
    .where(eq(depenses.id, depense.id));
  await journaliser(tx, organizationId, approbateur.userId, "depense.approuver", depense.id, { numero: depense.numero, depassement: accepterDepassement });
  return { numero: depense.numero };
}

export async function cloreDepenseDans(
  tx: Transaction,
  organizationId: string,
  depenseId: string,
  vers: "rejetee" | "annulee",
  motif: string,
  userId: string,
): Promise<{ numero: string }> {
  const { depense } = await lireDepense(tx, organizationId, depenseId);
  if (!transitionDepense(depense.statut, vers)) {
    throw new Error(depense.statut === "payee" ? "Une dépense payée ne s'annule pas : l'argent est sorti." : `${depense.numero} est déjà close.`);
  }
  await tx
    .update(depenses)
    .set({ statut: vers, motif, updatedAt: new Date(), version: sql`${depenses.version} + 1` })
    .where(eq(depenses.id, depense.id));
  await journaliser(tx, organizationId, userId, `depense.${vers === "rejetee" ? "rejeter" : "annuler"}`, depense.id, { numero: depense.numero, motif });
  return { numero: depense.numero };
}

/** Paiement : l'argent sort, l'écriture passe dans la même transaction. */
export async function payerDepenseDans(
  tx: Transaction,
  organizationId: string,
  depenseId: string,
  paiement: { moyen: MoyenDepense; reference?: string | null; compteTresorerieId?: string | null },
  userId: string,
  le: Date = new Date(),
): Promise<{ numero: string; ecriture: string }> {
  const { depense, projetNom } = await lireDepense(tx, organizationId, depenseId);
  if (!transitionDepense(depense.statut, "payee")) {
    throw new Error(depense.statut === "demandee" ? "Faites d'abord approuver la dépense." : `${depense.numero} n'est pas à payer.`);
  }
  if (!categorieConnue(depense.categorie)) throw new Error("Nature de dépense inconnue.");

  const date = jourIso(le);
  // Le compte choisi en trésorerie remplace le compte par défaut du moyen.
  const compte = paiement.compteTresorerieId ? await compteTresorerieDe(tx, organizationId, paiement.compteTresorerieId) : null;
  if (paiement.compteTresorerieId && !compte) throw new Error("Compte de trésorerie introuvable ou fermé.");
  const ecriture = await enregistrerEcritureDans(
    tx,
    ecritureDepense({
      numero: depense.numero,
      date,
      objet: depense.objet,
      categorie: depense.categorie,
      montant: depense.montant,
      tauxTvaBp: depense.tauxTva,
      moyen: paiement.moyen,
      projet: projetNom,
      tresorerie: compte ? { numero: compte.numero, libelle: compte.libelle, journal: compte.nature === "banque" ? "BQ" : "CA" } : null,
    }),
    { organizationId, userId, origine: "bon_caisse", pieceId: depense.id, exercice: date.slice(0, 4), dateIso: date },
  );

  await tx
    .update(depenses)
    .set({
      statut: "payee",
      payeeLe: le,
      payeeParUserId: userId,
      moyen: paiement.moyen,
      referencePaiement: paiement.reference?.trim() || null,
      ecriture,
      updatedAt: new Date(),
      version: sql`${depenses.version} + 1`,
    })
    .where(eq(depenses.id, depense.id));
  await journaliser(tx, organizationId, userId, "depense.payer", depense.id, { numero: depense.numero, ecriture });
  return { numero: depense.numero, ecriture };
}

// ------------------------------------------------------------------ pièces

export interface FichierJoint {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

/**
 * Joint une photo ou une preuve à un projet ou à une dépense.
 *
 * Le fichier part d'abord au dépôt, la fiche est écrite ensuite. Si la fiche
 * échoue, le fichier est retiré : un fichier orphelin ne se retrouve jamais.
 */
export async function joindrePiece(
  organizationId: string,
  cible: { projetId?: string | null; depenseId?: string | null },
  piece: { nature: NaturePieceProjet; legende?: string | null; fichier: FichierJoint },
  userId: string,
): Promise<{ id: string }> {
  if (!cible.projetId && !cible.depenseId) throw new Error("Rattachez la pièce à un projet ou à une dépense.");

  // Une pièce de dépense est aussi visible sur son projet.
  let projetId = cible.projetId ?? null;
  if (cible.depenseId) {
    const [depense] = await db
      .select({ projetId: depenses.projetId })
      .from(depenses)
      .where(and(eq(depenses.id, cible.depenseId), eq(depenses.organizationId, organizationId), isNull(depenses.deletedAt)));
    if (!depense) throw new Error("Dépense introuvable.");
    projetId ??= depense.projetId;
  } else if (projetId) {
    const [projet] = await db
      .select({ id: projets.id })
      .from(projets)
      .where(and(eq(projets.id, projetId), eq(projets.organizationId, organizationId), isNull(projets.deletedAt)));
    if (!projet) throw new Error("Projet introuvable.");
  }

  const id = newId();
  const extension = piece.fichier.nom.includes(".") ? piece.fichier.nom.split(".").pop()! : "";
  const chemin = cheminDe(organizationId, id, extension);
  const depot = await deposer({ chemin, contenu: piece.fichier.contenu, typeMime: piece.fichier.typeMime });
  if (!depot.ok) throw new Error(depot.raison);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(piecesProjet).values({
        id,
        organizationId,
        projetId,
        depenseId: cible.depenseId ?? null,
        nature: piece.nature,
        legende: piece.legende?.trim() || null,
        chemin,
        nomFichier: piece.fichier.nom,
        typeMime: piece.fichier.typeMime,
        tailleOctets: piece.fichier.contenu.byteLength,
        deposeParUserId: userId,
      });
      await journaliser(tx, organizationId, userId, "piece.joindre", id, { nature: piece.nature, projetId, depenseId: cible.depenseId });
    });
  } catch (erreur) {
    await supprimer(chemin);
    throw erreur;
  }
  return { id };
}

/** Retire une pièce : la fiche d'abord, le fichier ensuite. */
export async function retirerPiece(organizationId: string, pieceId: string, userId: string): Promise<void> {
  const [retiree] = await db
    .delete(piecesProjet)
    .where(and(eq(piecesProjet.id, pieceId), eq(piecesProjet.organizationId, organizationId)))
    .returning({ chemin: piecesProjet.chemin });
  if (!retiree) throw new Error("Pièce introuvable.");
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "piece.retirer",
    entityType: "piece",
    entityId: pieceId,
    after: { chemin: retiree.chemin },
  });
  await supprimer(retiree.chemin);
}
