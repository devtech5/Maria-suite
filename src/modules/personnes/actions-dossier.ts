"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";
import { stockageConfigure, urlSignee } from "@/lib/stockage";

import {
  ajouterPiecePour,
  changerPhotoPour,
  fichierDe,
  modifierEtatCivilPour,
  modifierEtatProfessionnelPour,
  ouvrirPiecePour,
  retirerPiecePour,
} from "./dossier";
import { lienUrgenceConnu } from "./calcul";
import { NATURES_PIECE, photoValide } from "./pieces";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texte(donnees: FormData, champ: string): string | null {
  const v = donnees.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Dossier salarié", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

const schemaPiece = z.object({
  nature: z.enum(NATURES_PIECE),
  numero: z.string().max(80).nullable(),
  organisme: z.string().max(120).nullable(),
  precision: z.string().max(160).nullable(),
  delivreeLe: z.string().regex(DATE_ISO, "Date de délivrance invalide.").nullable(),
  expireLe: z.string().regex(DATE_ISO, "Date de fin de validité invalide.").nullable(),
  notes: z.string().max(500).nullable(),
});

export async function ajouterPiece(employeeId: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(employeeId)) return { ok: false, message: "Salarié inconnu." };

  const analyse = schemaPiece.safeParse({
    nature: texte(donnees, "nature"),
    numero: texte(donnees, "numero"),
    organisme: texte(donnees, "organisme"),
    precision: texte(donnees, "precision"),
    delivreeLe: texte(donnees, "delivreeLe"),
    expireLe: texte(donnees, "expireLe"),
    notes: texte(donnees, "notes"),
  });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  const fichier = await fichierDe(donnees, "fichier");
  if (fichier && !stockageConfigure()) {
    return { ok: false, message: "Le dépôt de fichiers n'est pas configuré : enregistrez la pièce sans fichier, ou configurez le dépôt." };
  }

  try {
    await ajouterPiecePour(session.organizationId, session.userId, employeeId, analyse.data, fichier);
    revalidatePath("/rh", "layout");
    return { ok: true, message: "Pièce ajoutée au dossier." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function retirerPiece(pieceId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(pieceId)) return { ok: false, message: "Pièce inconnue." };
  try {
    await retirerPiecePour(session.organizationId, session.userId, pieceId);
    revalidatePath("/rh", "layout");
    return { ok: true, message: "Pièce retirée, son fichier effacé du dépôt." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** URL signée de cinq minutes, demandée au clic. L'ouverture est tracée. */
export async function ouvrirPiece(pieceId: string): Promise<string | null> {
  const session = await exigerEntreprise();
  if (await refusDroit("personnes.dossier.consulter")) return null;
  if (!UUID.test(pieceId)) return null;
  const chemin = await ouvrirPiecePour(session.organizationId, session.userId, pieceId);
  return chemin ? urlSignee(chemin) : null;
}

const facultatif = (max: number) => z.string().trim().max(max).nullable();

const schemaEtatCivil = z.object({
  dateNaissance: z.string().regex(DATE_ISO, "Date de naissance invalide.").nullable(),
  lieuNaissance: facultatif(120),
  nationalite: facultatif(80),
  sexe: z.enum(["F", "M"]).nullable(),
  situationFamiliale: z.enum(["celibataire", "marie", "divorce", "veuf", "union_libre"]).nullable(),
  enfantsACharge: z.coerce.number().int().min(0).max(30).nullable(),
  contactUrgence: facultatif(200),
  contactUrgenceLien: z.string().refine(lienUrgenceConnu, "Lien avec le salarié inconnu.").nullable(),
  contactUrgenceTelephone: facultatif(30),
  telephone: facultatif(30),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Adresse e-mail invalide.")
    .nullable(),
  adresse: facultatif(200),
  numeroCnps: facultatif(30),
});

export async function modifierEtatCivil(employeeId: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(employeeId)) return { ok: false, message: "Salarié inconnu." };

  const analyse = schemaEtatCivil.safeParse({
    dateNaissance: texte(donnees, "dateNaissance"),
    lieuNaissance: texte(donnees, "lieuNaissance"),
    nationalite: texte(donnees, "nationalite"),
    sexe: texte(donnees, "sexe"),
    situationFamiliale: texte(donnees, "situationFamiliale"),
    enfantsACharge: texte(donnees, "enfantsACharge"),
    contactUrgence: texte(donnees, "contactUrgence"),
    contactUrgenceLien: texte(donnees, "contactUrgenceLien"),
    contactUrgenceTelephone: texte(donnees, "contactUrgenceTelephone"),
    telephone: texte(donnees, "telephone"),
    email: texte(donnees, "email"),
    adresse: texte(donnees, "adresse"),
    numeroCnps: texte(donnees, "numeroCnps"),
  });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  try {
    await modifierEtatCivilPour(session.organizationId, session.userId, employeeId, analyse.data);
    revalidatePath("/rh", "layout");
    return { ok: true, message: "État civil enregistré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}


const schemaEtatProfessionnel = z.object({
  emailProfessionnel: z
    .string()
    .trim()
    .max(120)
    .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Adresse e-mail professionnelle invalide.")
    .nullable(),
  poste: z.string({ error: "La fonction est obligatoire." }).trim().min(1, "La fonction est obligatoire.").max(120),
  service: z.string().trim().max(120).nullable(),
  superieurId: z.string().regex(UUID, "Supérieur hiérarchique inconnu.").nullable(),
  finPeriodeEssai: z.string().regex(DATE_ISO, "Date de fin d'essai invalide.").nullable(),
});

export async function modifierEtatProfessionnel(employeeId: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(employeeId)) return { ok: false, message: "Salarié inconnu." };

  const analyse = schemaEtatProfessionnel.safeParse({
    emailProfessionnel: texte(donnees, "emailProfessionnel"),
    poste: texte(donnees, "poste"),
    service: texte(donnees, "service"),
    superieurId: texte(donnees, "superieurId"),
    finPeriodeEssai: texte(donnees, "finPeriodeEssai"),
  });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  try {
    await modifierEtatProfessionnelPour(session.organizationId, session.userId, employeeId, analyse.data);
    revalidatePath("/rh", "layout");
    return { ok: true, message: "État professionnel enregistré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Photo d'identité déjà réduite par le navigateur, ou `null` pour la retirer. */
export async function changerPhoto(employeeId: string, photo: string | null): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(employeeId)) return { ok: false, message: "Salarié inconnu." };
  if (photo !== null && !photoValide(photo)) {
    return { ok: false, message: "Photo illisible ou trop lourde, même réduite." };
  }
  try {
    await changerPhotoPour(session.organizationId, session.userId, employeeId, photo);
    revalidatePath("/rh", "layout");
    return { ok: true, message: photo ? "Photo enregistrée." : "Photo retirée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
