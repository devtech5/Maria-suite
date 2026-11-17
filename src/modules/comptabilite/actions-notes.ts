"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { enregistrerRedactionPour, reprendrePrecedentPour } from "./notes-redigees";

export type Resultat = { ok: boolean; message: string };

/** Les notes se rédigent avec le droit qui prépare la liasse : clôturer l'exercice. */
const DROIT = "comptabilite.exercice.cloturer" as const;

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Notes annexes", erreur);
  return "L'enregistrement n'a pas abouti. Réessayez.";
}

export async function redigerNote(exercice: string, numero: string, texte: string, neant: boolean): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(DROIT);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    await enregistrerRedactionPour(session.organizationId, session.userId, String(exercice), { numero: String(numero), texte: String(texte), neant: Boolean(neant) });
    revalidatePath("/comptabilite/etats", "layout");
    return { ok: true, message: neant ? `Note ${numero} déclarée néant.` : `Note ${numero} enregistrée.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function reprendreNotesPrecedentes(exercice: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(DROIT);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const nombre = await reprendrePrecedentPour(session.organizationId, session.userId, String(exercice));
    revalidatePath("/comptabilite/etats", "layout");
    return nombre === 0
      ? { ok: true, message: "Rien à reprendre : aucune note de l'exercice précédent qui manque cette année." }
      : { ok: true, message: `${nombre} note${nombre > 1 ? "s" : ""} reprise${nombre > 1 ? "s" : ""} de ${Number(exercice) - 1}, à relire.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
