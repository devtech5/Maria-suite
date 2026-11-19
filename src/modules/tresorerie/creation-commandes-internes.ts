import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";

import { estNomComplet, MESSAGE_NOM_COMPLET } from "./beneficiaire";
import { resoudreBeneficiaire, type FicheBeneficiaire } from "./creation";
import { lireLignes, totalCommande, type LigneCommandeInterne } from "./commandes-internes";
import { bonsCommandeInterne } from "./schema";

/**
 * Bon de commande interne : demande, modification, décision, annulation,
 * suppression. Chaque geste dans
 * la transaction de l'appelant ; le numéro `BCI-AAAA-NNNNN` est attribué
 * dans celle qui crée le bon.
 */

export interface NouvelleCommandeInterne {
  objet: string;
  service?: string | null;
  /** Collaborateur du Personnel ou compte de l'entreprise. Absent : le nom saisi. */
  fiche?: Extract<FicheBeneficiaire, { employeId: string } | { userId: string }> | null;
  /** Nom et prénom saisis, quand le bénéficiaire n'a pas de fiche. */
  beneficiaire?: string | null;
  notes?: string | null;
  lignes: LigneCommandeInterne[];
}

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "commande_interne", entityId: entiteId, after: apres });
}

/** Le jour civil d'Abidjan, qui vit à UTC toute l'année. */
const annee = () => new Date().toISOString().slice(0, 4);

export async function demanderCommandeInterneDans(
  tx: Transaction,
  organizationId: string,
  c: NouvelleCommandeInterne,
  userId: string,
): Promise<{ id: string; numero: string; total: number; beneficiaire: string }> {
  // Revérifiées ici : une ligne qui n'aurait pas été relue ne doit pas fausser le total.
  const lignes = lireLignes(c.lignes);
  if (typeof lignes === "string") throw new Error(lignes);
  const total = totalCommande(lignes);
  if (!c.fiche && !estNomComplet(c.beneficiaire)) throw new Error(MESSAGE_NOM_COMPLET);
  const qui = await resoudreBeneficiaire(tx, organizationId, c.fiche, c.beneficiaire);
  const a = annee();
  const numero = await prochainNumero(tx, organizationId, { cle: "commande_interne", prefix: `BCI-${a}-`, padding: 5, periode: a });
  const id = newId();
  await tx.insert(bonsCommandeInterne).values({
    id,
    organizationId,
    numero,
    objet: c.objet.trim(),
    service: c.service?.trim() || null,
    beneficiaire: qui.nom,
    beneficiaireEmployeId: qui.employeId,
    beneficiaireUserId: qui.userId,
    notes: c.notes?.trim() || null,
    lignes,
    total,
    demandeParUserId: userId,
  });
  await journaliser(tx, organizationId, userId, "commande_interne.demander", id, { numero, total, lignes: lignes.length, beneficiaire: qui.nom });
  return { id, numero, total, beneficiaire: qui.nom };
}

export interface CommandeModifiee {
  numero: string;
  total: number;
  beneficiaire: string;
  /** Vrai quand le bon était approuvé : la modification le renvoie à l'approbation. */
  approbationRetiree: boolean;
}

/**
 * Modification d'un bon encore vivant, sous le même numéro. Mêmes acteurs que
 * l'annulation : le demandeur, ou qui approuve. Un bon approuvé qui change
 * n'est plus celui qu'on a approuvé : il repart « à approuver ».
 */
export async function modifierCommandeInterneDans(
  tx: Transaction,
  organizationId: string,
  id: string,
  c: NouvelleCommandeInterne,
  acteur: { userId: string; approuve: boolean },
): Promise<CommandeModifiee> {
  const lignes = lireLignes(c.lignes);
  if (typeof lignes === "string") throw new Error(lignes);
  const total = totalCommande(lignes);
  if (!c.fiche && !estNomComplet(c.beneficiaire)) throw new Error(MESSAGE_NOM_COMPLET);
  const b = await commandeVerrouillee(tx, organizationId, id);
  if (b.statut !== "demande" && b.statut !== "approuve") throw new Error(`${b.numero} ne se modifie plus.`);
  if (b.demandeParUserId !== acteur.userId && !acteur.approuve) throw new Error("Seul le demandeur, ou qui approuve, peut modifier ce bon.");
  const qui = await resoudreBeneficiaire(tx, organizationId, c.fiche, c.beneficiaire);
  const approbationRetiree = b.statut === "approuve";
  const apres = {
    objet: c.objet.trim(),
    service: c.service?.trim() || null,
    beneficiaire: qui.nom,
    beneficiaireEmployeId: qui.employeId,
    beneficiaireUserId: qui.userId,
    notes: c.notes?.trim() || null,
    lignes,
    total,
  };
  await tx
    .update(bonsCommandeInterne)
    .set({
      ...apres,
      statut: "demande",
      approuveParUserId: null,
      approuveLe: null,
      updatedAt: new Date(),
      version: sql`${bonsCommandeInterne.version} + 1`,
    })
    .where(eq(bonsCommandeInterne.id, b.id));
  await journaliser(tx, organizationId, acteur.userId, "commande_interne.modifier", b.id, {
    numero: b.numero,
    avant: { objet: b.objet, service: b.service, beneficiaire: b.beneficiaire, notes: b.notes, lignes: b.lignes, total: b.total, statut: b.statut },
    apres: { ...apres, statut: "demande" },
  });
  return { numero: b.numero, total, beneficiaire: qui.nom, approbationRetiree };
}

