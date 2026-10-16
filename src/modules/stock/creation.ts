import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prixUnitaireDeduit } from "@/lib/quantite";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { articles } from "@/modules/catalogue/schema";
import { depots, mouvementsStock, type TypeDepot, type TypeMouvement } from "./schema";

export interface NouveauDepot {
  nom: string;
  /** Code imposé. Vide : attribué par le compteur. */
  code?: string | null;
  type?: TypeDepot;
  ville?: string | null;
  adresse?: string | null;
  parDefaut?: boolean;
}

/**
 * Crée un dépôt.
 *
 * Le premier dépôt d'une entreprise devient son dépôt par défaut, qu'on le
 * demande ou non : sans lui, la première réception n'aurait nulle part où
 * aller, et la question « quel dépôt ? » se poserait à quelqu'un qui n'en a
 * qu'un seul.
 */
export async function creerDepotDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauDepot,
  userId?: string,
): Promise<{ id: string; code: string }> {
  const code =
    donnees.code?.trim() ||
    (await prochainNumero(tx, organizationId, {
      cle: "depot",
      prefix: "DEP-",
      padding: 2,
    }));

  const [premier] = await tx
    .select({ id: depots.id })
    .from(depots)
    .where(eq(depots.organizationId, organizationId))
    .limit(1);

  const parDefaut = donnees.parDefaut ?? !premier;

  // Un seul dépôt par défaut : l'index unique partiel refuserait le second.
  // Basculer l'ancien AVANT d'insérer le nouveau évite de heurter la contrainte.
  if (parDefaut && premier) {
    await tx
      .update(depots)
      .set({
        parDefaut: false,
        updatedAt: new Date(),
        version: sql`${depots.version} + 1`,
      })
      .where(
        and(
          eq(depots.organizationId, organizationId),
          eq(depots.parDefaut, true),
        ),
      );
  }

  const id = newId();

  await tx.insert(depots).values({
    id,
    organizationId,
    code,
    nom: donnees.nom.trim(),
    type: donnees.type ?? "depot",
    ville: donnees.ville ?? null,
    adresse: donnees.adresse ?? null,
    parDefaut,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "depot.creer",
      entityType: "depot",
      entityId: id,
      after: { code, nom: donnees.nom, parDefaut },
    });
  }

  return { id, code };
}

/**
 * Coût moyen unitaire pondéré d'un article dans un dépôt, en francs entiers.
 *
 * C'est la valorisation retenue par le SYSCOHADA, et c'est celle qui survit au
 * commerce réel : le même riz entre à trois prix différents en trois mois, et
 * personne ne sait dire lequel des sacs part à la vente. La moyenne pondérée
 * ne demande pas de le savoir.
 *
 * Renvoie `null` quand le dépôt ne détient rien de cet article — il n'y a alors
 * aucune moyenne à faire, et l'appelant se rabat sur le prix d'achat connu.
 */
export async function coutMoyenDans(
  tx: Transaction,
  organizationId: string,
  depotId: string,
  articleId: string,
): Promise<number | null> {
  const [ligne] = await tx
    .select({
      quantite: sql<string>`coalesce(sum(${mouvementsStock.quantite}), 0)`,
      // Millièmes de franc : la quantité est en millièmes d'unité. La division
      // par mille attend l'arrondi final, pour ne pas la faire deux fois.
      valeurMillimes: sql<string>`coalesce(sum(${mouvementsStock.quantite} * ${mouvementsStock.coutUnitaire}), 0)`,
    })
    .from(mouvementsStock)
    .where(
      and(
        eq(mouvementsStock.organizationId, organizationId),
        eq(mouvementsStock.depotId, depotId),
        eq(mouvementsStock.articleId, articleId),
      ),
    );

  const quantite = Number(ligne?.quantite ?? 0);
  if (quantite <= 0) return null;

  const valeur = Math.round(Number(ligne?.valeurMillimes ?? 0) / 1000);
  return prixUnitaireDeduit(valeur, quantite);
}

/** Compteur de pièce par nature de mouvement. Une suite par type, pas une seule. */
const PIECE: Record<TypeMouvement, string> = {
  reception: "REC",
  vente: "VTE",
  transfert: "TRF",
  ajustement: "INV",
  retour: "AVO",
};

export interface NouveauMouvement {
  depotId: string;
  articleId: string;
  type: TypeMouvement;
  /** Signée : positive à l'entrée, négative à la sortie. En millièmes d'unité. */
  quantite: number;
  /** Imposé. Vide : prix d'achat à l'entrée, coût moyen pondéré à la sortie. */
  coutUnitaire?: number | null;
  /** Imposée. Vide : attribuée par le compteur de la nature du mouvement. */
  piece?: string | null;
  origineType?: string | null;
  origineId?: string | null;
  depotContrepartieId?: string | null;
  groupeId?: string | null;
  motif?: string | null;
  effectueLe?: Date;
}

/**
 * Enregistre un mouvement de stock.
 *
 * Le coût unitaire se résout ici, une fois, plutôt qu'à chaque appel : à
 * l'entrée c'est le prix payé, à la sortie le coût moyen pondéré du dépôt à cet
 * instant. Laisser l'appelant décider produirait des sorties valorisées au prix
 * de vente, et une marge égale à zéro sur tout l'exercice.
 *
 * Aucune vérification de stock disponible : un stock négatif est une anomalie
 * qui doit se VOIR, pas une écriture à refuser. Le magasin qui vend un article
 * reçu mais non saisi ne doit pas être bloqué à la caisse — il doit apparaître
 * en négatif sur l'écran de stock, ce qui provoque la saisie de la réception
 * oubliée. Refuser la vente ferait sortir la marchandise sans aucune trace.
 */
