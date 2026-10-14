import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, memberships } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { enregistrerBrouillonDans } from "@/modules/facturation/creation";
import { piecesCommerciales } from "@/modules/facturation/schema";
import { creerProjetDans } from "@/modules/projets/creation";
import { projets } from "@/modules/projets/schema";
import { tiers } from "@/modules/tiers/schema";

import { avenants, conventions, soumissions } from "./schema";

/**
 * Suites d'un marché : le marché gagné ou la convention signée ouvre le
 * projet, ou prépare le devis, en reprenant client, objet et montant. Rien ne
 * se ressaisit.
 *
 * Le montant repris est traité HORS TAXES : prix de vente du projet, prix
 * unitaire de l'unique ligne du devis (TVA au taux normal). Le devis naît
 * brouillon : il se relit, se détaille et s'émet depuis la facturation.
 */

export type OrigineMarche = { nature: "soumission"; id: string } | { nature: "convention"; id: string };

/** Ce que le marché apporte à sa suite, une fois relu et vérifié. */
interface Source {
  numero: string;
  intitule: string;
  description: string;
  clientId: string | null;
  montant: number | null;
  debut: string | null;
  fin: string | null;
  responsableUserId: string | null;
  projetId: string | null;
  devisId: string | null;
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, origine: OrigineMarche, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: origine.nature, entityId: origine.id, after: apres });
}

async function membreActif(tx: Transaction, organizationId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [m] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId), eq(memberships.status, "actif")));
  return m ? userId : null;
}

/** Relit le marché sous verrou : deux clics ne créent pas deux projets. */
async function sourceDe(tx: Transaction, organizationId: string, origine: OrigineMarche): Promise<Source> {
  if (origine.nature === "soumission") {
    const [s] = await tx
      .select()
      .from(soumissions)
      .where(and(eq(soumissions.id, origine.id), eq(soumissions.organizationId, organizationId), isNull(soumissions.deletedAt)))
      .for("update");
    if (!s) throw new Error("Soumission introuvable.");
    if (s.statut !== "gagnee") throw new Error(`${s.numero} n'est pas gagnée : rien à exécuter encore.`);
    const precisions = [s.reference && `Réf. ${s.reference}`, s.lots && `Lots : ${s.lots}`, `Autorité contractante : ${s.autorite}`].filter(Boolean);
    return {
      numero: s.numero,
      intitule: s.intitule,
      description: `Marché ${s.numero} gagné. ${precisions.join(" · ")}`,
      clientId: s.clientId,
      montant: s.montantPropose,
      debut: null,
      fin: null,
      responsableUserId: await membreActif(tx, organizationId, s.responsableId),
      projetId: s.projetId,
      devisId: s.devisId,
    };
  }

  const [c] = await tx
    .select()
    .from(conventions)
    .where(and(eq(conventions.id, origine.id), eq(conventions.organizationId, organizationId), isNull(conventions.deletedAt)))
    .for("update");
  if (!c) throw new Error("Convention introuvable.");
  if (c.resilieeLe) throw new Error(`${c.numero} est résiliée : elle n'ouvre plus rien.`);
  if (c.sens === "fournisseur") throw new Error(`${c.numero} lie l'entreprise à un fournisseur : elle n'a ni projet client ni devis à émettre.`);
  // Les avenants priment : dernière fin, dernier montant.
  const siens = await tx.select().from(avenants).where(eq(avenants.conventionId, c.id)).orderBy(avenants.rang);
  const fin = [...siens].reverse().find((a) => a.nouvelleFin !== null)?.nouvelleFin ?? c.fin;
  const montant = [...siens].reverse().find((a) => a.nouveauMontant !== null)?.nouveauMontant ?? c.montant;
  return {
    numero: c.numero,
    intitule: c.intitule,
    description: [`Convention ${c.numero} avec ${c.partenaire}.`, c.objet].filter(Boolean).join(" "),
    clientId: c.tiersId,
    montant,
    debut: c.debut,
    fin,
    responsableUserId: await membreActif(tx, organizationId, c.userId),
    projetId: c.projetId,
    devisId: c.devisId,
  };
}

async function lier(tx: Transaction, origine: OrigineMarche, lien: { projetId: string } | { devisId: string }) {
  if (origine.nature === "soumission") {
    await tx.update(soumissions).set({ ...lien, updatedAt: new Date(), version: sql`${soumissions.version} + 1` }).where(eq(soumissions.id, origine.id));
  } else {
    await tx.update(conventions).set({ ...lien, updatedAt: new Date(), version: sql`${conventions.version} + 1` }).where(eq(conventions.id, origine.id));
  }
}

