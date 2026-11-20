"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { tracer } from "@/lib/audit";
import { exigerEntreprise } from "@/lib/auth/dal";
import { exigerDroit, refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { formaterQuantite, quantiteValide, UNITES, versQuantite } from "@/lib/quantite";
import { articles } from "@/modules/catalogue/schema";
import {
  creerDepotDans,
  enregistrerMouvementDans,
  transfererDans,
} from "./creation";
import { depots } from "./schema";
import { estDoublon } from "@/lib/erreurs-pg";

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
  .pipe(z.number().positive("Indiquez une quantité supérieure à zéro."))
  .transform(versQuantite);

function texte(donnees: FormData, champ: string): string | undefined {
  const valeur = donnees.get(champ);
  if (typeof valeur !== "string") return undefined;
  const propre = valeur.trim();
  return propre === "" ? undefined : propre;
}

// ------------------------------------------------------------------- dépôts

export interface EtatDepot {
  erreur?: string;
  /** Code du dépôt créé. */
  cree?: string;
}

const schemaDepot = z.object({
  nom: z.string().trim().min(2, "Indiquez le nom du dépôt."),
  code: z.string().trim().max(20).optional(),
  type: z.enum(["depot", "magasin", "vehicule"]),
  ville: z.string().trim().max(80).optional(),
  adresse: z.string().trim().max(200).optional(),
  parDefaut: z.boolean(),
});

export async function creerDepot(
  _precedent: EtatDepot,
  donnees: FormData,
): Promise<EtatDepot> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("stock.depot.gerer");
  if (refus) return refus;

  const analyse = schemaDepot.safeParse({
    nom: donnees.get("nom"),
    code: texte(donnees, "code"),
    type: donnees.get("type") ?? "depot",
    ville: texte(donnees, "ville"),
    adresse: texte(donnees, "adresse"),
    parDefaut: donnees.get("parDefaut") === "on",
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  try {
    const { code } = await db.transaction((tx) =>
      creerDepotDans(
        tx,
        session.organizationId,
        {
          nom: valeurs.nom,
          code: valeurs.code ?? null,
          type: valeurs.type,
          ville: valeurs.ville ?? null,
          adresse: valeurs.adresse ?? null,
          parDefaut: valeurs.parDefaut,
        },
        session.userId,
      ),
    );

    revalidatePath("/stock", "layout");
    return { cree: code };
  } catch (erreur) {
    if (estDoublon(erreur)) {
      return { erreur: "Ce code de dépôt est déjà utilisé." };
    }
    throw erreur;
  }
}

/**
 * Ferme un dépôt. Il quitte les listes de saisie, ses mouvements restent.
 *
 * Pas de suppression : la clé étrangère des mouvements est en `restrict`, et
 * c'est voulu — effacer un dépôt effacerait la moitié d'un transfert et
 * laisserait l'autre moitié pointer dans le vide.
 */
export async function fermerDepot(donnees: FormData): Promise<void> {
  const session = await exigerDroit("stock.depot.gerer");
  const id = String(donnees.get("id") ?? "");

  const [ferme] = await db
    .update(depots)
    .set({
      actif: false,
      // Un dépôt fermé ne peut plus être celui par défaut : la saisie
      // proposerait un lieu où plus personne ne va.
      parDefaut: false,
      updatedAt: new Date(),
      version: sql`${depots.version} + 1`,
    })
    .where(
      and(isNull(depots.deletedAt), eq(depots.id, id), eq(depots.organizationId, session.organizationId)),
    )
    .returning({ id: depots.id, code: depots.code, nom: depots.nom });

  if (!ferme) return;

  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: session.organizationId,
    userId: session.userId,
    action: "depot.fermer",
    entityType: "depot",
    entityId: ferme.id,
    after: { code: ferme.code, nom: ferme.nom, actif: false },
  });

  revalidatePath("/stock", "layout");
}

// --------------------------------------------------------------- mouvements

export interface EtatMouvement {
  erreur?: string;
  /** Numéro de la pièce enregistrée. */
  piece?: string;
  message?: string;
}

/**
 * Gestes de saisie manuelle. La vente n'en fait PAS partie : elle vient de la
 * caisse avec son ticket, et se saisir à la main ferait sortir de la
 * marchandise sans encaissement en face.
 */
const schemaMouvement = z.object({
  type: z.enum(["reception", "ajustement", "retour", "transfert"]),
  depotId: z.string().regex(UUID, "Choisissez un dépôt."),
  depotDestinationId: z.string().regex(UUID).optional(),
  articleId: z.string().regex(UUID, "Choisissez un article."),
  quantite: quantiteSaisie,
  /** L'ajustement seul peut retrancher : l'inventaire trouve autant qu'il perd. */
  sens: z.enum(["entree", "sortie"]),
  coutUnitaire: montant.optional(),
  piece: z.string().trim().max(40).optional(),
  motif: z.string().trim().max(200).optional(),
});

