import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";

import { lireLignes, totalCommande, type LigneCommandeInterne } from "./commandes-internes";
import { bonsCommandeInterne } from "./schema";

/**
 * Bon de commande interne : demande, décision, annulation. Chaque geste dans
 * la transaction de l'appelant ; le numéro `BCI-AAAA-NNNNN` est attribué
 * dans celle qui crée le bon.
 */

export interface NouvelleCommandeInterne {
  objet: string;
  service?: string | null;
  lieuLivraison?: string | null;
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
): Promise<{ id: string; numero: string; total: number }> {
  // Revérifiées ici : une ligne qui n'aurait pas été relue ne doit pas fausser le total.
  const lignes = lireLignes(c.lignes);
  if (typeof lignes === "string") throw new Error(lignes);
  const total = totalCommande(lignes);
  const a = annee();
  const numero = await prochainNumero(tx, organizationId, { cle: "commande_interne", prefix: `BCI-${a}-`, padding: 5, periode: a });
  const id = newId();
  await tx.insert(bonsCommandeInterne).values({
    id,
    organizationId,
    numero,
    objet: c.objet.trim(),
    service: c.service?.trim() || null,
    lieuLivraison: c.lieuLivraison?.trim() || null,
    notes: c.notes?.trim() || null,
    lignes,
    total,
    demandeParUserId: userId,
  });
  await journaliser(tx, organizationId, userId, "commande_interne.demander", id, { numero, total, lignes: lignes.length });
  return { id, numero, total };
}

async function commandeVerrouillee(tx: Transaction, organizationId: string, id: string) {
  const [c] = await tx
    .select()
    .from(bonsCommandeInterne)
    .where(and(eq(bonsCommandeInterne.id, id), eq(bonsCommandeInterne.organizationId, organizationId)))
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