/** Ouvre le projet du marché : nom, client, prix de vente et période viennent du marché. */
export async function creerProjetDepuisMarcheDans(
  tx: Transaction,
  organizationId: string,
  origine: OrigineMarche,
  userId: string,
): Promise<{ id: string; code: string }> {
  const s = await sourceDe(tx, organizationId, origine);
  if (s.projetId) {
    const [deja] = await tx.select({ code: projets.code }).from(projets).where(eq(projets.id, s.projetId));
    throw new Error(`${s.numero} a déjà son projet${deja ? ` : ${deja.code}` : ""}.`);
  }
  const projet = await creerProjetDans(
    tx,
    organizationId,
    {
      nom: s.intitule,
      description: s.description,
      clientId: s.clientId,
      responsableUserId: s.responsableUserId,
      prixVente: s.montant,
      debut: s.debut,
      fin: s.fin,
    },
    userId,
  );
  await lier(tx, origine, { projetId: projet.id });
  // Le devis déjà préparé rejoint le projet : ses ventes y seront comptées.
  if (s.devisId) {
    await tx
      .update(piecesCommerciales)
      .set({ projetId: projet.id, updatedAt: new Date(), version: sql`${piecesCommerciales.version} + 1` })
      .where(and(eq(piecesCommerciales.id, s.devisId), eq(piecesCommerciales.statut, "brouillon")));
  }
  await journaliser(tx, organizationId, userId, `${origine.nature}.projet`, origine, { numero: s.numero, projet: projet.code });
  return projet;
}

/** Prépare le devis du marché, en brouillon : le client et le montant viennent du marché. */
export async function preparerDevisDepuisMarcheDans(
  tx: Transaction,
  organizationId: string,
  origine: OrigineMarche,
  userId: string,
): Promise<{ id: string }> {
  const s = await sourceDe(tx, organizationId, origine);
  if (s.devisId) throw new Error(`${s.numero} a déjà son devis : retrouvez-le dans la facturation.`);
  if (!s.clientId) throw new Error(`Rattachez d'abord ${origine.nature === "soumission" ? "l'acheteur" : "le partenaire"} de ${s.numero} à une fiche client.`);
  const [client] = await tx
    .select({ id: tiers.id })
    .from(tiers)
    .where(and(eq(tiers.id, s.clientId), eq(tiers.organizationId, organizationId), eq(tiers.estClient, true)));
  if (!client) throw new Error(`La fiche rattachée à ${s.numero} n'est pas un client.`);
  if (!s.montant) throw new Error(`Indiquez le montant de ${s.numero} avant de préparer le devis.`);

  const devis = await enregistrerBrouillonDans(
    tx,
    organizationId,
    {
      nature: "devis",
      clientId: client.id,
      projetId: s.projetId,
      datePiece: aujourdhui(),
      notes: s.description,
      lignes: [{ articleId: null, designation: s.intitule, quantite: 1000, prixUnitaireHt: s.montant }],
    },
    userId,
  );
  await lier(tx, origine, { devisId: devis.id });
  await journaliser(tx, organizationId, userId, `${origine.nature}.devis`, origine, { numero: s.numero, devis: devis.id });
  return devis;
}

export async function creerProjetDepuisMarchePour(organizationId: string, origine: OrigineMarche, userId: string) {
  return db.transaction((tx) => creerProjetDepuisMarcheDans(tx, organizationId, origine, userId));
}

export async function preparerDevisDepuisMarchePour(organizationId: string, origine: OrigineMarche, userId: string) {
  return db.transaction((tx) => preparerDevisDepuisMarcheDans(tx, organizationId, origine, userId));
}

/** Le projet et le devis issus d'un marché, pour les afficher en lien. */
export async function suitesDe(
  organizationId: string,
  liens: { projetId: string | null; devisId: string | null },
): Promise<{ projet: { id: string; code: string; nom: string } | null; devis: { id: string; numero: string | null; statut: string } | null }> {
  const [projet] = liens.projetId
    ? await db
        .select({ id: projets.id, code: projets.code, nom: projets.nom })
        .from(projets)
        .where(and(eq(projets.id, liens.projetId), eq(projets.organizationId, organizationId)))
    : [];
  const [devis] = liens.devisId
    ? await db
        .select({ id: piecesCommerciales.id, numero: piecesCommerciales.numero, statut: piecesCommerciales.statut })
        .from(piecesCommerciales)
        .where(and(eq(piecesCommerciales.id, liens.devisId), eq(piecesCommerciales.organizationId, organizationId)))
    : [];
  return { projet: projet ?? null, devis: devis ?? null };
}
