"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { appliquerGestePour, type Resultat } from "./geste";
import { droitDuGeste, estTypeFiche, FICHES, type Geste } from "./registre";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GESTES: readonly Geste[] = ["desactiver", "reactiver", "supprimer"];

/**
 * Mettre en off, réactiver ou supprimer une fiche du registre.
 *
 * L'écran cache le bouton, l'action refuse : le droit se vérifie ici, quel
 * que soit l'écran qui l'appelle — une action serveur est une route HTTP.
 */
export async function agirSurFiche(type: string, id: string, geste: Geste): Promise<Resultat> {
  const session = await exigerEntreprise();
  if (!estTypeFiche(type) || !UUID.test(id) || !GESTES.includes(geste)) return { ok: false, message: "Fiche introuvable." };

  const refus = await refusDroit(droitDuGeste(type, geste));
  if (refus) return { ok: false, message: refus.erreur };

  try {
    const resultat = await appliquerGestePour(session.organizationId, session.userId, type, id, geste);
    if (resultat.ok) for (const chemin of FICHES[type].chemins) revalidatePath(chemin, "layout");
    return resultat;
  } catch (erreur) {
    console.error(`Fiches : ${type}.${geste} refusé`, erreur);
    return { ok: false, message: "L'opération n'a pas abouti. Réessayez." };
  }
}
