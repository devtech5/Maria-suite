"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";
import { estDoublon } from "@/lib/erreurs-pg";
import { estNatureTiers } from "@/modules/tiers/natures";
import { estOrigine, paysPourOrigine } from "@/modules/tiers/origine";
import { paysEntreprise } from "@/modules/tiers/requetes";

import { COMPTES_CHARGE, UNITES_TARIF, type CompteCharge, type UniteTarif } from "./calcul";
import {
  changerStatutPour,
  creerPrestatairePour,
  demanderPrestationPour,
  evaluerPour,
  modifierPrestatairePour,
  payerPour,
} from "./creation";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texte(donnees: FormData, champ: string): string | null {
  const v = donnees.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function entier(donnees: FormData, champ: string): number | null {
  const v = texte(donnees, champ);
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, ""));
  return Number.isInteger(n) ? n : NaN;
}

function lisible(erreur: unknown): string {
  if (estDoublon(erreur)) return "Ce tiers est déjà inscrit comme prestataire.";
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Prestataires", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function revalider() {
  revalidatePath("/prestataires", "layout");
  revalidatePath("/comptabilite", "layout");
  revalidatePath("/tresorerie", "layout");
}

const UNITES = Object.keys(UNITES_TARIF) as [UniteTarif, ...UniteTarif[]];
const COMPTES = Object.keys(COMPTES_CHARGE) as [CompteCharge, ...CompteCharge[]];

const schemaProfil = z.object({
  metiers: z.array(z.string().trim().min(2).max(60)).min(1, "Indiquez au moins un métier."),
  specialites: z.string().max(300).nullable(),
  zone: z.string().max(200).nullable(),
  tarif: z.number().int("Tarif en francs entiers.").min(0).nullable(),
  uniteTarif: z.enum(UNITES).nullable(),
  formel: z.boolean(),
  mobileMoney: z.string().max(30).nullable(),
  disponible: z.boolean(),
  notes: z.string().max(1000).nullable(),
});

function lireProfil(donnees: FormData) {
  const metiers = [...donnees.getAll("metiers").map(String), ...(texte(donnees, "autreMetier")?.split(",") ?? [])].map((m) => m.trim()).filter(Boolean);
  return schemaProfil.safeParse({
    metiers,
    specialites: texte(donnees, "specialites"),
    zone: texte(donnees, "zone"),
    tarif: entier(donnees, "tarif"),
    uniteTarif: texte(donnees, "uniteTarif"),
    formel: donnees.get("formel") === "on",
    mobileMoney: texte(donnees, "mobileMoney"),
    disponible: donnees.get("disponible") !== "off",
    notes: texte(donnees, "notes"),
  });
}

export async function inscrirePrestataire(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("prestataires.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const profil = lireProfil(donnees);
  if (!profil.success) return { ok: false, message: profil.error.issues[0].message };
  const tiersId = texte(donnees, "tiersId");
  if (tiersId && !UUID.test(tiersId)) return { ok: false, message: "Fiche tiers inconnue." };
  const nature = texte(donnees, "nature") ?? "particulier";
  if (!estNatureTiers(nature)) return { ok: false, message: "Choisissez le type de prestataire." };
  // Local ou international : le pays se déduit du choix, jamais saisi deux fois.
  const origine = texte(donnees, "origine") ?? "local";
  if (!estOrigine(origine)) return { ok: false, message: "Précisez si le prestataire est local ou international." };
  const lieu = paysPourOrigine(origine, texte(donnees, "pays"), await paysEntreprise(session.organizationId));
  if ("erreur" in lieu) return { ok: false, message: lieu.erreur };
  try {
    const { id } = await creerPrestatairePour(session.organizationId, session.userId, {
      ...profil.data,
      tiersId,
      nom: texte(donnees, "nom") ?? undefined,
      nature,
      paysCode: lieu.paysCode,
      telephone: texte(donnees, "telephone"),
      email: texte(donnees, "email"),
      ville: texte(donnees, "ville"),
      identifiantFiscal: texte(donnees, "identifiantFiscal"),
    });
    revalider();
    return { ok: true, message: "Prestataire inscrit.", id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function modifierPrestataire(id: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("prestataires.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id)) return { ok: false, message: "Prestataire inconnu." };
  const profil = lireProfil(donnees);
  if (!profil.success) return { ok: false, message: profil.error.issues[0].message };
  try {
    await modifierPrestatairePour(session.organizationId, session.userId, id, profil.data);
    revalider();
    return { ok: true, message: "Fiche enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function confierPrestation(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("prestataires.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const analyse = z
    .object({
      prestataireId: z.string().regex(UUID, "Choisissez un prestataire."),
      objet: z.string().min(3, "Décrivez la prestation.").max(200),
      description: z.string().max(2000).nullable(),
      lieu: z.string().max(200).nullable(),
      prevueLe: z.string().regex(DATE_ISO).nullable(),
      montantConvenu: z.number().int("Montant en francs entiers.").min(0).nullable(),
    })
    .safeParse({
      prestataireId: texte(donnees, "prestataireId") ?? "",
      objet: texte(donnees, "objet") ?? "",
      description: texte(donnees, "description"),
      lieu: texte(donnees, "lieu"),
      prevueLe: texte(donnees, "prevueLe"),
      montantConvenu: entier(donnees, "montantConvenu"),
    });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  try {
    const { numero } = await demanderPrestationPour(session.organizationId, session.userId, analyse.data);
    revalider();
    return { ok: true, message: `Prestation ${numero} enregistrée.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function changerStatutPrestation(id: string, vers: "confirmee" | "realisee" | "annulee", motif?: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("prestataires.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id) || !["confirmee", "realisee", "annulee"].includes(vers)) return { ok: false, message: "Geste inconnu." };
  try {
    const numero = await changerStatutPour(session.organizationId, session.userId, id, vers, { motif });
    revalider();
    const texteFin = { confirmee: "confirmée", realisee: "réalisée", annulee: "annulée" }[vers];
    return { ok: true, message: `${numero} ${texteFin}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function evaluerPrestation(id: string, note: number, avis: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("prestataires.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id)) return { ok: false, message: "Prestation inconnue." };
  try {
    await evaluerPour(session.organizationId, session.userId, id, note, avis.slice(0, 1000));
    revalider();
    return { ok: true, message: "Avis enregistré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function payerPrestation(id: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("prestataires.payer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id)) return { ok: false, message: "Prestation inconnue." };
  const tauxSaisi = texte(donnees, "retenue");
  const analyse = z
    .object({
      montant: z.number().int("Montant en francs entiers.").positive("Indiquez le montant payé."),
      retenueBp: z.number().int().min(0).max(5000, "Retenue invraisemblable."),
      compteCharge: z.enum(COMPTES),
      compteTresorerieId: z.string().regex(UUID, "Choisissez le compte qui paie."),
      date: z.string().regex(DATE_ISO, "Date invalide."),
    })
    .safeParse({
      montant: entier(donnees, "montant") ?? NaN,
      // Saisi en pourcentage (« 7,5 »), stocké en points de base.
      retenueBp: tauxSaisi === null ? 0 : Math.round(Number(tauxSaisi.replace(",", ".")) * 100),
      compteCharge: texte(donnees, "compteCharge"),
      compteTresorerieId: texte(donnees, "compteTresorerieId") ?? "",
      date: texte(donnees, "date") ?? new Date().toISOString().slice(0, 10),
    });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  try {
    const { numero, ecriture } = await payerPour(session.organizationId, session.userId, id, analyse.data);
    revalider();
    return { ok: true, message: `${numero} payée — écriture ${ecriture}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
