import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { montantLigne, ECHELLE_QUANTITE } from "@/lib/quantite";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { facturesFournisseur, lignesFactureFournisseur } from "@/modules/achats/schema";
import { creerArticleDans } from "@/modules/catalogue/creation";
import { articles } from "@/modules/catalogue/schema";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { lignesPiece, piecesCommerciales } from "@/modules/facturation/schema";
import { enregistrerMouvementDans } from "@/modules/stock/creation";
import { depots } from "@/modules/stock/schema";
import { creerTiersDans } from "@/modules/tiers/creation";
import { tiers } from "@/modules/tiers/schema";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import {
  COMPTE_REPRISE,
  ecritureRepriseClient,
  ecritureRepriseFournisseur,
  ecritureRepriseStock,
  ecritureRepriseTresorerie,
  type ArticleImporte,
  type StockImporte,
  type TiersImporte,
} from "./calcul";

/**
 * Reprise de l'existant, en base. Chaque import est UNE transaction : un
 * fichier passe en entier ou pas du tout. Un import à moitié fait laisse des
 * soldes à moitié repris, et personne ne sait plus lesquels.
 */

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "reprise", entityId: organizationId, after: apres });
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

// ---------------------------------------------------------------- articles

export async function importerArticlesDans(tx: Transaction, organizationId: string, liste: ArticleImporte[], userId: string): Promise<{ crees: number; ignores: string[] }> {
  const existantes = new Set(
    (await tx.select({ reference: articles.reference }).from(articles).where(eq(articles.organizationId, organizationId))).map((a) => a.reference.toLowerCase()),
  );
  let crees = 0;
  const ignores: string[] = [];
  for (const a of liste) {
    if (a.reference && existantes.has(a.reference.toLowerCase())) {
      ignores.push(a.reference);
      continue;
    }
    await creerArticleDans(tx, organizationId, {
      designation: a.designation,
      reference: a.reference,
      type: a.type,
      unite: a.unite,
      prixVente: a.prixVente,
      prixAchat: a.prixAchat,
      tauxTva: a.tauxTva,
      seuilAlerte: a.seuilAlerte,
    });
    crees++;
  }
  await journaliser(tx, organizationId, userId, "reprise.articles", { crees, ignores: ignores.length });
  return { crees, ignores };
}

// ------------------------------------------------------------------- tiers

/**
 * Crée les tiers absents (même nom, sans tenir compte de la casse : la fiche
 * existante sert) et reprend leurs soldes. Une créance devient une facture de
 * reprise, une dette une facture fournisseur de reprise : elles se règlent,
 * se relancent et se lettrent comme les autres, et entrent au plan de
 * trésorerie à leur échéance.
 */
export async function importerTiersDans(
  tx: Transaction,
  organizationId: string,
  liste: TiersImporte[],
  dateReprise: string,
  userId: string,
): Promise<{ crees: number; creances: number; montantCreances: number; dettes: number; montantDettes: number }> {
  const existants = await tx
    .select({ id: tiers.id, nom: tiers.nom, compteClient: tiers.compteClient, compteFournisseur: tiers.compteFournisseur })
    .from(tiers)
    .where(and(eq(tiers.organizationId, organizationId), isNull(tiers.deletedAt)));
  const parNom = new Map(existants.map((t) => [t.nom.trim().toLowerCase(), t]));

  const bilan = { crees: 0, creances: 0, montantCreances: 0, dettes: 0, montantDettes: 0 };
  for (const t of liste) {
    let fiche = parNom.get(t.nom.trim().toLowerCase());
    if (!fiche || (t.estClient && !fiche.compteClient) || (t.estFournisseur && !fiche.compteFournisseur)) {
      const { id } = await creerTiersDans(
        tx,
        organizationId,
        { nom: t.nom, nature: t.nature, estClient: t.estClient, estFournisseur: t.estFournisseur, telephone: t.telephone, email: t.email, ville: t.ville, identifiantFiscal: t.identifiantFiscal },
        userId,
      );
      const [cree] = await tx.select({ id: tiers.id, nom: tiers.nom, compteClient: tiers.compteClient, compteFournisseur: tiers.compteFournisseur }).from(tiers).where(eq(tiers.id, id));
      fiche = cree;
      parNom.set(t.nom.trim().toLowerCase(), cree);
      bilan.crees++;
    }
    if (t.solde <= 0) continue;
    const echeance = maxDate(t.echeance ?? dateReprise, dateReprise);
    if (t.estClient) {
      await reprendreCreanceDans(tx, organizationId, { clientId: fiche.id, clientNom: fiche.nom, auxiliaire: fiche.compteClient!, montant: t.solde, date: dateReprise, echeance, reference: t.referenceSolde }, userId);
      bilan.creances++;
      bilan.montantCreances += t.solde;
    } else {
      await reprendreDetteDans(tx, organizationId, { fournisseurId: fiche.id, fournisseurNom: fiche.nom, auxiliaire: fiche.compteFournisseur!, montant: t.solde, date: dateReprise, echeance, reference: t.referenceSolde }, userId);
      bilan.dettes++;
      bilan.montantDettes += t.solde;
    }
  }
  await journaliser(tx, organizationId, userId, "reprise.tiers", { ...bilan, dateReprise });
  return bilan;
}