export async function enregistrerMouvement(
  _precedent: EtatMouvement,
  donnees: FormData,
): Promise<EtatMouvement> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("stock.mouvement.saisir");
  if (refus) return refus;

  const analyse = schemaMouvement.safeParse({
    type: donnees.get("type") ?? "reception",
    depotId: texte(donnees, "depotId") ?? "",
    depotDestinationId: texte(donnees, "depotDestinationId"),
    articleId: texte(donnees, "articleId") ?? "",
    quantite: String(donnees.get("quantite") ?? "0"),
    sens: donnees.get("sens") ?? "entree",
    coutUnitaire: texte(donnees, "coutUnitaire"),
    piece: texte(donnees, "piece"),
    motif: texte(donnees, "motif"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  // L'unité vit sur l'article : elle décide si la quantité saisie a un sens.
  const [article] = await db
    .select({
      designation: articles.designation,
      unite: articles.unite,
      suiviStock: articles.suiviStock,
    })
    .from(articles)
    .where(
      and(
        eq(articles.id, valeurs.articleId),
        eq(articles.organizationId, session.organizationId),
        isNull(articles.deletedAt),
      ),
    );

  if (!article) return { erreur: "Article introuvable." };

  if (!article.suiviStock) {
    return {
      erreur: `« ${article.designation} » est une prestation : elle ne se stocke pas.`,
    };
  }

  if (!quantiteValide(valeurs.quantite, article.unite)) {
    const unite = UNITES[article.unite];
    return {
      erreur: unite.fractionnable
        ? "Indiquez une quantité supérieure à zéro."
        : `« ${article.designation} » se compte en ${unite.libelle.toLowerCase()}s entières.`,
    };
  }

  if (valeurs.type === "ajustement" && !valeurs.motif) {
    // Un écart d'inventaire sans motif est un écart qu'on ne saura pas
    // expliquer trois mois plus tard, quand la question se posera.
    return { erreur: "Indiquez le motif de l'ajustement." };
  }

  try {
    // ------------------------------------------------------------ transfert
    if (valeurs.type === "transfert") {
      const destination = valeurs.depotDestinationId;

      if (!destination) {
        return { erreur: "Choisissez le dépôt de destination." };
      }
      if (destination === valeurs.depotId) {
        return { erreur: "Le dépôt de départ et celui d'arrivée sont les mêmes." };
      }

      const { piece } = await db.transaction((tx) =>
        transfererDans(
          tx,
          session.organizationId,
          {
            depotSourceId: valeurs.depotId,
            depotDestinationId: destination,
            articleId: valeurs.articleId,
            quantite: valeurs.quantite,
            piece: valeurs.piece ?? null,
            motif: valeurs.motif ?? null,
          },
          session.userId,
        ),
      );

      revalidatePath("/stock", "layout");
      return {
        piece,
        message: `${formaterQuantite(valeurs.quantite, article.unite)} transférées.`,
      };
    }

    // ------------------------------- réception, retour, ajustement d'inventaire
    // Une réception et un retour entrent toujours. Seul l'ajustement peut
    // retrancher : c'est lui qui porte la casse, la péremption et l'écart
    // d'inventaire.
    const sortie = valeurs.type === "ajustement" && valeurs.sens === "sortie";

    const { piece } = await db.transaction((tx) =>
      enregistrerMouvementDans(
        tx,
        session.organizationId,
        {
          depotId: valeurs.depotId,
          articleId: valeurs.articleId,
          type: valeurs.type,
          quantite: sortie ? -valeurs.quantite : valeurs.quantite,
          // Le prix payé n'est connu qu'à la réception. Ailleurs, la valeur
          // sort du coût moyen du dépôt, que `enregistrerMouvementDans` résout.
          coutUnitaire:
            valeurs.type === "reception" ? (valeurs.coutUnitaire ?? null) : null,
          piece: valeurs.piece ?? null,
          motif: valeurs.motif ?? null,
        },
        session.userId,
      ),
    );

    await tracer({
      action: `stock.${valeurs.type}`,
      entite: "article",
      entiteId: valeurs.articleId,
      apres: {
        article: article.designation,
        depotId: valeurs.depotId,
        quantite: sortie ? -valeurs.quantite : valeurs.quantite,
        piece,
        motif: valeurs.motif ?? null,
      },
    });
    revalidatePath("/stock", "layout");
    return {
      piece,
      message: `${sortie ? "−" : "+"}${formaterQuantite(valeurs.quantite, article.unite)} sur ${article.designation}.`,
    };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}
