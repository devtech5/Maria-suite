"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { LONGUEUR_MAX_CORPS, LONGUEUR_MAX_OBJET, paragraphesDe } from "./courriers-calcul";
import { creerCourrierDans, modifierCourrierDans, supprimerCourrierDans } from "./courriers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EtatCourrier {
  erreur?: string;
  message?: string;
}

const facultatif = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

const schemaCourrier = z.object({
  lieu: z.string().trim().min(2, "Indiquez le lieu : « Abidjan, le … »").max(80),
  dateCourrier: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date du courrier.")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Date invalide."),
  destinataire: facultatif(600),
  objet: z.string().trim().min(3, "Indiquez l'objet du courrier.").max(LONGUEUR_MAX_OBJET, "Objet trop long."),
  corps: z
    .string()
    .max(LONGUEUR_MAX_CORPS, "Corps trop long pour une lettre.")
    .refine((v) => paragraphesDe(v).length > 0, "Le courrier n'a pas de corps."),
  signataire: z.string().trim().min(2, "Indiquez le signataire.").max(120),
  fonction: facultatif(120),
});

function lire(donnees: FormData, champ: string): string {
  const valeur = donnees.get(champ);
  return typeof valeur === "string" ? valeur : "";
}

/**
 * Rédige ou corrige un courrier. Sans `id`, c'est une création : le courrier
 * reçoit son numéro et l'écran passe sur sa fiche, d'où il s'imprime.
 */
export async function enregistrerCourrier(_precedent: EtatCourrier, donnees: FormData): Promise<EtatCourrier> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("documents.courrier.rediger");
  if (refus) return refus;

  const analyse = schemaCourrier.safeParse({
    lieu: lire(donnees, "lieu"),
    dateCourrier: lire(donnees, "dateCourrier"),
    destinataire: lire(donnees, "destinataire"),
    objet: lire(donnees, "objet"),
    corps: lire(donnees, "corps"),
    signataire: lire(donnees, "signataire"),
    fonction: lire(donnees, "fonction"),
  });
  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const id = lire(donnees, "id");
  if (id) {
    if (!UUID.test(id)) return { erreur: "Courrier introuvable." };
    const modifie = await db.transaction((tx) =>
      modifierCourrierDans(tx, session.organizationId, id, analyse.data, session.userId),
    );
    if (!modifie) return { erreur: "Ce courrier n'existe plus." };
    revalidatePath("/documents/courriers", "layout");
    revalidatePath(`/imprimer/courrier/${id}`);
    return { message: `${modifie.numero} enregistré.` };
  }

  const cree = await db.transaction((tx) =>
    creerCourrierDans(tx, session.organizationId, analyse.data, session.userId),
  );
  revalidatePath("/documents/courriers", "layout");
  redirect(`/documents/courriers/${cree.id}`);
}

export async function supprimerCourrier(donnees: FormData): Promise<void> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("documents.courrier.rediger");
  if (refus) return;

  const id = lire(donnees, "id");
  if (!UUID.test(id)) return;

  await db.transaction((tx) => supprimerCourrierDans(tx, session.organizationId, id, session.userId));
  revalidatePath("/documents/courriers", "layout");
  redirect("/documents/courriers");
}
