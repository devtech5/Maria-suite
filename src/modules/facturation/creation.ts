import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { ecritureReglement } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import type { CodeUnite } from "@/lib/quantite";
import { lettrerPiecesSoldees } from "@/modules/comptabilite/lettrage-auto";
import { commerciaux } from "@/modules/commerciaux/schema";
import { articles } from "@/modules/catalogue/schema";
import { creerArticleDans } from "@/modules/catalogue/creation";
import { contactPourPiece } from "@/modules/tiers/contacts";
import { creerTiersDans } from "@/modules/tiers/creation";
import type { NatureTiers } from "@/modules/tiers/natures";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { enregistrerMouvementDans } from "@/modules/stock/creation";
import { depots } from "@/modules/stock/schema";
import { projets } from "@/modules/projets/schema";
import { tiers } from "@/modules/tiers/schema";
import { referentielArticles } from "@/modules/ventes/creation";
import { compteTresorerieDe } from "@/modules/tresorerie/creation";

import {
  PREFIXE_PIECE,
  echeanceDe,
  ecritureDePiece,
  montantHtLigne,
  resteDu,
  totaliserPiece,
  type LigneSaisie,
} from "./calcul";
import {
  lignesPiece,
  piecesCommerciales,
  reglementsPiece,
  type MoyenReglementPiece,
  type NaturePiece,
} from "./schema";

/** Valeurs retenues pour une ligne libre, sans article. */
const DEFAUTS = { tauxTva: 1800, compteVente: "706" };

export interface LigneDemandee {
  articleId: string | null;
  designation: string;
  /** En millièmes d'unité. */
  quantite: number;
  prixUnitaireHt: number;
  remise?: number;
}

/** Un client qui n'existe pas encore : enregistré avec la pièce, son type précisé. */
export interface NouveauClientPiece {
  nom: string;
  nature: NatureTiers;
  telephone?: string | null;
  email?: string | null;
}

export interface BrouillonDemande {
  /** Pièce existante à remplacer ; absente, un brouillon est créé. */
  id?: string;
  nature: NaturePiece;
  /** Client du fichier ; absent, `nouveauClient` est enregistré à l'instant. */
  clientId?: string | null;
  nouveauClient?: NouveauClientPiece | null;
  /**
   * Chaque ligne est un SERVICE : une désignation sans article rattache le
   * service du catalogue du même nom, ou l'y ajoute s'il est nouveau.
   */
  creerServices?: boolean;
  projetId?: string | null;
  datePiece: string;
  echeance?: string | null;
  depotId?: string | null;
  notes?: string | null;
  /** Commercial à qui la pièce est attribuée. */
  commercialId?: string | null;
  /** Interlocuteur chez le client ; il doit appartenir à ce client. */
  contactId?: string | null;
  lignes: LigneDemandee[];
}

/**
 * Lignes complétées par le serveur.
 *
 * Le taux de TVA et le compte de produit viennent de l'ARTICLE, jamais du
 * navigateur : ils relèvent du droit fiscal, pas de la saisie. Une ligne
 * libre (sans article) est une prestation au taux normal, sur le compte 706.
 */
async function completerLignes(
  tx: Transaction,
  organizationId: string,
  lignes: LigneDemandee[],
): Promise<(LigneSaisie & { articleId: string | null; unite: CodeUnite })[]> {
  const referentiel = await referentielArticles(
    tx,
    organizationId,
    lignes.map((l) => l.articleId).filter((id): id is string => id !== null),
  );

  return lignes.map((ligne) => {
    const article = ligne.articleId ? referentiel.get(ligne.articleId) : undefined;
    if (ligne.articleId && !article) {
      throw new Error(`Article introuvable pour « ${ligne.designation} ».`);
    }
    return {
      articleId: article?.id ?? null,
      designation: ligne.designation.trim(),
      quantite: ligne.quantite,
      unite: article?.unite ?? "piece",
      prixUnitaireHt: ligne.prixUnitaireHt,
      remise: ligne.remise ?? 0,
      tauxTva: article?.tauxTva ?? DEFAUTS.tauxTva,
      compteVente: article?.compteVente ?? DEFAUTS.compteVente,
    };
  });
}

/**
 * Enregistre sur-le-champ le client d'une pièce qui n'est pas au fichier.
 *
 * Même transaction que le brouillon : si la pièce échoue, le client n'existe
 * pas non plus. Un client déjà au fichier sous le même nom n'est pas recréé :
 * deux fiches pour une même personne morale, c'est deux comptes 411 et un
 * lettrage qui ne se retrouve plus.
 */
