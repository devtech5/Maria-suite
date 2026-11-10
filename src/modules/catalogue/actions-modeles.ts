"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { ajouterValeursDans, creerModeleDans, modifierPrixVariantesDans } from "./modeles";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const axe = z.object({ nom: z.string().max(40), valeurs: z.array(z.string().max(40)).max(60) });

async function operer(travail: (organizationId: string, userId: string) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("stock.article.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail(session.organizationId, session.userId);
    if (r.ok) {
      revalidatePath("/stock", "layout");
    }
    return r;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Modèles : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

const schemaModele = z.object({
  reference: z.string().trim().max(24).optional(),
  designation: z.string().trim().min(2, "Désignation requise.").max(160),
  familleId: z.string().regex(UUID).nullable().optional(),
  prixVente: z.number().int().min(0),
  prixAchat: z.number().int().min(0),
  tauxTva: z.number().int().min(0).max(10_000).nullable().optional(),
  axes: z.array(axe).min(1).max(3),
});

export async function creerModele(saisie: z.input<typeof schemaModele>): Promise<Resultat> {
  return operer(async (organizationId, userId) => {
    const analyse = schemaModele.safeParse(saisie);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const r = await db.transaction((tx) => creerModeleDans(tx, organizationId, analyse.data, userId));
    return { ok: true, id: r.id, message: `Modèle ${r.reference} créé : ${r.variantes} variante${r.variantes > 1 ? "s" : ""}, chacune avec sa référence et son stock.` };
  });
}

export async function ajouterValeurs(modeleId: string, ajouts: z.input<typeof axe>[]): Promise<Resultat> {
  return operer(async (organizationId, userId) => {
    if (!UUID.test(modeleId)) return { ok: false, message: "Modèle introuvable." };
    const analyse = z.array(axe).max(3).safeParse(ajouts);
    if (!analyse.success) return { ok: false, message: "Valeurs illisibles." };
    const r = await db.transaction((tx) => ajouterValeursDans(tx, organizationId, modeleId, analyse.data, userId));
    return { ok: true, message: r.variantes ? `${r.variantes} nouvelle${r.variantes > 1 ? "s" : ""} variante${r.variantes > 1 ? "s" : ""}.` : "Aucune nouvelle combinaison." };
  });
}

export async function modifierPrixVariantes(modeleId: string, prix: { articleId: string; prixVente: number }[]): Promise<Resultat> {
  return operer(async (organizationId, userId) => {
    if (!UUID.test(modeleId)) return { ok: false, message: "Modèle introuvable." };
    const analyse = z.array(z.object({ articleId: z.string().regex(UUID), prixVente: z.number().int().min(0) })).max(400).safeParse(prix);
    if (!analyse.success) return { ok: false, message: "Prix en francs entiers, positifs." };
    const r = await db.transaction((tx) => modifierPrixVariantesDans(tx, organizationId, modeleId, analyse.data, userId));
    return { ok: true, message: `${r.modifiees} prix mis à jour.` };
  });
}
