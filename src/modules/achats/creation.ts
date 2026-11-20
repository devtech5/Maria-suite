import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { contrepasser } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";
import { articles, famillesArticle } from "@/modules/catalogue/schema";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { contactPourPiece } from "@/modules/tiers/contacts";
import { lettrerPiecesSoldees } from "@/modules/comptabilite/lettrage-auto";
import { enregistrerMouvementDans } from "@/modules/stock/creation";
import { alertesReapprovisionnement, depotParDefaut, quantiteSuggeree } from "@/modules/stock/requetes";
import { tiers } from "@/modules/tiers/schema";
import { exigerProvision } from "@/modules/tresorerie/creation";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import {
  ecritureFactureFournisseur,
  ecritureReglementFournisseur,
  refusReception,
  refusReglement,
  statutApresReception,
  totaux,
  type LigneAchat,
} from "./calcul";
import {
  commandesAchat,
  facturesFournisseur,
  lignesCommandeAchat,
  lignesFactureFournisseur,
  lignesReceptionAchat,
  receptionsAchat,
  reglementsFournisseur,
} from "./schema";

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: action.split(".")[0], entityId: entiteId, after: apres });
}

async function numeroter(tx: Transaction, organizationId: string, cle: string, prefixe: string, date: string) {
  const annee = date.slice(0, 4);
  return prochainNumero(tx, organizationId, { cle, prefix: `${prefixe}-${annee}-`, padding: 5, periode: annee });
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Le fournisseur, actif, de l'entreprise, avec son compte 401. */
async function fournisseurDe(tx: Transaction, organizationId: string, id: string) {
  const [f] = await tx
    .select({ id: tiers.id, nom: tiers.nom, compte: tiers.compteFournisseur, estFournisseur: tiers.estFournisseur, actif: tiers.actif })
    .from(tiers)
    .where(and(eq(tiers.id, id), eq(tiers.organizationId, organizationId), isNull(tiers.deletedAt)));
  if (!f || !f.actif) throw new Error("Fournisseur introuvable.");
  if (!f.estFournisseur || !f.compte) throw new Error(`« ${f.nom} » n'est pas déclaré comme fournisseur : il n'a pas de compte 401.`);
  return { ...f, compte: f.compte };
}

export interface LigneSaisieAchat extends LigneAchat {
  articleId?: string | null;
  ligneCommandeId?: string | null;
}

// ------------------------------------------------------------------ commandes

export interface NouvelleCommande {
  fournisseurId: string;
  depotId?: string | null;
  dateCommande: string;
  livraisonPrevue?: string | null;
  notes?: string | null;
  /** Interlocuteur chez le fournisseur. */
  contactId?: string | null;
  lignes: LigneSaisieAchat[];
}

async function ecrireLignesCommande(tx: Transaction, organizationId: string, commandeId: string, lignes: LigneSaisieAchat[]) {
  if (lignes.length === 0) throw new Error("Une commande sans ligne ne se passe pas.");
  await tx.insert(lignesCommandeAchat).values(
    lignes.map((l, ordre) => ({
      id: newId(),
      organizationId,
      commandeId,
      articleId: l.articleId ?? null,
      designation: l.designation.trim(),
      quantite: l.quantite,
      prixUnitaireHt: l.prixUnitaireHt,
      tauxTva: l.tauxTva,
      compteAchat: l.compteAchat,
      ordre,
    })),
  );
}

export async function creerCommandeDans(tx: Transaction, organizationId: string, c: NouvelleCommande, userId: string): Promise<{ id: string; numero: string }> {
  const fournisseur = await fournisseurDe(tx, organizationId, c.fournisseurId);
  const numero = await numeroter(tx, organizationId, "commande_achat", "BCF", c.dateCommande);
  const id = newId();
  const t = totaux(c.lignes);
  await tx.insert(commandesAchat).values({
    id,
    organizationId,
    numero,
    fournisseurId: fournisseur.id,
    fournisseurNom: fournisseur.nom,
    depotId: c.depotId ?? null,
    dateCommande: c.dateCommande,
    livraisonPrevue: c.livraisonPrevue ?? null,
    totalHt: t.totalHt,
    totalTva: t.totalTva,
    totalTtc: t.totalTtc,
    notes: c.notes?.trim() || null,
    ...(await contactPourPiece(tx, organizationId, fournisseur.id, c.contactId)),
    creeParUserId: userId,
  });
  await ecrireLignesCommande(tx, organizationId, id, c.lignes);
  await journaliser(tx, organizationId, userId, "commande_achat.creer", id, { numero, fournisseur: fournisseur.nom, totalTtc: t.totalTtc });
  return { id, numero };
}

async function commandeVerrouillee(tx: Transaction, organizationId: string, id: string) {
  const [c] = await tx
    .select()
    .from(commandesAchat)
    .where(and(eq(commandesAchat.id, id), eq(commandesAchat.organizationId, organizationId), isNull(commandesAchat.deletedAt)))
    .for("update");
  if (!c) throw new Error("Commande introuvable.");
  return c;
}

/** Un brouillon se modifie en entier ; une commande envoyée ne se modifie plus. */
export async function modifierCommandeDans(tx: Transaction, organizationId: string, id: string, c: NouvelleCommande, userId: string): Promise<{ numero: string }> {
  const commande = await commandeVerrouillee(tx, organizationId, id);
  if (commande.statut !== "brouillon") throw new Error(`${commande.numero} est envoyée : elle ne se modifie plus.`);
  const fournisseur = await fournisseurDe(tx, organizationId, c.fournisseurId);
  const t = totaux(c.lignes);
  await tx.delete(lignesCommandeAchat).where(eq(lignesCommandeAchat.commandeId, id));
  await ecrireLignesCommande(tx, organizationId, id, c.lignes);
  await tx
    .update(commandesAchat)
    .set({
      fournisseurId: fournisseur.id,
      fournisseurNom: fournisseur.nom,
      depotId: c.depotId ?? null,
      dateCommande: c.dateCommande,
      livraisonPrevue: c.livraisonPrevue ?? null,
      notes: c.notes?.trim() || null,
      ...(await contactPourPiece(tx, organizationId, fournisseur.id, c.contactId)),
      totalHt: t.totalHt,
      totalTva: t.totalTva,
      totalTtc: t.totalTtc,
      updatedAt: new Date(),
      version: sql`${commandesAchat.version} + 1`,
    })
    .where(eq(commandesAchat.id, id));
  await journaliser(tx, organizationId, userId, "commande_achat.modifier", id, { numero: commande.numero, totalTtc: t.totalTtc });
  return { numero: commande.numero };
}

export async function envoyerCommandeDans(tx: Transaction, organizationId: string, id: string, userId: string): Promise<{ numero: string }> {
  const c = await commandeVerrouillee(tx, organizationId, id);
  if (c.statut !== "brouillon") throw new Error(`${c.numero} est déjà envoyée.`);
  await tx.update(commandesAchat).set({ statut: "envoyee", envoyeeLe: new Date(), updatedAt: new Date(), version: sql`${commandesAchat.version} + 1` }).where(eq(commandesAchat.id, id));
  await journaliser(tx, organizationId, userId, "commande_achat.envoyer", id, { numero: c.numero, fournisseur: c.fournisseurNom });
  return { numero: c.numero };
}

/** Une commande s'annule tant que rien n'est reçu ni facturé. */
export async function annulerCommandeDans(tx: Transaction, organizationId: string, id: string, motif: string, userId: string): Promise<{ numero: string }> {
  const c = await commandeVerrouillee(tx, organizationId, id);
  if (c.statut === "annulee") throw new Error(`${c.numero} est déjà annulée.`);
  const [recu] = await tx.select({ n: sql<string>`count(*)` }).from(receptionsAchat).where(and(eq(receptionsAchat.commandeId, id), isNull(receptionsAchat.deletedAt)));
  const [facture] = await tx
    .select({ n: sql<string>`count(*)` })
    .from(facturesFournisseur)
    .where(and(eq(facturesFournisseur.commandeId, id), eq(facturesFournisseur.statut, "comptabilisee"), isNull(facturesFournisseur.deletedAt)));
  if (Number(recu?.n ?? 0) > 0 || Number(facture?.n ?? 0) > 0) throw new Error(`${c.numero} a déjà été reçue ou facturée : elle ne s'annule plus.`);
  await tx.update(commandesAchat).set({ statut: "annulee", motifAnnulation: motif, updatedAt: new Date(), version: sql`${commandesAchat.version} + 1` }).where(eq(commandesAchat.id, id));
  await journaliser(tx, organizationId, userId, "commande_achat.annuler", id, { numero: c.numero, motif });
  return { numero: c.numero };
}

/** Lignes d'une commande avec ce qui en est déjà reçu. */
export async function lignesSuivies(tx: Transaction | typeof db, organizationId: string, commandeId: string) {
  const lignes = await tx
    .select()
    .from(lignesCommandeAchat)
    .where(and(eq(lignesCommandeAchat.commandeId, commandeId), eq(lignesCommandeAchat.organizationId, organizationId), isNull(lignesCommandeAchat.deletedAt)))
    .orderBy(asc(lignesCommandeAchat.ordre));
  const recues = await tx
    .select({ ligne: lignesReceptionAchat.ligneCommandeId, total: sql<string>`sum(${lignesReceptionAchat.quantite})` })
    .from(lignesReceptionAchat)
    .where(
      and(
        inArray(
          lignesReceptionAchat.ligneCommandeId,
          lignes.map((l) => l.id).concat(["00000000-0000-0000-0000-000000000000"]),
        ),
        isNull(lignesReceptionAchat.deletedAt),
      ),
    )
    .groupBy(lignesReceptionAchat.ligneCommandeId);
  const parLigne = new Map(recues.map((r) => [r.ligne, Number(r.total)]));
  return lignes.map((l) => ({ ...l, recue: parLigne.get(l.id) ?? 0 }));
}

// ----------------------------------------------------------------- réception

export interface NouvelleReception {
  date: string;
  depotId?: string | null;
  bordereau?: string | null;
  notes?: string | null;
  /** Quantité reçue par ligne de commande, en millièmes. */
  quantites: Record<string, number>;
}

/**
 * Réception : le stock entre, au prix commandé, dans le dépôt de la commande.
 * Une ligne libre (transport, prestation) se reçoit sans mouvement de stock.
 */
export async function recevoirDans(tx: Transaction, organizationId: string, commandeId: string, r: NouvelleReception, userId: string): Promise<{ numero: string; statut: string }> {
  const c = await commandeVerrouillee(tx, organizationId, commandeId);
  if (c.statut !== "envoyee" && c.statut !== "partielle") {
    throw new Error(c.statut === "brouillon" ? "Envoyez d'abord la commande au fournisseur." : `${c.numero} n'attend plus de livraison.`);
  }
  const lignes = await lignesSuivies(tx, organizationId, commandeId);
  const refus = refusReception(lignes, r.quantites);
  if (refus) throw new Error(refus);

  const depotId = r.depotId ?? c.depotId ?? (await depotParDefaut(organizationId))?.id ?? null;
  if (!depotId) throw new Error("Aucun dépôt où recevoir la marchandise : créez-en un dans Stock.");

  const numero = await numeroter(tx, organizationId, "reception_achat", "BR", r.date);
  const id = newId();
  await tx.insert(receptionsAchat).values({
    id,
    organizationId,
    numero,
    commandeId,
    depotId,
    dateReception: r.date,
    bordereau: r.bordereau?.trim() || null,
    notes: r.notes?.trim() || null,
    userId,
  });

  for (const ligne of lignes) {
    const quantite = r.quantites[ligne.id] ?? 0;
    if (quantite <= 0) continue;
    let mouvementId: string | null = null;
    if (ligne.articleId) {
      const [article] = await tx.select({ suiviStock: articles.suiviStock }).from(articles).where(eq(articles.id, ligne.articleId));
      if (article?.suiviStock) {
        const m = await enregistrerMouvementDans(
          tx,
          organizationId,
          {
            depotId,
            articleId: ligne.articleId,
            type: "reception",
            quantite,
            coutUnitaire: ligne.prixUnitaireHt,
            piece: numero,
            origineType: "reception_achat",
            origineId: id,
            motif: `Commande ${c.numero} — ${c.fournisseurNom}`,
            effectueLe: new Date(`${r.date}T12:00:00Z`),
          },
          userId,
        );
        mouvementId = m.id;
      }
    }
    await tx.insert(lignesReceptionAchat).values({ id: newId(), organizationId, receptionId: id, ligneCommandeId: ligne.id, quantite, mouvementId });
  }

  const apres = lignes.map((l) => ({ ...l, recue: l.recue + (r.quantites[l.id] ?? 0) }));
  const statut = statutApresReception(apres);
  await tx.update(commandesAchat).set({ statut, updatedAt: new Date(), version: sql`${commandesAchat.version} + 1` }).where(eq(commandesAchat.id, commandeId));
  await journaliser(tx, organizationId, userId, "reception_achat.recevoir", id, { numero, commande: c.numero, statut });
  return { numero, statut };
}

// ------------------------------------------------------------- factures

export interface NouvelleFacture {
  fournisseurId: string;
  commandeId?: string | null;
  referenceFournisseur: string;
  dateFacture: string;
  echeance: string;
  notes?: string | null;
  lignes: LigneSaisieAchat[];
}

export interface Justificatif {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

/**
 * Enregistre et comptabilise une facture fournisseur. La dette naît ici : 6xx
 * et TVA au débit, 401 au crédit. Le justificatif part au dépôt de fichiers
 * avant la transaction et se retire si elle échoue.
 */
export async function enregistrerFacturePour(
  organizationId: string,
  f: NouvelleFacture,
  justificatif: Justificatif | null,
  userId: string,
): Promise<{ numero: string; ecriture: string }> {
  if (f.echeance < f.dateFacture) throw new Error("L'échéance ne peut pas précéder la date de facture.");
  let chemin: string | null = null;
  if (justificatif) {
    const extension = justificatif.nom.includes(".") ? justificatif.nom.split(".").pop()! : "";
    chemin = cheminDe(organizationId, newId(), extension);
    const depot = await deposer({ chemin, contenu: justificatif.contenu, typeMime: justificatif.typeMime });
    if (!depot.ok) throw new Error(depot.raison);
  }
  try {
    return await db.transaction(async (tx) => {
      const fournisseur = await fournisseurDe(tx, organizationId, f.fournisseurId);
      if (f.commandeId) {
        const c = await commandeVerrouillee(tx, organizationId, f.commandeId);
        if (c.fournisseurId !== fournisseur.id) throw new Error("Cette commande n'est pas passée chez ce fournisseur.");
        if (c.statut === "brouillon" || c.statut === "annulee") throw new Error(`${c.numero} n'est pas une commande en cours.`);
      }
      const numero = await numeroter(tx, organizationId, "facture_fournisseur", "FF", f.dateFacture);
      const id = newId();
      const calcul = ecritureFactureFournisseur({
        numero,
        date: f.dateFacture,
        fournisseur: `${fournisseur.nom} (${f.referenceFournisseur})`,
        compteAuxiliaire: fournisseur.compte,
        lignes: f.lignes,
      });
      const totalTtc = calcul.lignes.find((l) => l.compte === "401")!.credit;
      const totalTva = calcul.lignes.find((l) => l.compte === "4451")?.debit ?? 0;
      if (totalTtc <= 0) throw new Error("Une facture à zéro ne s'enregistre pas.");
      const ecriture = await enregistrerEcritureDans(tx, calcul, {
        organizationId,
        userId,
        origine: "achat",
        pieceId: id,
        exercice: f.dateFacture.slice(0, 4),
        dateIso: f.dateFacture,
      });
      await tx.insert(facturesFournisseur).values({
        id,
        organizationId,
        numero,
        referenceFournisseur: f.referenceFournisseur.trim(),
        fournisseurId: fournisseur.id,
        fournisseurNom: fournisseur.nom,
        commandeId: f.commandeId ?? null,
        dateFacture: f.dateFacture,
        echeance: f.echeance,
        totalHt: totalTtc - totalTva,
        totalTva,
        totalTtc,
        ecriture,
        justificatifChemin: chemin,
        justificatifNom: justificatif?.nom ?? null,
        notes: f.notes?.trim() || null,
        userId,
      });
      await tx.insert(lignesFactureFournisseur).values(
        f.lignes.map((l, ordre) => ({
          id: newId(),
          organizationId,
          factureId: id,
          ligneCommandeId: l.ligneCommandeId ?? null,
          designation: l.designation.trim(),
          quantite: l.quantite,
          prixUnitaireHt: l.prixUnitaireHt,
          tauxTva: l.tauxTva,
          compteAchat: l.compteAchat,
          ordre,
        })),
      );
      await journaliser(tx, organizationId, userId, "facture_fournisseur.enregistrer", id, {
        numero,
        reference: f.referenceFournisseur,
        fournisseur: fournisseur.nom,
        totalTtc,
        ecriture,
      });
      return { numero, ecriture };
    });
  } catch (erreur) {
    if (chemin) await supprimer(chemin);
    throw erreur;
  }
}

/**
 * Annule une facture saisie par erreur, tant qu'elle n'est pas réglée :
 * l'écriture est contrepassée, jamais effacée.
 */
export async function annulerFactureDans(tx: Transaction, organizationId: string, id: string, motif: string, userId: string): Promise<{ numero: string }> {
  const [f] = await tx
    .select()
    .from(facturesFournisseur)
    .where(and(eq(facturesFournisseur.id, id), eq(facturesFournisseur.organizationId, organizationId), isNull(facturesFournisseur.deletedAt)))
    .for("update");
  if (!f) throw new Error("Facture introuvable.");
  if (f.statut === "annulee") throw new Error(`${f.numero} est déjà annulée.`);
  const [regle] = await tx.select({ n: sql<string>`count(*)` }).from(reglementsFournisseur).where(and(eq(reglementsFournisseur.factureId, id), isNull(reglementsFournisseur.deletedAt)));
  if (Number(regle?.n ?? 0) > 0) throw new Error(`${f.numero} a reçu un règlement : elle ne s'annule plus.`);
  const fournisseur = await fournisseurDe(tx, organizationId, f.fournisseurId);
  const lignes = await tx.select().from(lignesFactureFournisseur).where(eq(lignesFactureFournisseur.factureId, id)).orderBy(asc(lignesFactureFournisseur.ordre));
  const origine = ecritureFactureFournisseur({
    numero: f.numero,
    date: String(f.dateFacture).slice(0, 10),
    fournisseur: `${f.fournisseurNom} (${f.referenceFournisseur})`,
    compteAuxiliaire: fournisseur.compte,
    lignes,
  });
  await enregistrerEcritureDans(tx, contrepasser(origine, `${f.numero}-A`, `Annulation ${f.numero} — ${motif}`, aujourdhui()), {
    organizationId,
    userId,
    origine: "achat",
    pieceId: id,
    exercice: aujourdhui().slice(0, 4),
    dateIso: aujourdhui(),
  });
  await tx
    .update(facturesFournisseur)
    .set({ statut: "annulee", motifAnnulation: motif, updatedAt: new Date(), version: sql`${facturesFournisseur.version} + 1` })
    .where(eq(facturesFournisseur.id, id));
  // Annulée, la facture et sa contrepassation se compensent au 401 : elles se lettrent.
  await lettrerPiecesSoldees(tx, organizationId, [id], fournisseur.compte, "401");
  await journaliser(tx, organizationId, userId, "facture_fournisseur.annuler", id, { numero: f.numero, motif });
  return { numero: f.numero };
}

// ---------------------------------------------------------------- règlements

export interface NouveauReglement {
  montant: number;
  compteTresorerieId: string;
  date: string;
  reference?: string | null;
}

/**
 * Règle une facture fournisseur depuis un compte de trésorerie. Soldée, la
 * facture se lettre avec ses règlements : plus rien d'ouvert au 401.
 */
export async function reglerDans(tx: Transaction, organizationId: string, factureId: string, r: NouveauReglement, userId: string): Promise<{ numero: string; reste: number }> {
  const [f] = await tx
    .select()
    .from(facturesFournisseur)
    .where(and(eq(facturesFournisseur.id, factureId), eq(facturesFournisseur.organizationId, organizationId), isNull(facturesFournisseur.deletedAt)))
    .for("update");
  if (!f) throw new Error("Facture introuvable.");
  if (f.statut !== "comptabilisee") throw new Error(`${f.numero} est annulée.`);
  const [deja] = await tx.select({ total: sql<string>`coalesce(sum(${reglementsFournisseur.montant}), 0)` }).from(reglementsFournisseur).where(and(eq(reglementsFournisseur.factureId, factureId), isNull(reglementsFournisseur.deletedAt)));
  const reste = f.totalTtc - Number(deja?.total ?? 0);
  const refus = refusReglement(reste, r.montant);
  if (refus) throw new Error(refus);

  const [compte] = await tx
    .select()
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.id, r.compteTresorerieId), eq(comptesTresorerie.organizationId, organizationId), isNull(comptesTresorerie.deletedAt)))
    .for("update");
  if (!compte || !compte.actif) throw new Error("Compte de trésorerie introuvable ou fermé.");
  await exigerProvision(tx, organizationId, { numero: compte.compte, libelle: compte.nom, nature: compte.nature, nom: compte.nom }, r.montant);

  const fournisseur = await fournisseurDe(tx, organizationId, f.fournisseurId);
  const numero = await numeroter(tx, organizationId, "reglement_fournisseur", "RGF", r.date);
  const ecriture = await enregistrerEcritureDans(
    tx,
    ecritureReglementFournisseur({
      numero,
      date: r.date,
      fournisseur: fournisseur.nom,
      compteAuxiliaire: fournisseur.compte,
      facture: f.referenceFournisseur,
      montant: r.montant,
      tresorerie: { numero: compte.compte, libelle: compte.nom, journal: compte.nature === "banque" ? "BQ" : "CA" },
    }),
    { organizationId, userId, origine: "reglement", pieceId: f.id, exercice: r.date.slice(0, 4), dateIso: r.date },
  );
  await tx.insert(reglementsFournisseur).values({
    id: newId(),
    organizationId,
    numero,
    factureId,
    compteTresorerieId: compte.id,
    montant: r.montant,
    dateReglement: r.date,
    reference: r.reference?.trim() || null,
    ecriture,
    userId,
  });
  const nouveauReste = reste - r.montant;
  if (nouveauReste === 0) await lettrerPiecesSoldees(tx, organizationId, [f.id], fournisseur.compte, "401");
  await journaliser(tx, organizationId, userId, "facture_fournisseur.regler", f.id, { numero: f.numero, reglement: numero, montant: r.montant, reste: nouveauReste, ecriture });
  return { numero, reste: nouveauReste };
}

