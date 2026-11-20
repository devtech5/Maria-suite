import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";

import { creerArticleDans } from "./creation";
import { articles, famillesArticle, modelesArticle, type AxeVariante } from "./schema";
import {
  cleCombinaison,
  combinaisons,
  designationVariante,
  fusionnerAxes,
  nettoyerAxes,
  referenceVariante,
  refusAxes,
} from "./variantes";
import type { CodeUnite } from "@/lib/quantite";

export interface NouveauModele {
  reference?: string | null;
  designation: string;
  familleId?: string | null;
  unite?: CodeUnite;
  prixVente: number;
  prixAchat?: number;
  tauxTva?: number | null;
  seuilAlerte?: number;
  fournisseurId?: string | null;
  axes: AxeVariante[];
}

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "modele_article", entityId: entiteId, after: apres });
}

async function modeleVerrouille(tx: Transaction, organizationId: string, id: string) {
  const [m] = await tx
    .select()
    .from(modelesArticle)
    .where(and(eq(modelesArticle.id, id), eq(modelesArticle.organizationId, organizationId), isNull(modelesArticle.deletedAt)))
    .for("update");
  if (!m) throw new Error("Modèle introuvable.");
  return m;
}

/**
 * Crée les variantes manquantes d'un modèle. Les références sont vérifiées
 * d'avance : une collision avec un article existant se dit en clair, au lieu
 * d'une violation de contrainte au milieu de la génération.
 */
async function genererVariantes(tx: Transaction, organizationId: string, m: typeof modelesArticle.$inferSelect, axes: AxeVariante[]): Promise<number> {
  const existantes = await tx
    .select({ attributs: articles.attributs })
    .from(articles)
    .where(and(eq(articles.organizationId, organizationId), eq(articles.modeleId, m.id)));
  const deja = new Set(existantes.map((a) => cleCombinaison(a.attributs ?? {}, axes)));
  const aCreer = combinaisons(axes).filter((c) => !deja.has(cleCombinaison(c, axes)));
  if (aCreer.length === 0) return 0;

  const references = aCreer.map((c) => referenceVariante(m.reference, c, axes));
  const prises = await tx
    .select({ reference: articles.reference })
    .from(articles)
    .where(and(eq(articles.organizationId, organizationId), inArray(articles.reference, references)));
  if (prises.length) throw new Error(`Référence déjà utilisée par un autre article : ${prises[0].reference}. Changez la référence du modèle.`);

  for (const c of aCreer) {
    await creerArticleDans(tx, organizationId, {
      reference: referenceVariante(m.reference, c, axes),
      designation: designationVariante(m.designation, c, axes),
      type: "marchandise",
      unite: m.unite,
      prixVente: m.prixVente,
      prixAchat: m.prixAchat,
      familleId: m.familleId,
      tauxTva: m.tauxTva,
      seuilAlerte: m.seuilAlerte,
      fournisseurId: m.fournisseurId,
      modeleId: m.id,
      attributs: c,
    });
  }
  return aCreer.length;
}

export async function creerModeleDans(tx: Transaction, organizationId: string, d: NouveauModele, userId: string): Promise<{ id: string; reference: string; variantes: number }> {
  const axes = nettoyerAxes(d.axes);
  const refus = refusAxes(axes);
  if (refus) throw new Error(refus);
  if (!d.designation.trim()) throw new Error("La désignation du modèle est requise.");

  const reference = (d.reference?.trim() || (await prochainNumero(tx, organizationId, { cle: "modele", prefix: "M", padding: 4 }))).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,23}$/.test(reference)) throw new Error("Référence du modèle : lettres, chiffres et tirets, 24 caractères au plus.");
  const [pris] = await tx
    .select({ id: modelesArticle.id })
    .from(modelesArticle)
    .where(and(eq(modelesArticle.organizationId, organizationId), eq(modelesArticle.reference, reference)));
  if (pris) throw new Error(`Un modèle porte déjà la référence ${reference}.`);

  const id = newId();
  const [m] = await tx
    .insert(modelesArticle)
    .values({
      id,
      organizationId,
      reference,
      designation: d.designation.trim(),
      familleId: d.familleId ?? null,
      unite: d.unite ?? "piece",
      prixVente: d.prixVente,
      prixAchat: d.prixAchat ?? 0,
      tauxTva: d.tauxTva ?? null,
      seuilAlerte: d.seuilAlerte ?? 0,
      fournisseurId: d.fournisseurId ?? null,
      axes,
    })
    .returning();
  const variantes = await genererVariantes(tx, organizationId, m, axes);
  await journaliser(tx, organizationId, userId, "modele_article.creer", id, { reference, designation: m.designation, axes, variantes });
  return { id, reference, variantes };
}