async function creerClientDeLaPiece(tx: Transaction, organizationId: string, n: NouveauClientPiece, userId?: string): Promise<string> {
  const nom = n.nom.trim();
  if (nom.length < 2) throw new Error("Indiquez le nom du nouveau client.");
  const [existant] = await tx
    .select({ id: tiers.id })
    .from(tiers)
    .where(and(eq(tiers.organizationId, organizationId), eq(tiers.estClient, true), isNull(tiers.deletedAt), sql`lower(${tiers.nom}) = lower(${nom})`));
  if (existant) throw new Error(`« ${nom} » est déjà au fichier clients : choisissez-le dans la liste.`);
  const { id } = await creerTiersDans(
    tx,
    organizationId,
    { nom, nature: n.nature, estClient: true, telephone: n.telephone?.trim() || null, email: n.email?.trim() || null },
    userId,
  );
  return id;
}

/**
 * Rattache chaque ligne à un service du catalogue : le service existant du
 * même nom (casse et accents ignorés par `lower`), sinon un service créé au
 * prix saisi. Deux lignes du même service nouveau n'en créent qu'un.
 */
async function rattacherServices(tx: Transaction, organizationId: string, lignes: LigneDemandee[], userId?: string): Promise<LigneDemandee[]> {
  const connus = new Map<string, string>();
  const resultat: LigneDemandee[] = [];
  for (const ligne of lignes) {
    if (ligne.articleId) {
      resultat.push(ligne);
      continue;
    }
    const designation = ligne.designation.trim();
    const cle = designation.toLowerCase();
    let articleId = connus.get(cle) ?? null;
    if (!articleId) {
      const [existant] = await tx
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.organizationId, organizationId), eq(articles.actif, true), isNull(articles.deletedAt), sql`lower(${articles.designation}) = lower(${designation})`))
        .limit(1);
      articleId =
        existant?.id ??
        (
          await creerArticleDans(
            tx,
            organizationId,
            // Le prix de rayon d'un article est TTC ; la ligne est saisie hors taxes.
            { designation, type: "service", prixVente: Math.round((ligne.prixUnitaireHt * (10_000 + DEFAUTS.tauxTva)) / 10_000), tauxTva: DEFAUTS.tauxTva, compteVente: DEFAUTS.compteVente },
            userId,
          )
        ).id;
      connus.set(cle, articleId);
    }
    resultat.push({ ...ligne, articleId });
  }
  return resultat;
}

async function client(tx: Transaction, organizationId: string, clientId: string) {
  const [fiche] = await tx
    .select({
      id: tiers.id,
      nom: tiers.nom,
      compte: tiers.compteClient,
      delai: tiers.delaiReglementJours,
    })
    .from(tiers)
    .where(
      and(eq(tiers.id, clientId), eq(tiers.organizationId, organizationId), eq(tiers.estClient, true)),
    );
  if (!fiche) throw new Error("Client introuvable.");
  return fiche;
}

/** Le projet visé, s'il appartient à l'entreprise. Un projet clos garde ses pièces, il n'en reçoit plus. */
async function projetOuvert(tx: Transaction, organizationId: string, projetId: string | null | undefined) {
  if (!projetId) return null;
  const [projet] = await tx
    .select({ id: projets.id, statut: projets.statut })
    .from(projets)
    .where(and(eq(projets.id, projetId), eq(projets.organizationId, organizationId)));
  if (!projet) throw new Error("Projet introuvable.");
  return projet.id;
}

/**
 * Crée ou remplace un brouillon.
 *
 * Seul un brouillon se modifie : la mise à jour est conditionnée au statut, et
 * une pièce émise entre-temps (autre onglet, autre poste) n'est pas touchée.
 * Les lignes sont REMPLACÉES en bloc — plus simple et plus sûr qu'un
 * rapprochement ligne à ligne sur un document qui n'a encore engagé personne.
 */
