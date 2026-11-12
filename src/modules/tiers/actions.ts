"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { exigerEntreprise } from "@/lib/auth/dal";
import { exigerDroit, refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { creerTiersPour } from "./creation";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS, estNatureTiers } from "./natures";
import { tiers } from "./schema";
import { estDoublon } from "@/lib/erreurs-pg";

export interface EtatTiers {
  erreur?: string;
  /** Référence du tiers créé — sert à confirmer sans recharger la liste. */
  cree?: string;
}

/**
 * Un entier de francs saisi au clavier.
 *
 * Les espaces d'un « 1 500 000 » recopié depuis un tableur sont retirés avant
 * conversion, sinon la saisie est refusée sans que l'exploitant comprenne
 * pourquoi. Les décimales, elles, sont bien refusées : il n'existe pas de
 * demi-franc.
 */
const montant = z
  .string()
  .trim()
  .transform((valeur) => Number(valeur.replace(/[\s ]/g, "")))
  .pipe(z.number().int().min(0));

const schema = z
  .object({
    nom: z.string().trim().min(2, "Indiquez le nom du tiers."),
    nature: z.enum(NATURES_TIERS, "Choisissez le type de client."),
    estClient: z.boolean(),
    estFournisseur: z.boolean(),
    telephone: z.string().trim().max(32).optional(),
    email: z.email("Adresse e-mail invalide.").optional().or(z.literal("")),
    ville: z.string().trim().max(80).optional(),
    identifiantFiscal: z.string().trim().max(40).optional(),
    secteur: z.string().trim().max(80).optional(),
    plafondEncours: montant,
    delaiReglementJours: z.coerce.number().int().min(0).max(365),
    delaiLivraisonJours: z.coerce.number().int().min(0).max(365),
  })
  .refine((valeurs) => valeurs.estClient || valeurs.estFournisseur, {
    message: "Cochez au moins client ou fournisseur.",
    path: ["estClient"],
  });

function texte(donnees: FormData, champ: string): string | undefined {
  const valeur = donnees.get(champ);
  if (typeof valeur !== "string") return undefined;
  const propre = valeur.trim();
  return propre === "" ? undefined : propre;
}

/** Crée un tiers depuis le formulaire du fichier clients ou fournisseurs. */
export async function creerTiers(
  _precedent: EtatTiers,
  donnees: FormData,
): Promise<EtatTiers> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("tiers.fiche.gerer");
  if (refus) return refus;

  const analyse = schema.safeParse({
    nom: donnees.get("nom"),
    nature: donnees.get("nature") ?? "entreprise",
    estClient: donnees.get("estClient") === "on",
    estFournisseur: donnees.get("estFournisseur") === "on",
    telephone: texte(donnees, "telephone"),
    email: texte(donnees, "email") ?? "",
    ville: texte(donnees, "ville"),
    identifiantFiscal: texte(donnees, "identifiantFiscal"),
    secteur: texte(donnees, "secteur"),
    plafondEncours: String(donnees.get("plafondEncours") ?? "0"),
    delaiReglementJours: donnees.get("delaiReglementJours") ?? 0,
    delaiLivraisonJours: donnees.get("delaiLivraisonJours") ?? 0,
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0].message };
  }

  const valeurs = analyse.data;

  try {
    const { code } = await creerTiersPour(
      session.organizationId,
      {
        ...valeurs,
        email: valeurs.email || null,
        telephone: valeurs.telephone ?? null,
        ville: valeurs.ville ?? null,
        identifiantFiscal: valeurs.identifiantFiscal ?? null,
        secteur: valeurs.secteur ?? null,
      },
      session.userId,
    );

    revalidatePath("/commercial");
    revalidatePath("/commercial/fournisseurs");

    return { cree: code };
  } catch (erreur) {
    // 23505 : violation d'unicité. Le seul cas atteignable ici est une
    // référence déjà prise, quand elle a été forcée à la main.
    if (estDoublon(erreur)) {
      return { erreur: "Cette référence est déjà utilisée." };
    }
    throw erreur;
  }
}

/**
 * Désactive un tiers. Il quitte les listes de saisie, ses pièces restent.
 *
 * Pas de suppression : effacer un client effacerait le titulaire de ses
 * factures, et une créance sans débiteur n'est plus recouvrable.
 */
export async function archiverTiers(donnees: FormData): Promise<void> {
  const session = await exigerDroit("tiers.fiche.gerer");
  const id = String(donnees.get("id") ?? "");

  const [modifie] = await db
    .update(tiers)
    .set({
      actif: false,
      updatedAt: new Date(),
      // La version est incrémentée à chaque écriture : c'est elle qui permet à
      // deux appareils hors connexion de détecter qu'ils ont divergé.
      version: sql`${tiers.version} + 1`,
    })
    .where(and(eq(tiers.id, id), eq(tiers.organizationId, session.organizationId)))
    .returning({ id: tiers.id, nom: tiers.nom });

  if (!modifie) return;

  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: session.organizationId,
    userId: session.userId,
    action: "tiers.archiver",
    entityType: "tiers",
    entityId: modifie.id,
    after: { nom: modifie.nom, actif: false },
  });

  revalidatePath("/commercial");
  revalidatePath("/commercial/fournisseurs");
}

/**
 * Change le type d'un client : un fichier repris d'un tableur classe tout en
 * « entreprise », et c'est en le travaillant qu'on découvre la mutuelle ou
 * la coopérative. Ni la référence ni le compte auxiliaire ne bougent.
 */
export async function changerNatureTiers(id: string, nature: string): Promise<{ ok: boolean; message: string }> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("tiers.fiche.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!estNatureTiers(nature)) return { ok: false, message: "Type de client inconnu." };

  const [avant] = await db
    .select({ nature: tiers.nature, nom: tiers.nom })
    .from(tiers)
    .where(and(eq(tiers.id, id), eq(tiers.organizationId, session.organizationId)));
  if (!avant) return { ok: false, message: "Client introuvable." };
  if (avant.nature === nature) return { ok: true, message: "Type inchangé." };

  await db.transaction(async (tx) => {
    await tx
      .update(tiers)
      .set({ nature, updatedAt: new Date(), version: sql`${tiers.version} + 1` })
      .where(and(eq(tiers.id, id), eq(tiers.organizationId, session.organizationId)));
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: session.organizationId,
      userId: session.userId,
      action: "tiers.nature",
      entityType: "tiers",
      entityId: id,
      before: { nature: avant.nature },
      after: { nature },
    });
  });

  revalidatePath("/commercial");
  revalidatePath("/commercial/fournisseurs");
  return { ok: true, message: `${avant.nom} : ${LIBELLE_NATURE_TIERS[nature]}.` };
}
