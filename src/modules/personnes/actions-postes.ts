"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { ajouterPostePour, basculerPostePour, renommerPostePour } from "./referentiel-postes";

export type Resultat = { ok: boolean; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Postes de travail", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

/** Les postes se tiennent avec le droit de gérer les salariés : c'est là qu'ils se choisissent. */
export async function ajouterPoste(donnees: FormData): Promise<Resultat & { libelle?: string }> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const libelle = await ajouterPostePour(session.organizationId, session.userId, String(donnees.get("libelle") ?? ""));
    revalidatePath("/rh", "layout");
    return { ok: true, message: `« ${libelle} » ajouté à la liste des postes.`, libelle };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function renommerPoste(posteId: string, libelle: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(posteId)) return { ok: false, message: "Poste introuvable." };
  try {
    const { libelle: retenu, fiches } = await renommerPostePour(session.organizationId, session.userId, posteId, libelle);
    revalidatePath("/rh", "layout");
    const suite = fiches === 0 ? "" : fiches === 1 ? " Une fiche salarié suit." : ` ${fiches} fiches salarié suivent.`;
    return { ok: true, message: `Poste renommé en « ${retenu} ».${suite}` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function basculerPoste(posteId: string, actif: boolean): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(posteId)) return { ok: false, message: "Poste introuvable." };
  try {
    await basculerPostePour(session.organizationId, session.userId, posteId, actif);
    revalidatePath("/rh", "layout");
    return { ok: true, message: actif ? "Poste remis dans la liste." : "Poste retiré de la liste." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