export async function enregistrerBrouillonDans(
  tx: Transaction,
  organizationId: string,
  demande: BrouillonDemande,
  userId?: string,
): Promise<{ id: string }> {
  if (demande.lignes.length === 0) throw new Error("Ajoutez au moins une ligne.");

  let clientId = demande.clientId ?? null;
  if (!clientId) {
    if (!demande.nouveauClient) throw new Error("Choisissez un client.");
    clientId = await creerClientDeLaPiece(tx, organizationId, demande.nouveauClient, userId);
  }
  const fiche = await client(tx, organizationId, clientId);
  const demandees = demande.creerServices ? await rattacherServices(tx, organizationId, demande.lignes, userId) : demande.lignes;
  const lignes = await completerLignes(tx, organizationId, demandees);
  const totaux = totaliserPiece(lignes);

  const echeance =
    demande.echeance ??
    (demande.nature === "facture" ? echeanceDe(demande.datePiece, fiche.delai) : null);

  const valeurs = {
    nature: demande.nature,
    clientId: fiche.id,
    clientNom: fiche.nom,
    projetId: await projetOuvert(tx, organizationId, demande.projetId),
    datePiece: demande.datePiece,
    echeance,
    depotId: demande.depotId ?? null,
    notes: demande.notes ?? null,
    commercialId: await commercialValide(tx, organizationId, demande.commercialId),
    ...(await contactPourPiece(tx, organizationId, fiche.id, demande.contactId)),
    totalHt: totaux.totalHt,
    totalTva: totaux.totalTva,
    totalTtc: totaux.totalTtc,
  };

  let id = demande.id;

  if (id) {
    const [modifiee] = await tx
      .update(piecesCommerciales)
      .set({ ...valeurs, updatedAt: new Date(), version: sql`${piecesCommerciales.version} + 1` })
      .where(
        and(
          eq(piecesCommerciales.id, id),
          eq(piecesCommerciales.organizationId, organizationId),
          eq(piecesCommerciales.statut, "brouillon"),
        ),
      )
      .returning({ id: piecesCommerciales.id });
    if (!modifiee) throw new Error("Seul un brouillon se modifie.");
    await tx.delete(lignesPiece).where(eq(lignesPiece.pieceId, id));
  } else {
    id = newId();
    await tx.insert(piecesCommerciales).values({ id, organizationId, ...valeurs, userId: userId ?? null });
  }

  await tx.insert(lignesPiece).values(
    lignes.map((ligne, index) => ({
      id: newId(),
      organizationId,
      pieceId: id,
      ordre: index,
      articleId: ligne.articleId,
      designation: ligne.designation,
      quantite: ligne.quantite,
      unite: ligne.unite,
      prixUnitaireHt: ligne.prixUnitaireHt,
      remise: ligne.remise,
      montantHt: montantHtLigne(ligne),
      tauxTva: ligne.tauxTva,
      compteVente: ligne.compteVente,
    })),
  );

  return { id };
}

/** Pièce et ses lignes, relues dans la transaction. */
async function lirePiece(tx: Transaction, organizationId: string, id: string) {
  const [piece] = await tx
    .select()
    .from(piecesCommerciales)
    .where(and(eq(piecesCommerciales.id, id), eq(piecesCommerciales.organizationId, organizationId)))
    .for("update");
  if (!piece) throw new Error("Pièce introuvable.");

  const lignes = await tx
    .select()
    .from(lignesPiece)
    .where(eq(lignesPiece.pieceId, id))
    .orderBy(asc(lignesPiece.ordre));

  return { piece, lignes };
}

/** Un commercial de l'entreprise, actif ; nul s'il n'en est rien demandé. */
async function commercialValide(tx: Transaction, organizationId: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [c] = await tx
    .select({ id: commerciaux.id })
    .from(commerciaux)
    .where(and(eq(commerciaux.id, id), eq(commerciaux.organizationId, organizationId), eq(commerciaux.actif, true)));
  if (!c) throw new Error("Commercial introuvable ou inactif.");
  return c.id;
}

async function numeroter(tx: Transaction, organizationId: string, nature: NaturePiece, date: string) {
  const annee = date.slice(0, 4);
  return prochainNumero(tx, organizationId, {
    cle: `piece:${nature}`,
    prefix: `${PREFIXE_PIECE[nature]}-${annee}-`,
    padding: 5,
    periode: annee,
  });
}

/**
 * Émet une pièce : numéro, totaux figés, et pour une facture, la sortie de
 * stock et l'écriture comptable — dans la même transaction.
 *
 * Le numéro n'est attribué qu'ici. Un brouillon abandonné ne laisse donc pas
 * de trou dans la suite des factures.
 *
 * Un devis émis n'écrit rien en comptabilité : il n'engage personne tant
 * qu'il n'est pas accepté puis converti en facture.
 */
