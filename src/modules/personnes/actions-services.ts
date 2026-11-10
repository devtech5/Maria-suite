"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { ajouterServicePour, basculerServicePour, modifierServicePour, rangerPostePour } from "./referentiel-services";

export type Resultat = { ok: boolean; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Services", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function saisie(donnees: FormData) {
  return {
    libelle: String(donnees.get("libelle") ?? ""),
    code: String(donnees.get("code") ?? ""),
    pole: String(donnees.get("pole") ?? ""),
    mission: String(donnees.get("mission") ?? ""),
  };
}

/** Les services se tiennent avec le droit de gérer les salariés, comme les postes. */
export async function ajouterService(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const libelle = await ajouterServicePour(session.organizationId, session.userId, saisie(donnees));
    revalidatePath("/rh", "layout");
    return { ok: true, message: `Service « ${libelle} » ajouté.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function modifierService(serviceId: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(serviceId)) return { ok: false, message: "Service introuvable." };
  try {
    const { libelle, fiches } = await modifierServicePour(session.organizationId, session.userId, serviceId, saisie(donnees));
    revalidatePath("/rh", "layout");
    const suite = fiches === 0 ? "" : fiches === 1 ? " Une fiche salarié suit." : ` ${fiches} fiches salarié suivent.`;
    return { ok: true, message: `Service « ${libelle} » enregistré.${suite}` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function basculerService(serviceId: string, actif: boolean): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(serviceId)) return { ok: false, message: "Service introuvable." };
  try {
    await basculerServicePour(session.organizationId, session.userId, serviceId, actif);
    revalidatePath("/rh", "layout");
    return { ok: true, message: actif ? "Service remis dans la liste." : "Service retiré de la liste." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function rangerPoste(posteId: string, serviceId: string | null): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(posteId) || (serviceId !== null && !UUID.test(serviceId))) return { ok: false, message: "Poste ou service introuvable." };
  try {
    await rangerPostePour(session.organizationId, session.userId, posteId, serviceId);
    revalidatePath("/rh", "layout");
    return { ok: true, message: serviceId ? "Poste rangé dans le service." : "Poste sorti de son service." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
