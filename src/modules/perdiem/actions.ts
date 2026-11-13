"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { ajouterBaremePour, annulerPour, attribuerPour, modifierBaremePour, payerPour, supprimerBaremePour } from "./requetes";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texte = (d: FormData, c: string): string => {
  const v = d.get(c);
  return typeof v === "string" ? v.trim() : "";
};

/** Un entier de francs saisi au clavier : « 15 000 » recopié d'un tableur passe. Illisible : -1, refusé plus loin. */
const nombre = (d: FormData, c: string): number => {
  const brut = texte(d, c).replace(/[\s  ]/g, "");
  return /^\d+$/.test(brut) ? Number(brut) : -1;
};

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Perdiem", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

/** Tout geste sur les perdiem demande `perdiem.gerer` : le rôle de la comptable. */
async function operer(travail: (organizationId: string, userId: string) => Promise<string>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("perdiem.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const message = await travail(session.organizationId, session.userId);
    revalidatePath("/perdiem", "layout");
    return { ok: true, message };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

const idValide = (id: string) => UUID.test(id);

export async function ajouterBareme(d: FormData): Promise<Resultat> {
  return operer(async (org, user) => {
    await ajouterBaremePour(org, user, { libelle: texte(d, "libelle"), montantJournalier: nombre(d, "montant"), notes: texte(d, "notes") });
    return "Ligne ajoutée au barème.";
  });
}

export async function modifierBareme(id: string, d: FormData): Promise<Resultat> {
  return operer(async (org, user) => {
    if (!idValide(id)) throw new Error("Ligne du barème introuvable.");
    await modifierBaremePour(org, user, id, { libelle: texte(d, "libelle"), montantJournalier: nombre(d, "montant"), notes: texte(d, "notes"), actif: d.get("actif") === "on" });
    return "Ligne du barème modifiée : les perdiem déjà attribués gardent leur montant.";
  });
}

export async function supprimerBareme(id: string): Promise<Resultat> {
  return operer(async (org, user) => {
    if (!idValide(id)) throw new Error("Ligne du barème introuvable.");
    const issue = await supprimerBaremePour(org, user, id);
    return issue === "supprimee" ? "Ligne supprimée." : "Ligne retirée du barème : elle a déjà servi, ses perdiem gardent leur montant.";
  });
}

export async function attribuerPerdiem(d: FormData): Promise<Resultat> {
  return operer(async (org, user) => {
    const employeeId = texte(d, "employeeId");
    const baremeId = texte(d, "baremeId");
    const missionId = texte(d, "missionId");
    if (!idValide(employeeId)) throw new Error("Choisissez le collaborateur.");
    if (!idValide(baremeId)) throw new Error("Choisissez la ligne du barème.");
    const { numero, montantTotal } = await attribuerPour(org, user, {
      employeeId,
      baremeId,
      jours: nombre(d, "jours"),
      missionId: idValide(missionId) ? missionId : null,
      debut: texte(d, "debut") || null,
      motif: texte(d, "motif"),
    });
    return `${numero} attribué : ${montantTotal.toLocaleString("fr-FR")} F.`;
  });
}

export async function payerPerdiem(id: string, d: FormData): Promise<Resultat> {
  return operer(async (org, user) => {
    if (!idValide(id)) throw new Error("Attribution introuvable.");
    await payerPour(org, user, id, { payeLe: texte(d, "payeLe"), moyen: texte(d, "moyen"), reference: texte(d, "reference") });
    return "Perdiem payé.";
  });
}

export async function annulerPerdiem(id: string, motif: string): Promise<Resultat> {
  return operer(async (org, user) => {
    if (!idValide(id)) throw new Error("Attribution introuvable.");
    await annulerPour(org, user, id, motif);
    return "Perdiem annulé.";
  });
}
