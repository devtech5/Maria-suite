import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import {
  decomposerTTC,
  ecritureVenteComptoir,
  type LigneComptoir,
  type MoyenComptoir,
} from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { allocateByWeights } from "@/lib/money";
import { montantLigne, type CodeUnite } from "@/lib/quantite";
import type { Transaction } from "@/lib/sequences";
import { articles, famillesArticle } from "@/modules/catalogue/schema";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { coutMoyenDans, enregistrerMouvementDans } from "@/modules/stock/creation";
import { tiers } from "@/modules/tiers/schema";
import {
  lignesVente,
  postesCaisse,
  reglementsVente,
  ventes,
  type LineKind,
  type MoyenReglementVente,
} from "./schema";
import { sessionsCaisse } from "./schema-session";

/** Valeurs retenues quand l'article n'a ni taux propre ni famille. */
const DEFAUTS = { tauxTva: 1800, compteVente: "701" };

export interface LigneAEnregistrer {
  /** Produit par la caisse, y compris hors connexion. */
  id: string;
  articleId: string | null;
  parentLineId?: string | null;
  lineKind?: LineKind;
  designation: string;
  /** En millièmes d'unité de vente. */
  quantite: number;
  /** Prix TTC pratiqué, en francs entiers — celui qui a été imprimé. */
  prixUnitaire: number;
  remise?: number;
  workerId?: string | null;
  coutMainOeuvre?: number;
}

export interface ReglementAEnregistrer {
  moyen: MoyenReglementVente;
  montant: number;
  reference?: string | null;
}

export interface VenteAEnregistrer {
  /** Identifiant définitif, produit par la caisse au moment du ticket. */
  id: string;
  caisseId: string;
  /** Rang dans la suite du poste, tenu par l'appareil. */
  numeroSeq: number;
  clientId?: string | null;
  encaisseeLe?: Date;
  lignes: LigneAEnregistrer[];
  reglements: ReglementAEnregistrer[];
  /** Remise globale de fin de ticket, ventilée sur les lignes au prorata. */
  remisePied?: number;
  especesRecues?: number;
  deviceId?: string | null;
}

export interface ResultatVente {
  id: string;
  numero: string;
  totalTtc: number;
  /** Vraie quand la vente était déjà en base : rien n'a été réécrit. */
  deja: boolean;
  /** Numéro de l'écriture comptable. Absent sur une vente déjà connue. */
  ecriture?: string;
}

/**
 * Enregistre une vente encaissée.
 *
 * IDEMPOTENT, et ce n'est pas un détail de confort : une caisse hors connexion
 * renvoie sa file dès que le réseau revient, et un réseau instable la fait
 * renvoyer deux fois. L'identifiant venant de l'appareil, un second envoi
 * retrouve la vente déjà posée et n'y touche pas — sans quoi le chiffre
 * d'affaires doublerait, le stock sortirait deux fois et la balance ne
 * tomberait plus.
 *
 * Tout se fait dans UNE transaction : le ticket, ses lignes, ses règlements, la
 * sortie de stock et l'écriture comptable. Une coupure entre deux de ces étapes
 * laisserait une vente sans stock, ou une caisse sans comptabilité.
 *
 * Ce que le serveur ACCEPTE de la caisse : les quantités, les prix pratiqués et
 * les remises. Ce sont des décisions commerciales prises au comptoir, et le
 * ticket les porte déjà — les recalculer avec les prix du jour donnerait un
 * montant que le client n'a jamais payé.
 *
 * Ce que le serveur IMPOSE : le taux de TVA et le compte de produit, lus sur
 * l'article. Ceux-là relèvent du droit fiscal, pas du terrain, et les accepter
 * du client laisserait n'importe qui choisir sa propre imposition.
 */
