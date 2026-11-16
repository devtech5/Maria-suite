"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { enregistrerReglagesCalculsPour } from "./donnees";
import { verifierReglages } from "./regles";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

/**
 * Enregistre les ratios de l'entreprise. Le formulaire envoie un JSON
 * d'entiers, relu en entier par `verifierReglages` : une valeur hors bornes
 * est refusée, jamais remplacée en silence.
 */
export async function enregistrerReglagesCalculs(json: string, atteste: boolean): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("calculs.regler");
  if (refus) return { ok: false, message: refus.erreur };
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    return { ok: false, message: "Saisie illisible. Rechargez la page." };
  }
  const v = verifierReglages(brut);
  if (!v.ok) return v;
  try {
    await enregistrerReglagesCalculsPour(s.organizationId, s.userId, v.valeurs, atteste);
  } catch (e) {
    console.error("Calculs", e);
    return { ok: false, message: "L'enregistrement n'a pas abouti. Réessayez." };
  }
  revalidatePath("/calculs", "layout");
  return { ok: true, message: atteste ? "Ratios enregistrés et attestés." : "Ratios enregistrés, à vérifier." };
}
