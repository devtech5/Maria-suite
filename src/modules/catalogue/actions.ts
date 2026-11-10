"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { exigerEntreprise } from "@/lib/auth/dal";
import { exigerDroit, refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { UNITES, versQuantite } from "@/lib/quantite";
import { creerArticlePour } from "./creation";
import { articles } from "./schema";
import { estDoublon } from "@/lib/erreurs-pg";

export interface EtatArticle {
  erreur?: string;
  /** Référence de l'article créé. */
  cree?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un entier de francs saisi au clavier, espaces de milliers admis. */
const montant = z
  .string()
  .trim()
  .transform((valeur) => Number(valeur.replace(/[\s ]/g, "")))
  .pipe(z.number().int().min(0));

/** Une quantité saisie en unités humaines : « 1,5 » devient 1500 millièmes. */
const quantiteSaisie = z
  .string()
  .trim()
  .transform((valeur) => Number(valeur.replace(/[\s ]/g, "").replace(",", ".")))
  .pipe(z.number().min(0))
  .transform(versQuantite);

const unites = Object.keys(UNITES) as [keyof typeof UNITES, ...(keyof typeof UNITES)[]];

const schema = z.object({
  designation: z.string().trim().min(2, "Indiquez la désignation de l'article."),
  reference: z.string().trim().max(40).optional(),
  type: z.enum(["marchandise", "service"]),
  unite: z.enum(unites),
  conditionnement: z.string().trim().max(40).optional(),
  prixVente: montant,
  prixAchat: montant,
  familleId: z.string().regex(UUID).optional(),
  fournisseurId: z.string().regex(UUID).optional(),
  seuilAlerte: quantiteSaisie,
});

function texte(donnees: FormData, champ: string): string | undefined {
  const valeur = donnees.get(champ);
  if (typeof valeur !== "string") return undefined;
  const propre = valeur.trim();
  return propre === "" ? undefined : propre;
}

export async function creerArticle(
  _precedent: EtatArticle,
  donnees: FormData,
): Promise<EtatArticle> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("stock.article.gerer");
  if (refus) return refus;

  const analyse = schema.safeParse({
    designation: donnees.get("designation"),
    reference: texte(donnees, "reference"),
    type: donnees.get("type") ?? "marchandise",
    unite: donnees.get("unite") ?? "piece",
    conditionnement: texte(donnees, "conditionnement"),
    prixVente: String(donnees.get("prixVente") ?? "0"),
    prixAchat: String(donnees.get("prixAchat") ?? "0"),
    familleId: texte(donnees, "familleId"),
    fournisseurId: texte(donnees, "fournisseurId"),
    seuilAlerte: String(donnees.get("seuilAlerte") ?? "0"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0].message };
  }

  const valeurs = analyse.data;

  // Une unité non fractionnable refuse une quantité qui ne l'est pas : un
  // seuil de « 2,5 bouteilles » ne déclencherait jamais proprement.
  if (
    !UNITES[valeurs.unite].fractionnable &&
    valeurs.seuilAlerte % 1000 !== 0
  ) {
    return {
      erreur: `Le seuil doit être un nombre entier de ${UNITES[valeurs.unite].libelle.toLowerCase()}s.`,
    };
  }

  try {
    const { reference } = await creerArticlePour(
      session.organizationId,
      {
        ...valeurs,
        reference: valeurs.reference ?? null,
        conditionnement: valeurs.conditionnement ?? null,
        familleId: valeurs.familleId ?? null,
        fournisseurId: valeurs.fournisseurId ?? null,
      },
      session.userId,
    );

    revalidatePath("/stock/articles");

    return { cree: reference };
  } catch (erreur) {
    if (estDoublon(erreur)) {
      return { erreur: "Cette référence est déjà utilisée." };
    }
    throw erreur;
  }
}

/**
 * Désactive un article. Il quitte la caisse, l'historique reste lisible.
 *
 * Le supprimer viderait la désignation de toutes les lignes de vente qui le
 * citent : un ticket réimprimé six mois plus tard doit dire ce qui a été vendu.
 */
export async function archiverArticle(donnees: FormData): Promise<void> {
  const session = await exigerDroit("stock.article.gerer");
  const id = String(donnees.get("id") ?? "");

  const [modifie] = await db
    .update(articles)
    .set({
      actif: false,
      updatedAt: new Date(),
      version: sql`${articles.version} + 1`,
    })
    .where(
      and(eq(articles.id, id), eq(articles.organizationId, session.organizationId)),
    )
    .returning({ id: articles.id, designation: articles.designation });

  if (!modifie) return;

  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: session.organizationId,
    userId: session.userId,
    action: "article.archiver",
    entityType: "article",
    entityId: modifie.id,
    after: { designation: modifie.designation, actif: false },
  });

  revalidatePath("/stock/articles");
}