export async function enregistrerVenteDans(
  tx: Transaction,
  organizationId: string,
  vente: VenteAEnregistrer,
  userId: string,
): Promise<ResultatVente> {
  const [existante] = await tx
    .select({
      id: ventes.id,
      numero: ventes.numero,
      totalTtc: ventes.totalTtc,
    })
    .from(ventes)
    .where(and(eq(ventes.id, vente.id), eq(ventes.organizationId, organizationId)));

  if (existante) {
    return { ...existante, deja: true };
  }

  if (vente.lignes.length === 0) {
    throw new Error("Une vente sans ligne ne s'encaisse pas.");
  }

  // ------------------------------------------------------------- le poste
  const [poste] = await tx
    .select()
    .from(postesCaisse)
    .where(
      and(
        eq(postesCaisse.id, vente.caisseId),
        eq(postesCaisse.organizationId, organizationId),
      ),
    );

  if (!poste) throw new Error("Poste de caisse introuvable.");
  if (!poste.actif) throw new Error(`Le poste ${poste.code} est fermé.`);

  const numero = `${poste.prefixe}${String(vente.numeroSeq).padStart(6, "0")}`;

  /**
   * Session en cours sur ce poste, s'il y en a une.
   *
   * Vide n'est pas une erreur : un ticket qui remonte du hors-ligne après la
   * clôture n'a plus de session ouverte à rejoindre, et refuser la vente ferait
   * perdre un encaissement réel. La clôture rattache après coup ce qui est
   * arrivé pendant sa période.
   */
  const [session] = await tx
    .select({ id: sessionsCaisse.id })
    .from(sessionsCaisse)
    .where(
      and(
        eq(sessionsCaisse.organizationId, organizationId),
        eq(sessionsCaisse.caisseId, poste.id),
        eq(sessionsCaisse.statut, "ouverte"),
      ),
    )
    .limit(1);

  // ---------------------------------------------------------- le référentiel
  const referentiel = await referentielArticles(
    tx,
    organizationId,
    vente.lignes
      .map((ligne) => ligne.articleId)
      .filter((id): id is string => id !== null),
  );

  // ------------------------------------------------------------- le calcul
  const brutParLigne = vente.lignes.map((ligne) =>
    montantLigne(ligne.prixUnitaire, ligne.quantite),
  );
  const netParLigne = vente.lignes.map((ligne, index) =>
    Math.max(0, brutParLigne[index] - (ligne.remise ?? 0)),
  );

  // La remise de pied finit imputée ligne par ligne, sinon la ventilation par
  // compte de produit est fausse. `allocateByWeights` garantit que la somme des
  // parts retombe exactement sur la remise accordée.
  const remisePied = Math.min(
    vente.remisePied ?? 0,
    netParLigne.reduce((somme, net) => somme + net, 0),
  );
  const piedParLigne =
    remisePied > 0
      ? allocateByWeights(remisePied, netParLigne)
      : vente.lignes.map(() => 0);

  const calculees = vente.lignes.map((ligne, index) => {
    const article = ligne.articleId ? referentiel.get(ligne.articleId) : undefined;
    const tauxTva = article?.tauxTva ?? DEFAUTS.tauxTva;
    const compteVente = article?.compteVente ?? DEFAUTS.compteVente;

    const ttc = Math.max(0, netParLigne[index] - piedParLigne[index]);
    // Le prix de rayon est TTC en Côte d'Ivoire : la taxe s'extrait, elle ne
    // s'ajoute pas. Un article marqué 300 F s'encaisse 300 F.
    const { ht, tva } = decomposerTTC(ttc, tauxTva / 100);

    return {
      ligne,
      index,
      article,
      tauxTva,
      compteVente,
      unite: article?.unite ?? "piece",
      brut: brutParLigne[index],
      remise: (ligne.remise ?? 0) + piedParLigne[index],
      ttc,
      ht,
      tva,
    };
  });

  const totalBrut = brutParLigne.reduce((somme, brut) => somme + brut, 0);
  const totalRemise = calculees.reduce((somme, l) => somme + l.remise, 0);
  const totalHt = calculees.reduce((somme, l) => somme + l.ht, 0);
  const totalTva = calculees.reduce((somme, l) => somme + l.tva, 0);
  const totalTtc = calculees.reduce((somme, l) => somme + l.ttc, 0);

  const encaisse = vente.reglements.reduce((somme, r) => somme + r.montant, 0);
  if (encaisse !== totalTtc) {
    throw new Error(
      `Ticket ${numero} : les règlements totalisent ${encaisse} pour un ticket ` +
        `de ${totalTtc}. Une caisse ne se ferme pas sur un écart.`,
    );
  }

  const aCredit = vente.reglements.some((r) => r.moyen === "credit");
  if (aCredit && !vente.clientId) {
    throw new Error(
      "Une part à crédit exige un client identifié : sinon la créance n'est " +
        "rattachée à personne.",
    );
  }

  const encaisseeLe = vente.encaisseeLe ?? new Date();

  // ------------------------------------------------------------ le ticket
  await tx.insert(ventes).values({
    id: vente.id,
    organizationId,
    caisseId: poste.id,
    depotId: poste.depotId,
    numeroSeq: vente.numeroSeq,
    numero,
    clientId: vente.clientId ?? null,
    sessionCaisseId: session?.id ?? null,
    encaisseeLe,
    totalBrut,
    totalRemise,
    totalHt,
    totalTva,
    totalTtc,
    especesRecues: vente.especesRecues ?? 0,
    monnaieRendue: Math.max(0, (vente.especesRecues ?? 0) - montantEspeces(vente)),
    deviceId: vente.deviceId ?? null,
    userId,
  });

  // -------------------------------------------- les lignes, et le stock avec
  for (const calculee of calculees) {
    const { ligne, article } = calculee;

    // Le coût de revient se fige sur la ligne : sans lui, la marge réelle de
    // l'opération se perd dès que le prix d'achat bouge.
    const coutUnitaire =
      article && article.suiviStock
        ? ((await coutMoyenDans(tx, organizationId, poste.depotId, article.id)) ??
          article.prixAchat)
        : 0;

    await tx.insert(lignesVente).values({
      id: ligne.id,
      organizationId,
      venteId: vente.id,
      parentLineId: ligne.parentLineId ?? null,
      lineKind: ligne.lineKind ?? (article?.type === "service" ? "prestation" : "article"),
      articleId: ligne.articleId,
      designation: ligne.designation,
      quantite: ligne.quantite,
      unite: calculee.unite,
      prixUnitaire: ligne.prixUnitaire,
      remise: calculee.remise,
      tauxTva: calculee.tauxTva,
      montantHt: calculee.ht,
      montantTva: calculee.tva,
      compteVente: calculee.compteVente,
      coutUnitaire,
      workerId: ligne.workerId ?? null,
      coutMainOeuvre: ligne.coutMainOeuvre ?? 0,
      ordre: calculee.index,
    });

    // Une prestation ne sort pas de stock. Le montage d'une pièce consomme du
    // temps, pas de la marchandise.
    if (article?.suiviStock) {
      await enregistrerMouvementDans(
        tx,
        organizationId,
        {
          depotId: poste.depotId,
          articleId: article.id,
          type: "vente",
          quantite: -ligne.quantite,
          coutUnitaire,
          piece: numero,
          origineType: "vente",
          origineId: vente.id,
          effectueLe: encaisseeLe,
        },
        userId,
      );
    }
  }

  // --------------------------------------------------------- les règlements
  await tx.insert(reglementsVente).values(
    vente.reglements.map((reglement, index) => ({
      id: newId(),
      organizationId,
      venteId: vente.id,
      moyen: reglement.moyen,
      montant: reglement.montant,
      reference: reglement.reference ?? null,
      ordre: index,
    })),
  );

  // ------------------------------------------------------- la comptabilité
  const client = vente.clientId
    ? await ficheClient(tx, organizationId, vente.clientId)
    : null;

  const ecriture = ecritureVenteComptoir({
    numero,
    date: isoDe(encaisseeLe),
    client: client?.nom ?? "Client au comptoir",
    compteAuxiliaire: client?.compte ?? undefined,
    lignes: calculees
      .filter((l) => l.ttc > 0)
      .map<LigneComptoir>((l) => ({
        montantTTC: l.ttc,
        tauxTvaBp: l.tauxTva,
        compte: l.compteVente,
        libelleCompte:
          l.compteVente === "706" ? "Services vendus" : "Ventes de marchandises",
      })),
    reglements: vente.reglements.map((r) => ({
      moyen: r.moyen as MoyenComptoir,
      montant: r.montant,
    })),
  });

  const numeroEcriture = await enregistrerEcritureDans(tx, ecriture, {
    organizationId,
    userId,
    origine: "vente_pos",
    pieceId: vente.id,
    exercice: String(encaisseeLe.getFullYear()),
    dateIso: isoDe(encaisseeLe),
  });

  // Le miroir du compteur avance, sans jamais reculer : un ticket arrivé en
  // retard après une resynchronisation ne doit pas rajeunir le poste.
  await tx
    .update(postesCaisse)
    .set({
      dernierNumero: sql`greatest(${postesCaisse.dernierNumero}, ${vente.numeroSeq})`,
      updatedAt: new Date(),
      version: sql`${postesCaisse.version} + 1`,
    })
    .where(eq(postesCaisse.id, poste.id));

  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "vente.encaisser",
    entityType: "vente",
    entityId: vente.id,
    after: { numero, totalTtc, lignes: vente.lignes.length, ecriture: numeroEcriture },
  });

  return { id: vente.id, numero, totalTtc, deja: false, ecriture: numeroEcriture };
}