// --------------------------------------------------------------- réassort

/**
 * Prépare une commande en brouillon par fournisseur, à partir des articles
 * passés sous leur seuil. Les quantités sont celles du calcul de réassort ; le
 * prix est le dernier prix d'achat ; rien ne part tant que personne n'a relu.
 */
export async function preparerReassort(organizationId: string, userId: string): Promise<{ commandes: string[]; sansFournisseur: number }> {
  const alertes = await alertesReapprovisionnement(organizationId);
  const avecFournisseur = alertes.filter((a) => a.fournisseurId);
  const sansFournisseur = alertes.length - avecFournisseur.length;
  if (avecFournisseur.length === 0) return { commandes: [], sansFournisseur };

  // Pas deux brouillons de réassort pour le même fournisseur : on complète l'existant plus tard, on ne double pas.
  const enCours = await db
    .select({ fournisseurId: commandesAchat.fournisseurId })
    .from(commandesAchat)
    .where(and(eq(commandesAchat.organizationId, organizationId), eq(commandesAchat.statut, "brouillon"), isNull(commandesAchat.deletedAt)));
  const dejaEnBrouillon = new Set(enCours.map((c) => c.fournisseurId));

  const parametres = await db
    .select({
      id: articles.id,
      tauxArticle: articles.tauxTva,
      compteArticle: articles.compteAchat,
      tauxFamille: famillesArticle.tauxTva,
      compteFamille: famillesArticle.compteAchat,
    })
    .from(articles)
    .leftJoin(famillesArticle, eq(famillesArticle.id, articles.familleId))
    .where(inArray(articles.id, avecFournisseur.map((a) => a.articleId)));
  const parArticle = new Map(parametres.map((p) => [p.id, p]));

  const groupes = new Map<string, typeof avecFournisseur>();
  for (const a of avecFournisseur) {
    if (dejaEnBrouillon.has(a.fournisseurId!)) continue;
    groupes.set(a.fournisseurId!, [...(groupes.get(a.fournisseurId!) ?? []), a]);
  }

  const depot = await depotParDefaut(organizationId);
  const commandes: string[] = [];
  for (const [fournisseurId, liste] of groupes) {
    const { numero } = await db.transaction((tx) =>
      creerCommandeDans(
        tx,
        organizationId,
        {
          fournisseurId,
          depotId: depot?.id ?? null,
          dateCommande: aujourdhui(),
          notes: "Préparée depuis les alertes de réassort.",
          lignes: liste.map((a) => {
            const p = parArticle.get(a.articleId);
            return {
              articleId: a.articleId,
              designation: a.designation,
              quantite: quantiteSuggeree(a),
              prixUnitaireHt: a.prixAchat,
              tauxTva: p?.tauxArticle ?? p?.tauxFamille ?? 1800,
              compteAchat: p?.compteArticle ?? p?.compteFamille ?? "601",
            };
          }),
        },
        userId,
      ),
    );
    commandes.push(numero);
  }
  return { commandes, sansFournisseur };
}