async function reprendreCreanceDans(
  tx: Transaction,
  organizationId: string,
  c: { clientId: string; clientNom: string; auxiliaire: string; montant: number; date: string; echeance: string; reference: string | null },
  userId: string,
) {
  const annee = c.date.slice(0, 4);
  // Même compteur que les factures : la suite reste sans trou.
  const numero = await prochainNumero(tx, organizationId, { cle: "piece:facture", prefix: `FAC-${annee}-`, padding: 5, periode: annee });
  const id = newId();
  const ecriture = await enregistrerEcritureDans(tx, ecritureRepriseClient({ piece: numero, date: c.date, client: c.clientNom, auxiliaire: c.auxiliaire, montant: c.montant }), {
    organizationId,
    userId,
    origine: "reprise",
    pieceId: id,
    exercice: annee,
    dateIso: c.date,
  });
  await tx.insert(piecesCommerciales).values({
    id,
    organizationId,
    nature: "facture",
    numero,
    statut: "emise",
    clientId: c.clientId,
    clientNom: c.clientNom,
    datePiece: c.date,
    echeance: c.echeance,
    totalHt: c.montant,
    totalTva: 0,
    totalTtc: c.montant,
    ecritureNumero: ecriture,
    notes: `Reprise du solde antérieur${c.reference ? ` (réf. ${c.reference})` : ""}.`,
    emiseLe: new Date(),
    userId,
  });
  await tx.insert(lignesPiece).values({
    id: newId(),
    organizationId,
    pieceId: id,
    ordre: 0,
    articleId: null,
    designation: `Solde antérieur au ${c.date.split("-").reverse().join("/")}${c.reference ? ` — ${c.reference}` : ""}`,
    quantite: ECHELLE_QUANTITE,
    prixUnitaireHt: c.montant,
    montantHt: c.montant,
    tauxTva: 0,
    compteVente: COMPTE_REPRISE.numero,
  });
}

async function reprendreDetteDans(
  tx: Transaction,
  organizationId: string,
  d: { fournisseurId: string; fournisseurNom: string; auxiliaire: string; montant: number; date: string; echeance: string; reference: string | null },
  userId: string,
) {
  const annee = d.date.slice(0, 4);
  const numero = await prochainNumero(tx, organizationId, { cle: "facture_fournisseur", prefix: `FF-${annee}-`, padding: 5, periode: annee });
  const id = newId();
  const ecriture = await enregistrerEcritureDans(tx, ecritureRepriseFournisseur({ piece: numero, date: d.date, fournisseur: d.fournisseurNom, auxiliaire: d.auxiliaire, montant: d.montant }), {
    organizationId,
    userId,
    origine: "reprise",
    pieceId: id,
    exercice: annee,
    dateIso: d.date,
  });
  await tx.insert(facturesFournisseur).values({
    id,
    organizationId,
    numero,
    referenceFournisseur: d.reference || `REPRISE-${numero}`,
    fournisseurId: d.fournisseurId,
    fournisseurNom: d.fournisseurNom,
    dateFacture: d.date,
    echeance: d.echeance,
    totalHt: d.montant,
    totalTva: 0,
    totalTtc: d.montant,
    ecriture,
    notes: "Dette antérieure reprise à l'ouverture.",
    userId,
  });
  await tx.insert(lignesFactureFournisseur).values({
    id: newId(),
    organizationId,
    factureId: id,
    designation: `Dette antérieure au ${d.date.split("-").reverse().join("/")}`,
    quantite: ECHELLE_QUANTITE,
    prixUnitaireHt: d.montant,
    tauxTva: 0,
    compteAchat: COMPTE_REPRISE.numero,
  });
}

// ------------------------------------------------------------------- stock