// ------------------------------------------------------------------ postes

export interface NouveauPoste {
  code: string;
  nom: string;
  prefixe?: string;
  depotId: string;
  deviceId?: string | null;
  /** `serveur` pour l'encaissement en salle : aucun appareil ne s'y rattache. */
  numerotation?: "appareil" | "serveur";
}

export async function creerPosteCaisseDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauPoste,
  userId?: string,
): Promise<{ id: string; code: string }> {
  const id = newId();

  await tx.insert(postesCaisse).values({
    id,
    organizationId,
    code: donnees.code.trim(),
    nom: donnees.nom.trim(),
    prefixe: (donnees.prefixe ?? `${donnees.code.trim()}-`).toUpperCase(),
    depotId: donnees.depotId,
    numerotation: donnees.numerotation ?? "appareil",
    deviceId: donnees.numerotation === "serveur" ? null : (donnees.deviceId ?? null),
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "caisse.ouvrir",
      entityType: "poste_caisse",
      entityId: id,
      after: { code: donnees.code, nom: donnees.nom },
    });
  }

  return { id, code: donnees.code };
}

// ------------------------------------------------------------------ outils

export interface ArticleVendable {
  id: string;
  designation: string;
  type: "marchandise" | "service";
  unite: CodeUnite;
  suiviStock: boolean;
  prixAchat: number;
  tauxTva: number;
  compteVente: string;
}

