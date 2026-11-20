import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { entityCodes } from "@/db/schema";
import { tiers } from "@/modules/tiers/schema";
import {
  articles,
  famillesArticle,
  type Article,
  type FamilleArticle,
} from "./schema";

/**
 * Article accompagné de ce qui se déduit de sa famille.
 *
 * Le taux et les comptes sont résolus ici, une fois, plutôt que dans chaque
 * écran : une ligne de vente, une étiquette de rayon et une écriture doivent
 * lire le même taux, sinon la déclaration de TVA ne retombe pas sur les tickets.
 */
export interface ArticleResolu extends Article {
  familleNom: string | null;
  fournisseurNom: string | null;
  /** Taux applicable, en points de base. Celui de l'article, sinon sa famille. */
  tauxTvaEffectif: number;
  compteVenteEffectif: string;
  compteAchatEffectif: string;
}

/** Valeurs retenues quand l'article n'a ni taux propre ni famille. */
const DEFAUTS = { tauxTva: 1800, compteVente: "701", compteAchat: "601" };

export async function listerArticles(
  organizationId: string,
  inclureInactifs = false,
): Promise<ArticleResolu[]> {
  const filtres = [
    eq(articles.organizationId, organizationId),
    isNull(articles.deletedAt),
  ];
  if (!inclureInactifs) filtres.push(eq(articles.actif, true));

  const lignes = await db
    .select({
      article: articles,
      familleNom: famillesArticle.nom,
      familleTaux: famillesArticle.tauxTva,
      familleCompteVente: famillesArticle.compteVente,
      familleCompteAchat: famillesArticle.compteAchat,
      fournisseurNom: tiers.nom,
    })
    .from(articles)
    .leftJoin(famillesArticle, eq(articles.familleId, famillesArticle.id))
    .leftJoin(tiers, eq(articles.fournisseurId, tiers.id))
    .where(and(...filtres))
    .orderBy(asc(articles.designation));

  return lignes.map((ligne) => ({
    ...ligne.article,
    familleNom: ligne.familleNom,
    fournisseurNom: ligne.fournisseurNom,
    tauxTvaEffectif:
      ligne.article.tauxTva ?? ligne.familleTaux ?? DEFAUTS.tauxTva,
    compteVenteEffectif:
      ligne.article.compteVente ?? ligne.familleCompteVente ?? DEFAUTS.compteVente,
    compteAchatEffectif:
      ligne.article.compteAchat ?? ligne.familleCompteAchat ?? DEFAUTS.compteAchat,
  }));
}

/**
 * Codes scannables des articles, indexés par identifiant d'article.
 *
 * Une entrée porte plusieurs codes : l'EAN du fabricant imprimé sur
 * l'emballage et notre étiquette de rayon doivent tous deux répondre au scan.
 * D'où un tableau par article, jamais une valeur unique.
 */
export async function codesParArticle(
  organizationId: string,
): Promise<Map<string, string[]>> {
  const lignes = await db
    .select({ entityId: entityCodes.entityId, value: entityCodes.value })
    .from(entityCodes)
    .where(
      and(
        eq(entityCodes.organizationId, organizationId),
        eq(entityCodes.entityType, "article"),
        eq(entityCodes.isActive, true),
        isNull(entityCodes.deletedAt),
      ),
    );

  const codes = new Map<string, string[]>();
  for (const ligne of lignes) {
    const liste = codes.get(ligne.entityId);
    if (liste) liste.push(ligne.value);
    else codes.set(ligne.entityId, [ligne.value]);
  }
  return codes;
}

export async function listerFamilles(
  organizationId: string,
): Promise<FamilleArticle[]> {
  return db
    .select()
    .from(famillesArticle)
    .where(
      and(
        eq(famillesArticle.organizationId, organizationId),
        eq(famillesArticle.actif, true),
        isNull(famillesArticle.deletedAt),
      ),
    )
    .orderBy(asc(famillesArticle.ordre), asc(famillesArticle.nom));
}