export async function emettreDans(
  tx: Transaction,
  organizationId: string,
  pieceId: string,
  userId: string,
): Promise<{ numero: string; ecriture?: string }> {
  const { piece, lignes } = await lirePiece(tx, organizationId, pieceId);
  if (piece.statut !== "brouillon") throw new Error("Cette pièce est déjà émise.");
  if (lignes.length === 0) throw new Error("Une pièce sans ligne ne s'émet pas.");

  const fiche = await client(tx, organizationId, piece.clientId);
  const numero = await numeroter(tx, organizationId, piece.nature, piece.datePiece);

  let numeroEcriture: string | undefined;

  if (piece.nature !== "devis") {
    if (!fiche.compte) {
      throw new Error(`Le client « ${fiche.nom} » n'a pas de compte client (411).`);
    }

    // Stock : une facture de marchandise sort ce qu'elle livre, un avoir le
    // reprend. Sans dépôt désigné, le premier magasin actif fournit.
    const depotId = piece.depotId ?? (await depotParDefaut(tx, organizationId));
    const referentiel = await referentielArticles(
      tx,
      organizationId,
      lignes.map((l) => l.articleId).filter((id): id is string => id !== null),
    );

    for (const ligne of lignes) {
      const article = ligne.articleId ? referentiel.get(ligne.articleId) : undefined;
      if (!article?.suiviStock) continue;
      if (!depotId) throw new Error("Aucun dépôt pour sortir la marchandise facturée.");

      await enregistrerMouvementDans(
        tx,
        organizationId,
        {
          depotId,
          articleId: article.id,
          type: piece.nature === "facture" ? "vente" : "retour",
          quantite: piece.nature === "facture" ? -ligne.quantite : ligne.quantite,
          piece: numero,
          origineType: piece.nature,
          origineId: piece.id,
        },
        userId,
      );
    }

    const ecriture = ecritureDePiece({
      nature: piece.nature,
      numero,
      date: piece.datePiece,
      client: fiche.nom,
      compteAuxiliaire: fiche.compte,
      lignes: lignes.map((l) => ({
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaireHt: l.prixUnitaireHt,
        remise: l.remise,
        tauxTva: l.tauxTva,
        compteVente: l.compteVente,
      })),
    });

    numeroEcriture = await enregistrerEcritureDans(tx, ecriture, {
      organizationId,
      userId,
      origine: piece.nature,
      pieceId: piece.id,
      exercice: piece.datePiece.slice(0, 4),
      dateIso: piece.datePiece,
    });

    await tx
      .update(piecesCommerciales)
      .set({ depotId })
      .where(eq(piecesCommerciales.id, piece.id));
  }

  await tx
    .update(piecesCommerciales)
    .set({
      numero,
      statut: "emise",
      clientNom: fiche.nom,
      ecritureNumero: numeroEcriture ?? null,
      emiseLe: new Date(),
      updatedAt: new Date(),
      version: sql`${piecesCommerciales.version} + 1`,
    })
    .where(eq(piecesCommerciales.id, piece.id));

  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: `${piece.nature}.emettre`,
    entityType: "piece_commerciale",
    entityId: piece.id,
    after: { numero, totalTtc: piece.totalTtc, ecriture: numeroEcriture ?? null },
  });

  return { numero, ecriture: numeroEcriture };
}

async function depotParDefaut(tx: Transaction, organizationId: string): Promise<string | null> {
  const [depot] = await tx
    .select({ id: depots.id })
    .from(depots)
    .where(
      and(eq(depots.organizationId, organizationId), eq(depots.actif, true), isNull(depots.deletedAt)),
    )
    .orderBy(desc(depots.parDefaut), asc(depots.createdAt))
    .limit(1);
  return depot?.id ?? null;
}

/** Accepte ou refuse un devis émis. */
export async function deciderDevisDans(
  tx: Transaction,
  organizationId: string,
  pieceId: string,
  decision: "acceptee" | "refusee",
  userId: string,
): Promise<boolean> {
  const [devis] = await tx
    .update(piecesCommerciales)
    .set({ statut: decision, updatedAt: new Date(), version: sql`${piecesCommerciales.version} + 1` })
    .where(
      and(
        eq(piecesCommerciales.id, pieceId),
        eq(piecesCommerciales.organizationId, organizationId),
        eq(piecesCommerciales.nature, "devis"),
        eq(piecesCommerciales.statut, "emise"),
      ),
    )
    .returning({ numero: piecesCommerciales.numero });

  if (devis) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: `devis.${decision === "acceptee" ? "accepter" : "refuser"}`,
      entityType: "piece_commerciale",
      entityId: pieceId,
      after: { numero: devis.numero },
    });
  }
  return Boolean(devis);
}