/**
 * Taux et comptes des articles vendus, résolus depuis leur famille.
 *
 * Une seule requête pour tout le ticket, et seulement pour ses articles : la
 * caisse n'a pas à charger trois cents références pour en vendre quatre.
 */
export async function referentielArticles(
  tx: Transaction,
  organizationId: string,
  ids: string[],
): Promise<Map<string, ArticleVendable>> {
  if (ids.length === 0) return new Map();

  const lignes = await tx
    .select({
      article: articles,
      familleTaux: famillesArticle.tauxTva,
      familleCompte: famillesArticle.compteVente,
    })
    .from(articles)
    .leftJoin(famillesArticle, eq(articles.familleId, famillesArticle.id))
    .where(
      and(eq(articles.organizationId, organizationId), inArray(articles.id, ids)),
    );

  return new Map(
    lignes.map((ligne) => [
      ligne.article.id,
      {
        id: ligne.article.id,
        designation: ligne.article.designation,
        type: ligne.article.type,
        unite: ligne.article.unite,
        suiviStock: ligne.article.suiviStock,
        prixAchat: ligne.article.prixAchat,
        tauxTva: ligne.article.tauxTva ?? ligne.familleTaux ?? DEFAUTS.tauxTva,
        compteVente:
          ligne.article.compteVente ?? ligne.familleCompte ?? DEFAUTS.compteVente,
      },
    ]),
  );
}

/** Nom et compte auxiliaire du client, en une seule requête. */
async function ficheClient(
  tx: Transaction,
  organizationId: string,
  clientId: string,
): Promise<{ nom: string; compte: string | null } | null> {
  const [client] = await tx
    .select({ nom: tiers.nom, compte: tiers.compteClient })
    .from(tiers)
    .where(and(eq(tiers.id, clientId), eq(tiers.organizationId, organizationId)));

  return client ?? null;
}

/** Part réglée en espèces : c'est la seule sur laquelle on rend la monnaie. */
function montantEspeces(vente: VenteAEnregistrer): number {
  return vente.reglements
    .filter((reglement) => reglement.moyen === "especes")
    .reduce((somme, reglement) => somme + reglement.montant, 0);
}

function isoDe(date: Date): string {
  return date.toISOString().slice(0, 10);
}