async function commandeVerrouillee(tx: Transaction, organizationId: string, id: string) {
  const [c] = await tx
    .select()
    .from(bonsCommandeInterne)
    .where(and(eq(bonsCommandeInterne.id, id), eq(bonsCommandeInterne.organizationId, organizationId), isNull(bonsCommandeInterne.deletedAt)))
    .for("update");
  if (!c) throw new Error("Bon de commande interne introuvable.");
  return c;
}

/**
 * Décision sur un bon. On n'approuve pas sa propre demande — sauf le
 * propriétaire, qui n'a personne au-dessus de lui.
 */
export async function deciderCommandeInterneDans(
  tx: Transaction,
  organizationId: string,
  id: string,
  decision: { approuve: true } | { approuve: false; motif: string },
  acteur: { userId: string; estProprietaire: boolean },
): Promise<{ numero: string; demandeParUserId: string }> {
  const c = await commandeVerrouillee(tx, organizationId, id);
  if (c.statut !== "demande") throw new Error(`${c.numero} a déjà reçu une décision.`);
  if (c.demandeParUserId === acteur.userId && !acteur.estProprietaire) {
    throw new Error("Vous ne pouvez pas décider de votre propre demande : un autre doit l'approuver.");
  }
  await tx
    .update(bonsCommandeInterne)
    .set({
      statut: decision.approuve ? "approuve" : "rejete",
      approuveParUserId: acteur.userId,
      approuveLe: new Date(),
      motifRejet: decision.approuve ? null : decision.motif,
      updatedAt: new Date(),
      version: sql`${bonsCommandeInterne.version} + 1`,
    })
    .where(eq(bonsCommandeInterne.id, c.id));
  await journaliser(tx, organizationId, acteur.userId, decision.approuve ? "commande_interne.approuver" : "commande_interne.rejeter", c.id, {
    numero: c.numero,
    total: c.total,
    ...(decision.approuve ? {} : { motif: decision.motif }),
  });
  return { numero: c.numero, demandeParUserId: c.demandeParUserId };
}

/** Le demandeur, ou qui approuve, annule un bon en attente ou approuvé. */
export async function annulerCommandeInterneDans(
  tx: Transaction,
  organizationId: string,
  id: string,
  acteur: { userId: string; approuve: boolean },
): Promise<{ numero: string }> {
  const c = await commandeVerrouillee(tx, organizationId, id);
  if (c.statut !== "demande" && c.statut !== "approuve") throw new Error(`${c.numero} ne s'annule plus.`);
  if (c.demandeParUserId !== acteur.userId && !acteur.approuve) throw new Error("Seul le demandeur, ou qui approuve, peut annuler ce bon.");
  await tx
    .update(bonsCommandeInterne)
    .set({ statut: "annule", updatedAt: new Date(), version: sql`${bonsCommandeInterne.version} + 1` })
    .where(eq(bonsCommandeInterne.id, c.id));
  await journaliser(tx, organizationId, acteur.userId, "commande_interne.annuler", c.id, { numero: c.numero });
  return { numero: c.numero };
}

/**
 * Suppression logique : le bon quitte la liste et l'impression, la ligne
 * reste en base et son numéro n'est jamais réattribué. Un bon approuvé engage
 * l'entreprise : on l'annule d'abord. Mêmes acteurs que l'annulation.
 */
export async function supprimerCommandeInterneDans(
  tx: Transaction,
  organizationId: string,
  id: string,
  acteur: { userId: string; approuve: boolean },
): Promise<{ numero: string }> {
  const c = await commandeVerrouillee(tx, organizationId, id);
  if (c.statut === "approuve") throw new Error(`${c.numero} est approuvé : annulez-le avant de le supprimer.`);
  if (c.demandeParUserId !== acteur.userId && !acteur.approuve) throw new Error("Seul le demandeur, ou qui approuve, peut supprimer ce bon.");
  await tx
    .update(bonsCommandeInterne)
    .set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${bonsCommandeInterne.version} + 1` })
    .where(eq(bonsCommandeInterne.id, c.id));
  await journaliser(tx, organizationId, acteur.userId, "commande_interne.supprimer", c.id, { numero: c.numero, statut: c.statut, objet: c.objet, total: c.total });
  return { numero: c.numero };
}