export async function enregistrerMouvementDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauMouvement,
  userId?: string,
): Promise<{ id: string; piece: string; coutUnitaire: number }> {
  if (donnees.quantite === 0) {
    throw new Error("Un mouvement de stock ne peut pas être de quantité nulle.");
  }

  const [article] = await tx
    .select({
      id: articles.id,
      designation: articles.designation,
      suiviStock: articles.suiviStock,
      prixAchat: articles.prixAchat,
    })
    .from(articles)
    .where(
      and(
        eq(articles.id, donnees.articleId),
        eq(articles.organizationId, organizationId),
      ),
    );

  if (!article) throw new Error("Article introuvable dans cette entreprise.");

  // Une prestation n'a pas de stock à mouvementer. La contrainte de base
  // interdit déjà un service suivi ; celle-ci interdit de lui inventer un
  // mouvement, ce qui donnerait un inventaire d'heures de main-d'œuvre.
  if (!article.suiviStock) {
    throw new Error(
      `« ${article.designation} » ne se stocke pas : aucun mouvement possible.`,
    );
  }

  const coutUnitaire =
    donnees.coutUnitaire ??
    (donnees.quantite > 0
      ? article.prixAchat
      : ((await coutMoyenDans(
          tx,
          organizationId,
          donnees.depotId,
          donnees.articleId,
        )) ?? article.prixAchat));

  const piece =
    donnees.piece?.trim() ||
    (await prochainNumero(tx, organizationId, {
      cle: `mouvement:${donnees.type}`,
      prefix: `${PIECE[donnees.type]}-${new Date().getFullYear()}-`,
      padding: 5,
      periode: String(new Date().getFullYear()),
    }));

  const id = newId();

  await tx.insert(mouvementsStock).values({
    id,
    organizationId,
    depotId: donnees.depotId,
    articleId: donnees.articleId,
    type: donnees.type,
    quantite: donnees.quantite,
    coutUnitaire,
    piece,
    origineType: donnees.origineType ?? null,
    origineId: donnees.origineId ?? null,
    depotContrepartieId: donnees.depotContrepartieId ?? null,
    groupeId: donnees.groupeId ?? null,
    motif: donnees.motif ?? null,
    userId: userId ?? null,
    effectueLe: donnees.effectueLe ?? new Date(),
  });

  return { id, piece, coutUnitaire };
}

export interface NouveauTransfert {
  depotSourceId: string;
  depotDestinationId: string;
  articleId: string;
  /** Positive : ce qui quitte la source. En millièmes d'unité. */
  quantite: number;
  piece?: string | null;
  motif?: string | null;
  effectueLe?: Date;
}

/**
 * Transfère un article d'un dépôt vers un autre.
 *
 * DEUX lignes, reliées par un même `groupeId` : une sortie de la source, une
 * entrée à la destination. Une seule ligne, en positif, créerait de la
 * marchandise — c'est l'erreur du concurrent, et elle rend tout inventaire
 * multi-dépôts faux dès le premier transfert.
 *
 * La marchandise transférée garde sa valeur : le coût moyen de la source suit
 * la quantité vers la destination. Sans cela, un aller-retour entre deux dépôts
 * suffirait à revaloriser le stock au prix d'achat du jour.
 */
export async function transfererDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauTransfert,
  userId?: string,
): Promise<{ piece: string; groupeId: string }> {
  if (donnees.quantite <= 0) {
    throw new Error("La quantité transférée doit être positive.");
  }
  if (donnees.depotSourceId === donnees.depotDestinationId) {
    throw new Error("Le dépôt de départ et celui d'arrivée sont les mêmes.");
  }

  const groupeId = newId();
  const effectueLe = donnees.effectueLe ?? new Date();

  const sortie = await enregistrerMouvementDans(
    tx,
    organizationId,
    {
      depotId: donnees.depotSourceId,
      articleId: donnees.articleId,
      type: "transfert",
      quantite: -donnees.quantite,
      depotContrepartieId: donnees.depotDestinationId,
      groupeId,
      piece: donnees.piece ?? null,
      motif: donnees.motif ?? null,
      effectueLe,
    },
    userId,
  );

  await enregistrerMouvementDans(
    tx,
    organizationId,
    {
      depotId: donnees.depotDestinationId,
      articleId: donnees.articleId,
      type: "transfert",
      quantite: donnees.quantite,
      // Le coût vient de la sortie : la valeur voyage avec la marchandise.
      coutUnitaire: sortie.coutUnitaire,
      depotContrepartieId: donnees.depotSourceId,
      groupeId,
      // La même pièce des deux côtés : un bon de transfert est un seul document.
      piece: sortie.piece,
      motif: donnees.motif ?? null,
      effectueLe,
    },
    userId,
  );

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "stock.transferer",
      entityType: "mouvement_stock",
      entityId: sortie.id,
      after: {
        piece: sortie.piece,
        quantite: donnees.quantite,
        depuis: donnees.depotSourceId,
        vers: donnees.depotDestinationId,
      },
    });
  }

  return { piece: sortie.piece, groupeId };
}

/** Même chose, hors d'une transaction existante. */
export async function creerDepotPour(
  organizationId: string,
  donnees: NouveauDepot,
  userId?: string,
): Promise<{ id: string; code: string }> {
  return db.transaction((tx) => creerDepotDans(tx, organizationId, donnees, userId));
}

/** Même chose, hors d'une transaction existante. */
export async function enregistrerMouvementPour(
  organizationId: string,
  donnees: NouveauMouvement,
  userId?: string,
): Promise<{ id: string; piece: string; coutUnitaire: number }> {
  return db.transaction((tx) =>
    enregistrerMouvementDans(tx, organizationId, donnees, userId),
  );
}