/** Ajoute des valeurs aux axes existants et crée les combinaisons qui manquent. */
export async function ajouterValeursDans(tx: Transaction, organizationId: string, modeleId: string, ajouts: AxeVariante[], userId: string): Promise<{ variantes: number }> {
  const m = await modeleVerrouille(tx, organizationId, modeleId);
  const axes = fusionnerAxes(m.axes, ajouts);
  const refus = refusAxes(axes);
  if (refus) throw new Error(refus);
  await tx.update(modelesArticle).set({ axes, updatedAt: new Date(), version: sql`${modelesArticle.version} + 1` }).where(eq(modelesArticle.id, m.id));
  const variantes = await genererVariantes(tx, organizationId, { ...m, axes }, axes);
  await journaliser(tx, organizationId, userId, "modele_article.declinaisons", m.id, { axes, nouvelles: variantes });
  return { variantes };
}

/** Prix propres à certaines variantes : la pointure 46 coûte plus cher. */
export async function modifierPrixVariantesDans(
  tx: Transaction,
  organizationId: string,
  modeleId: string,
  prix: { articleId: string; prixVente: number; prixAchat?: number }[],
  userId: string,
): Promise<{ modifiees: number }> {
  await modeleVerrouille(tx, organizationId, modeleId);
  let modifiees = 0;
  for (const p of prix) {
    if (!Number.isInteger(p.prixVente) || p.prixVente < 0) throw new Error("Prix en francs entiers, positifs.");
    const r = await tx
      .update(articles)
      .set({
        prixVente: p.prixVente,
        ...(p.prixAchat !== undefined ? { prixAchat: p.prixAchat } : {}),
        updatedAt: new Date(),
        version: sql`${articles.version} + 1`,
      })
      .where(and(eq(articles.id, p.articleId), eq(articles.organizationId, organizationId), eq(articles.modeleId, modeleId)))
      .returning({ id: articles.id });
    modifiees += r.length;
  }
  await journaliser(tx, organizationId, userId, "modele_article.prix", modeleId, { modifiees });
  return { modifiees };
}

// ---------------------------------------------------------------- lecture

export async function listerModeles(organizationId: string) {
  const lignes = await db
    .select({ modele: modelesArticle, familleNom: famillesArticle.nom })
    .from(modelesArticle)
    .leftJoin(famillesArticle, eq(famillesArticle.id, modelesArticle.familleId))
    .where(and(eq(modelesArticle.organizationId, organizationId), isNull(modelesArticle.deletedAt)))
    .orderBy(asc(modelesArticle.designation));
  const comptes = await db.execute<{ modele_id: string; variantes: string; stock: string }>(sql`
    select a.modele_id, count(distinct a.id) as variantes, coalesce(sum(m.quantite), 0) as stock
    from articles a
    left join mouvements_stock m on m.article_id = a.id and m.deleted_at is null
    where a.organization_id = ${organizationId} and a.modele_id is not null and a.actif and a.deleted_at is null
    group by a.modele_id
  `);
  const parModele = new Map(comptes.map((c) => [c.modele_id, { variantes: Number(c.variantes), stock: Number(c.stock) }]));
  return lignes.map((l) => ({ ...l.modele, familleNom: l.familleNom, variantes: parModele.get(l.modele.id)?.variantes ?? 0, stock: parModele.get(l.modele.id)?.stock ?? 0 }));
}

export async function modeleDetail(organizationId: string, id: string) {
  const [m] = await db
    .select()
    .from(modelesArticle)
    .where(and(eq(modelesArticle.id, id), eq(modelesArticle.organizationId, organizationId), isNull(modelesArticle.deletedAt)));
  if (!m) return null;
  const variantes = await db
    .select({ id: articles.id, reference: articles.reference, designation: articles.designation, attributs: articles.attributs, prixVente: articles.prixVente, prixAchat: articles.prixAchat, actif: articles.actif })
    .from(articles)
    .where(and(eq(articles.organizationId, organizationId), eq(articles.modeleId, id), isNull(articles.deletedAt)))
    .orderBy(asc(articles.reference));
  return { modele: m, variantes };
}
