"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";
import { violeContrainte } from "@/lib/erreurs-pg";

import { creerActifPour } from "@/modules/actifs/creation";

import { creerFourniturePour, enregistrerMouvementPour } from "./creation";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texte(donnees: FormData, champ: string): string | null {
  const v = donnees.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Entier saisi « 12 000 » ou « 12000 » ; NaN s'il n'est pas entier, null s'il est vide. */
function entier(donnees: FormData, champ: string): number | null {
  const v = texte(donnees, champ);
  if (v === null) return null;
  const n = Number(v.replace(/[\s  ]/g, ""));
  return Number.isInteger(n) ? n : NaN;
}

function lisible(erreur: unknown): string {
  if (violeContrainte(erreur, "fournitures_designation_unique")) return "Cette fourniture est déjà au catalogue.";
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Moyens généraux", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

async function operer(travail: (ctx: { organizationId: string; userId: string }) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("moyens_generaux.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail({ organizationId: session.organizationId, userId: session.userId });
    if (r.ok) revalidatePath("/moyens-generaux", "layout");
    return r;
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

const schemaFourniture = z.object({
  designation: z.string({ error: "Indiquez la désignation." }).trim().min(2, "Indiquez la désignation.").max(120),
  unite: z.string().trim().max(30).nullable(),
  seuil: z.number({ error: "Seuil : nombre entier." }).int("Seuil : nombre entier.").min(0).max(1_000_000),
});

export async function creerFourniture(d: FormData): Promise<Resultat> {
  return operer(async ({ organizationId, userId }) => {
    const analyse = schemaFourniture.safeParse({ designation: texte(d, "designation"), unite: texte(d, "unite"), seuil: entier(d, "seuil") ?? 0 });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    await creerFourniturePour(organizationId, userId, analyse.data);
    return { ok: true, message: "Fourniture ajoutée au catalogue." };
  });
}

const schemaMouvement = z.object({
  fournitureId: z.string({ error: "Choisissez la fourniture." }).regex(UUID, "Choisissez la fourniture."),
  quantite: z.number({ error: "Quantité : nombre entier." }).int("Quantité : nombre entier.").positive("La quantité doit être positive.").max(1_000_000),
  date: z.string({ error: "Indiquez la date." }).regex(DATE_ISO, "Indiquez la date."),
  cout: z.number().int("Coût : montant entier en francs.").min(0).nullable(),
  employeId: z.string().regex(UUID, "Salarié inconnu.").nullable(),
  service: z.string().max(80).nullable(),
  note: z.string().max(300).nullable(),
});

function lireMouvement(d: FormData) {
  return schemaMouvement.safeParse({
    fournitureId: texte(d, "fournitureId"),
    quantite: entier(d, "quantite"),
    date: texte(d, "date") ?? new Date().toISOString().slice(0, 10),
    cout: entier(d, "cout"),
    employeId: texte(d, "employeId"),
    service: texte(d, "service"),
    note: texte(d, "note"),
  });
}

/** Achat ou don : des fournitures entrent au placard. */
export async function enregistrerEntree(d: FormData): Promise<Resultat> {
  return operer(async ({ organizationId, userId }) => {
    const analyse = lireMouvement(d);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    await enregistrerMouvementPour(organizationId, userId, { ...analyse.data, sens: "entree" });
    return { ok: true, message: "Entrée enregistrée." };
  });
}

/** Remise à un salarié ou à un service : des fournitures sortent du placard. */
export async function enregistrerSortie(d: FormData): Promise<Resultat> {
  return operer(async ({ organizationId, userId }) => {
    const analyse = lireMouvement(d);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    if (!analyse.data.employeId && !analyse.data.service) return { ok: false, message: "Indiquez à qui ou à quel service la fourniture est remise." };
    await enregistrerMouvementPour(organizationId, userId, { ...analyse.data, cout: null, sens: "sortie" });
    return { ok: true, message: "Remise enregistrée." };
  });
}

const schemaLocal = z.object({
  designation: z.string({ error: "Indiquez le nom du local." }).trim().min(2, "Indiquez le nom du local.").max(120),
  site: z.string().trim().max(80).nullable(),
  notes: z.string().max(300).nullable(),
});

/**
 * Ouvre la fiche d'un local : bureau, entrepôt, magasin. C'est un actif de
 * type « local » — ses nettoyages, réparations et contrôles passent ensuite
 * par les interventions et les échéances du moteur Actifs.
 */
export async function creerLocal(d: FormData): Promise<Resultat> {
  return operer(async ({ organizationId, userId }) => {
    const analyse = schemaLocal.safeParse({ designation: texte(d, "designation"), site: texte(d, "site"), notes: texte(d, "notes") });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const { code } = await creerActifPour(organizationId, { ...analyse.data, type: "local", valeurAcquisition: 0 }, userId);
    revalidatePath("/actifs", "layout");
    return { ok: true, message: `Local ${code} ouvert.` };
  });
}
