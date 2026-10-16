"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { tracer } from "@/lib/audit";
import { exigerEntreprise } from "@/lib/auth/dal";
import { delaiValide } from "@/lib/auth/verrou";
import { refusDroit } from "@/lib/droits/garde";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const texte = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

const schema = z.object({
  nom: z.string().trim().min(2, "Le nom de l'entreprise est requis.").max(120),
  formeJuridique: texte(60),
  identifiantFiscal: texte(40),
  rccm: texte(60),
  regimeFiscal: texte(60),
  adresse: texte(200),
  ville: texte(80),
  telephone: texte(40),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Adresse e-mail invalide.")
    .transform((v) => v || null)
    .nullable(),
  couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur primaire invalide."),
  couleurSecondaire: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur secondaire invalide."),
  piedDePage: texte(600),
  slogan: texte(120),
  siteWeb: texte(120),
  /** Entier, en unités de la devise : le franc CFA n'a pas de subdivision. */
  capitalSocial: z.number().int("Capital social : un montant entier.").min(0, "Capital social négatif.").max(1e15).nullable(),
  /** Absent : inchangé ; nul : retiré ; chaîne : nouveau logo. */
  logo: z
    .string()
    .max(131_072, "Logo trop lourd, même réduit : choisissez une image plus simple.")
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Logo illisible.")
    .nullable()
    .optional(),
});

/** Identité de l'entreprise : ce que portent ses factures, tickets et bons. */
export async function modifierIdentite(saisie: z.input<typeof schema>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("organisation.parametres.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const analyse = schema.safeParse(saisie);
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  const v = analyse.data;

  await db
    .update(organizations)
    .set({
      name: v.nom,
      legalForm: v.formeJuridique,
      taxId: v.identifiantFiscal,
      rccm: v.rccm,
      taxRegime: v.regimeFiscal,
      address: v.adresse,
      city: v.ville,
      phone: v.telephone,
      email: v.email,
      couleurDocuments: v.couleur,
      couleurSecondaire: v.couleurSecondaire,
      piedDePage: v.piedDePage,
      slogan: v.slogan,
      siteWeb: v.siteWeb,
      capitalSocial: v.capitalSocial,
      ...(v.logo !== undefined ? { logo: v.logo } : {}),
      updatedAt: new Date(),
      version: sql`${organizations.version} + 1`,
    })
    .where(eq(organizations.id, session.organizationId));

  await tracer({
    action: "organisation.identite",
    entite: "organisation",
    entiteId: session.organizationId,
    apres: { nom: v.nom, identifiantFiscal: v.identifiantFiscal, rccm: v.rccm, logo: v.logo === undefined ? "inchangé" : v.logo ? "nouveau" : "retiré" },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Identité enregistrée : elle s'imprime dès maintenant sur les factures, bons et tickets." };
}

/** Délai d'inactivité avant le verrouillage de l'écran, pour toute l'entreprise. */
export async function modifierDelaiVerrouillage(minutes: number): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("organisation.parametres.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!delaiValide(minutes)) return { ok: false, message: "Délai non proposé." };

  const [avant] = await db
    .select({ delai: organizations.delaiVerrouillageMinutes })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId));

  await db
    .update(organizations)
    .set({ delaiVerrouillageMinutes: minutes, updatedAt: new Date(), version: sql`${organizations.version} + 1` })
    .where(eq(organizations.id, session.organizationId));

  await tracer({
    action: "organisation.verrouillage",
    entite: "organisation",
    entiteId: session.organizationId,
    avant: { delaiMinutes: avant?.delai },
    apres: { delaiMinutes: minutes },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `L'écran se verrouillera après ${minutes} minutes sans activité.` };
}
