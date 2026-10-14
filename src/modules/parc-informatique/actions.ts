"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";
import { violeContrainte } from "@/lib/erreurs-pg";

import { CATEGORIES_EQUIPEMENT, type CleCategorie } from "./calcul";
import {
  attribuerLicencePour,
  completerEquipementPour,
  creerEquipementPour,
  creerLicencePour,
  desattribuerLicencePour,
  retirerLicencePour,
} from "./creation";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = Object.keys(CATEGORIES_EQUIPEMENT) as [CleCategorie, ...CleCategorie[]];

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
  if (violeContrainte(erreur, "equipements_numero_serie_unique")) return "Ce numéro de série est déjà au parc.";
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Parc informatique", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function revalider() {
  revalidatePath("/parc-informatique", "layout");
  revalidatePath("/actifs", "layout");
  revalidatePath("/");
}

const facultatif = (max: number) => z.string().max(max).nullable();

const schemaDetails = z.object({
  categorie: z.enum(CATEGORIES),
  marque: facultatif(60),
  modele: facultatif(80),
  numeroSerie: facultatif(60),
  systeme: facultatif(60),
  processeur: facultatif(80),
  memoireGo: z.number().int("Mémoire : nombre entier de Go.").min(0).max(100_000).nullable(),
  stockageGo: z.number().int("Stockage : nombre entier de Go.").min(0).max(10_000_000).nullable(),
  nomReseau: facultatif(60),
  adresseIp: facultatif(39),
  adresseMac: facultatif(17),
  accessoires: facultatif(300),
  utilisateurId: z.string().regex(UUID, "Utilisateur inconnu.").nullable(),
});

function lireDetails(donnees: FormData) {
  return schemaDetails.safeParse({
    categorie: texte(donnees, "categorie") ?? "portable",
    marque: texte(donnees, "marque"),
    modele: texte(donnees, "modele"),
    numeroSerie: texte(donnees, "numeroSerie"),
    systeme: texte(donnees, "systeme"),
    processeur: texte(donnees, "processeur"),
    memoireGo: entier(donnees, "memoireGo"),
    stockageGo: entier(donnees, "stockageGo"),
    nomReseau: texte(donnees, "nomReseau"),
    adresseIp: texte(donnees, "adresseIp"),
    adresseMac: texte(donnees, "adresseMac"),
    accessoires: texte(donnees, "accessoires"),
    utilisateurId: texte(donnees, "utilisateurId"),
  });
}

export async function creerEquipement(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("parc_informatique.equipement.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const details = lireDetails(donnees);
  if (!details.success) return { ok: false, message: details.error.issues[0].message };
  const ouverture = z
    .object({
      designation: facultatif(120),
      site: facultatif(80),
      dateAcquisition: z.string().regex(DATE_ISO).nullable(),
      valeurAcquisition: z.number().int().min(0, "Valeur négative.").nullable(),
      garantieFin: z.string().regex(DATE_ISO).nullable(),
    })
    .safeParse({
      designation: texte(donnees, "designation"),
      site: texte(donnees, "site"),
      dateAcquisition: texte(donnees, "dateAcquisition"),
      valeurAcquisition: entier(donnees, "valeurAcquisition"),
      garantieFin: texte(donnees, "garantieFin"),
    });
  if (!ouverture.success) return { ok: false, message: ouverture.error.issues[0].message };

  try {
    const { code } = await creerEquipementPour(
      session.organizationId,
      { ...details.data, ...ouverture.data, valeurAcquisition: ouverture.data.valeurAcquisition ?? 0 },
      session.userId,
    );
    revalider();
    return { ok: true, message: `${code} ouvert au parc.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function modifierEquipement(actifId: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("parc_informatique.equipement.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(actifId)) return { ok: false, message: "Équipement inconnu." };
  const details = lireDetails(donnees);
  if (!details.success) return { ok: false, message: details.error.issues[0].message };
  try {
    await completerEquipementPour(session.organizationId, session.userId, actifId, details.data);
    revalider();
    return { ok: true, message: "Fiche technique enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function creerLicence(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("parc_informatique.licence.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const analyse = z
    .object({
      logiciel: z.string().min(2, "Nommez le logiciel.").max(120),
      editeur: facultatif(80),
      type: z.enum(["abonnement", "perpetuelle"]),
      cle: facultatif(200),
      postes: z.number().int("Postes : nombre entier.").min(1, "Au moins un poste.").max(100_000),
      expireLe: z.string().regex(DATE_ISO).nullable(),
      cout: z.number().int("Coût en francs entiers.").min(0).nullable(),
      fournisseurId: z.string().regex(UUID, "Fournisseur inconnu.").nullable(),
      fournisseur: facultatif(80),
      notes: facultatif(300),
    })
    .safeParse({
      logiciel: texte(donnees, "logiciel") ?? "",
      editeur: texte(donnees, "editeur"),
      type: texte(donnees, "type") ?? "abonnement",
      cle: texte(donnees, "cle"),
      postes: entier(donnees, "postes") ?? 1,
      expireLe: texte(donnees, "expireLe"),
      cout: entier(donnees, "cout"),
      fournisseurId: texte(donnees, "fournisseurId"),
      fournisseur: texte(donnees, "fournisseur"),
      notes: texte(donnees, "notes"),
    });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  try {
    await creerLicencePour(session.organizationId, session.userId, { ...analyse.data, cout: analyse.data.cout ?? 0 });
    revalider();
    return { ok: true, message: `Licence ${analyse.data.logiciel} enregistrée.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function retirerLicence(licenceId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("parc_informatique.licence.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(licenceId)) return { ok: false, message: "Licence inconnue." };
  try {
    await retirerLicencePour(session.organizationId, session.userId, licenceId);
    revalider();
    return { ok: true, message: "Licence retirée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function attribuerLicence(licenceId: string, actifId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("parc_informatique.licence.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(licenceId) || !UUID.test(actifId)) return { ok: false, message: "Choix invalide." };
  try {
    const { depassement } = await attribuerLicencePour(session.organizationId, session.userId, licenceId, actifId);
    revalider();
    return depassement
      ? { ok: true, message: "Installée — mais la licence compte désormais plus de postes que de droits achetés." }
      : { ok: true, message: "Licence installée sur le poste." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function desattribuerLicence(licenceId: string, actifId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("parc_informatique.licence.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(licenceId) || !UUID.test(actifId)) return { ok: false, message: "Choix invalide." };
  try {
    await desattribuerLicencePour(session.organizationId, session.userId, licenceId, actifId);
    revalider();
    return { ok: true, message: "Licence retirée du poste." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