/**
 * Convertit un devis en facture BROUILLON.
 *
 * Brouillon et non facture émise : entre le devis et la livraison, une
 * quantité change souvent. La facture se relit, puis s'émet.
 */
export async function convertirDevisDans(
  tx: Transaction,
  organizationId: string,
  devisId: string,
  userId: string,
): Promise<{ id: string }> {
  const { piece, lignes } = await lirePiece(tx, organizationId, devisId);
  if (piece.nature !== "devis") throw new Error("Seul un devis se convertit.");
  if (piece.statut !== "emise" && piece.statut !== "acceptee") {
    throw new Error("Seul un devis émis ou accepté se convertit en facture.");
  }

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const { id } = await enregistrerBrouillonDans(
    tx,
    organizationId,
    {
      nature: "facture",
      clientId: piece.clientId,
      projetId: piece.projetId,
      datePiece: aujourdHui,
      depotId: piece.depotId,
      notes: piece.notes,
      commercialId: piece.commercialId,
      lignes: lignes.map((l) => ({
        articleId: l.articleId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaireHt: l.prixUnitaireHt,
        remise: l.remise,
      })),
    },
    userId,
  );

  // Le contact suit la pièce d'origine tel qu'il y est imprimé, même retiré depuis.
  await tx.update(piecesCommerciales).set({ origineId: devisId, contactId: piece.contactId, contactNom: piece.contactNom }).where(eq(piecesCommerciales.id, id));
  await tx
    .update(piecesCommerciales)
    .set({ statut: "convertie", updatedAt: new Date(), version: sql`${piecesCommerciales.version} + 1` })
    .where(eq(piecesCommerciales.id, devisId));

  return { id };
}

/**
 * Annule une facture émise par un avoir total, émis aussitôt.
 *
 * La facture ne disparaît pas : elle passe « annulée », avec son motif, et
 * l'avoir porte la contrepassation et le retour en stock. Une facture déjà
 * réglée en tout ou partie ne s'annule pas ainsi — l'argent reçu devrait être
 * rendu, et c'est une décision à part.
 */
export async function annulerFactureDans(
  tx: Transaction,
  organizationId: string,
  factureId: string,
  motif: string,
  userId: string,
): Promise<{ avoir: string }> {
  const { piece, lignes } = await lirePiece(tx, organizationId, factureId);
  if (piece.nature !== "facture" || piece.statut !== "emise") {
    throw new Error("Seule une facture émise s'annule par avoir.");
  }

  const [regle] = await tx
    .select({ total: sql<string>`coalesce(sum(${reglementsPiece.montant}), 0)` })
    .from(reglementsPiece)
    .where(eq(reglementsPiece.pieceId, factureId));
  if (Number(regle?.total ?? 0) > 0) {
    throw new Error("Cette facture a reçu des règlements : rembourser le client avant de l'annuler.");
  }

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const { id: avoirId } = await enregistrerBrouillonDans(
    tx,
    organizationId,
    {
      nature: "avoir",
      clientId: piece.clientId,
      projetId: piece.projetId,
      datePiece: aujourdHui,
      depotId: piece.depotId,
      notes: `Annulation de la facture ${piece.numero} : ${motif}`,
      commercialId: piece.commercialId,
      lignes: lignes.map((l) => ({
        articleId: l.articleId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaireHt: l.prixUnitaireHt,
        remise: l.remise,
      })),
    },
    userId,
  );
  await tx.update(piecesCommerciales).set({ origineId: factureId, contactId: piece.contactId, contactNom: piece.contactNom }).where(eq(piecesCommerciales.id, avoirId));

  const { numero } = await emettreDans(tx, organizationId, avoirId, userId);

  // La facture et son avoir se compensent au 411 : on les rapproche tout de suite.
  const fiche = await client(tx, organizationId, piece.clientId);
  if (fiche.compte) await lettrerPiecesSoldees(tx, organizationId, [factureId, avoirId], fiche.compte);

  await tx
    .update(piecesCommerciales)
    .set({
      statut: "annulee",
      motifAnnulation: `${motif} (avoir ${numero})`,
      updatedAt: new Date(),
      version: sql`${piecesCommerciales.version} + 1`,
    })
    .where(eq(piecesCommerciales.id, factureId));

  return { avoir: numero };
}