/**
 * Stock initial : un mouvement d'ajustement par ligne, au coût indiqué (ou au
 * prix d'achat de la fiche), puis UNE écriture pour la valeur totale.
 */
export async function importerStockDans(
  tx: Transaction,
  organizationId: string,
  liste: StockImporte[],
  dateReprise: string,
  userId: string,
): Promise<{ lignes: number; valeur: number; ecriture: string | null }> {
  const refs = await tx
    .select({ id: articles.id, reference: articles.reference, suiviStock: articles.suiviStock, prixAchat: articles.prixAchat })
    .from(articles)
    .where(and(eq(articles.organizationId, organizationId), isNull(articles.deletedAt)));
  const parRef = new Map(refs.map((a) => [a.reference.toLowerCase(), a]));
  const lesDepots = await tx
    .select({ id: depots.id, code: depots.code, nom: depots.nom })
    .from(depots)
    .where(and(eq(depots.organizationId, organizationId), eq(depots.actif, true), isNull(depots.deletedAt)))
    .orderBy(desc(depots.parDefaut), asc(depots.createdAt));
  if (lesDepots.length === 0) throw new Error("Créez d'abord un dépôt (Stock → Dépôts) pour y recevoir le stock initial.");

  const groupeId = newId();
  const piece = `STK-OUV-${dateReprise}`;
  let valeur = 0;
  for (const s of liste) {
    const article = parRef.get(s.reference.toLowerCase());
    if (!article) throw new Error(`Article inconnu : ${s.reference}. Importez d'abord les articles.`);
    if (!article.suiviStock) throw new Error(`${s.reference} est un service : il n'a pas de stock.`);
    const depot = s.depot ? lesDepots.find((d) => [d.code, d.nom].some((x) => x.toLowerCase() === s.depot!.toLowerCase())) : lesDepots[0];
    if (!depot) throw new Error(`Dépôt inconnu : ${s.depot}.`);
    const cout = s.coutUnitaire ?? article.prixAchat;
    await enregistrerMouvementDans(
      tx,
      organizationId,
      { depotId: depot.id, articleId: article.id, type: "ajustement", quantite: s.quantite, coutUnitaire: cout, piece, groupeId, motif: "Stock initial repris à l'ouverture", effectueLe: new Date(`${dateReprise}T08:00:00Z`) },
      userId,
    );
    valeur += montantLigne(cout, s.quantite);
  }
  const e = ecritureRepriseStock({ piece, date: dateReprise, valeur });
  const ecriture = e
    ? await enregistrerEcritureDans(tx, e, { organizationId, userId, origine: "reprise", pieceId: groupeId, exercice: dateReprise.slice(0, 4), dateIso: dateReprise })
    : null;
  await journaliser(tx, organizationId, userId, "reprise.stock", { lignes: liste.length, valeur, ecriture, dateReprise });
  return { lignes: liste.length, valeur, ecriture };
}

// -------------------------------------------------------------- trésorerie

/** Solde d'ouverture d'un compte de trésorerie. Une seule fois par compte. */
export async function reprendreTresorerieDans(
  tx: Transaction,
  organizationId: string,
  r: { compteTresorerieId: string; solde: number; date: string },
  userId: string,
): Promise<{ compte: string; ecriture: string }> {
  const [c] = await tx
    .select()
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.id, r.compteTresorerieId), eq(comptesTresorerie.organizationId, organizationId), isNull(comptesTresorerie.deletedAt)));
  if (!c) throw new Error("Compte de trésorerie introuvable.");
  if (r.solde < 0 && c.nature !== "banque") throw new Error("Une caisse ou un compte mobile money ne s'ouvre pas en négatif.");
  const piece = `OUV-${c.compte}`;
  const [deja] = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from ecritures where organization_id = ${organizationId} and origine = 'reprise' and piece_numero = ${piece}`,
  );
  if (Number(deja?.n) > 0) throw new Error(`Le solde d'ouverture de « ${c.nom} » est déjà repris.`);
  const e = ecritureRepriseTresorerie({ piece, date: r.date, compte: c.compte, libelle: c.nom, solde: r.solde });
  if (!e) throw new Error("Un solde nul n'a rien à reprendre.");
  const ecriture = await enregistrerEcritureDans(tx, e, { organizationId, userId, origine: "reprise", pieceId: c.id, exercice: r.date.slice(0, 4), dateIso: r.date });
  await journaliser(tx, organizationId, userId, "reprise.tresorerie", { compte: c.nom, solde: r.solde, ecriture });
  return { compte: c.nom, ecriture };
}