/**
 * Enregistre un règlement reçu sur une facture.
 *
 * Écriture : trésorerie au débit, 411 au crédit. Le montant ne peut pas
 * dépasser le reste dû — un trop-perçu se traite à part, sinon le compte
 * client passerait créditeur sans que personne ne l'ait décidé.
 */
export async function encaisserDans(
  tx: Transaction,
  organizationId: string,
  reglement: {
    pieceId: string;
    montant: number;
    moyen: MoyenReglementPiece;
    date: string;
    reference?: string | null;
    /** Compte de trésorerie qui reçoit l'argent ; absent, celui du moyen. */
    compteTresorerieId?: string | null;
  },
  userId: string,
): Promise<{ numero: string; reste: number }> {
  const { piece } = await lirePiece(tx, organizationId, reglement.pieceId);
  if (piece.nature !== "facture" || piece.statut !== "emise") {
    throw new Error("Seule une facture émise se règle.");
  }

  const [deja] = await tx
    .select({ total: sql<string>`coalesce(sum(${reglementsPiece.montant}), 0)` })
    .from(reglementsPiece)
    .where(eq(reglementsPiece.pieceId, piece.id));
  const reste = resteDu(piece.totalTtc, Number(deja?.total ?? 0));

  if (reglement.montant <= 0) throw new Error("Le montant doit être positif.");
  if (reglement.montant > reste) {
    throw new Error(`Le règlement dépasse le reste dû (${reste} F).`);
  }

  const fiche = await client(tx, organizationId, piece.clientId);
  if (!fiche.compte) throw new Error("Ce client n'a pas de compte client (411).");

  const numero = await prochainNumero(tx, organizationId, {
    cle: "reglement:client",
    prefix: `REG-${reglement.date.slice(0, 4)}-`,
    padding: 5,
    periode: reglement.date.slice(0, 4),
  });

  const tresorerie = reglement.compteTresorerieId ? await compteTresorerieDe(tx, organizationId, reglement.compteTresorerieId) : null;
  if (reglement.compteTresorerieId && !tresorerie) throw new Error("Compte de trésorerie introuvable ou fermé.");

  const ecriture = ecritureReglement({
    numero,
    date: reglement.date,
    client: fiche.nom,
    compteAuxiliaire: fiche.compte,
    montant: reglement.montant,
    moyen: reglement.moyen,
    tresorerie: tresorerie
      ? { numero: tresorerie.numero, libelle: tresorerie.libelle, journal: tresorerie.nature === "banque" ? "BQ" : "CA" }
      : null,
  });

  const numeroEcriture = await enregistrerEcritureDans(tx, ecriture, {
    organizationId,
    userId,
    origine: "reglement",
    pieceId: piece.id,
    exercice: reglement.date.slice(0, 4),
    dateIso: reglement.date,
  });

  await tx.insert(reglementsPiece).values({
    id: newId(),
    organizationId,
    pieceId: piece.id,
    numero,
    dateReglement: reglement.date,
    moyen: reglement.moyen,
    montant: reglement.montant,
    reference: reglement.reference ?? null,
    ecritureNumero: numeroEcriture,
    userId,
  });

  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "facture.encaisser",
    entityType: "piece_commerciale",
    entityId: piece.id,
    after: { facture: piece.numero, reglement: numero, montant: reglement.montant },
  });

  // Soldée, la facture se lettre avec ses règlements : plus rien d'ouvert au 411.
  if (reste - reglement.montant === 0) {
    await lettrerPiecesSoldees(tx, organizationId, [piece.id], fiche.compte);
  }

  return { numero, reste: reste - reglement.montant };
}

/** Supprime un brouillon. Une pièce émise ne se supprime jamais. */
export async function supprimerBrouillonDans(
  tx: Transaction,
  organizationId: string,
  pieceId: string,
): Promise<boolean> {
  const supprimees = await tx
    .delete(piecesCommerciales)
    .where(
      and(
        eq(piecesCommerciales.id, pieceId),
        eq(piecesCommerciales.organizationId, organizationId),
        eq(piecesCommerciales.statut, "brouillon"),
      ),
    )
    .returning({ id: piecesCommerciales.id });
  return supprimees.length > 0;
}
