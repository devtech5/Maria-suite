"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";

import type { Acteur, Geste } from "./calcul";
import { appliquerGesteDans, creerTacheDans, modifierTacheDans, type Executant } from "./creation";
import { notifier } from "@/modules/communication/notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

async function acteur(): Promise<{ organizationId: string; acteur: Acteur }> {
  const session = await exigerEntreprise();
  return {
    organizationId: session.organizationId,
    acteur: { userId: session.userId, attribue: await peut("taches.attribuer") },
  };
}

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Tâches : opération refusée", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function rafraichir() {
  revalidatePath("/taches", "layout");
  revalidatePath("/");
}

const texte = (donnees: FormData, champ: string) => {
  const v = donnees.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

const schemaTache = z.object({
  titre: z.string().trim().min(3, "Indiquez ce qu'il faut faire.").max(160, "Titre trop long : 160 caractères au plus."),
  description: z.string().max(2000).optional(),
  priorite: z.enum(["basse", "normale", "haute", "urgente"]),
  echeance: z.string().regex(DATE_ISO).optional(),
  executant: z
    .string()
    .regex(/^(?:[eu]:[0-9a-f-]{36})?$/i, "Exécutant inconnu.")
    .optional()
    .transform((v): Executant | null => {
      if (!v) return null;
      const id = v.slice(2);
      if (!UUID.test(id)) return null;
      return v.startsWith("e:") ? { employeId: id } : { userId: id };
    }),
});

function lireTache(donnees: FormData) {
  return schemaTache.safeParse({
    titre: donnees.get("titre") ?? "",
    description: texte(donnees, "description"),
    priorite: donnees.get("priorite") ?? "normale",
    echeance: texte(donnees, "echeance"),
    executant: texte(donnees, "executant"),
  });
}

export async function creerTache(donnees: FormData): Promise<Resultat> {
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  const { organizationId, acteur: qui } = await acteur();

  const analyse = lireTache(donnees);
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  try {
    const { numero, assigneeUserId, pourAutrui } = await db.transaction((tx) => creerTacheDans(tx, organizationId, analyse.data, qui));
    rafraichir();
    // Un salarié sans compte n'a pas de cloche : c'est l'auteur qui suit sa tâche.
    if (assigneeUserId !== qui.userId) {
      await notifier(organizationId, [assigneeUserId], {
        categorie: "tache",
        titre: `Nouvelle tâche ${numero} : ${analyse.data.titre}`,
        corps: analyse.data.echeance ? `À faire avant le ${analyse.data.echeance}.` : null,
        lien: "/taches",
      });
    }
    return { ok: true, message: pourAutrui ? `Tâche ${numero} créée et attribuée.` : `Tâche ${numero} ajoutée à votre liste.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function modifierTache(tacheId: string, donnees: FormData): Promise<Resultat> {
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(tacheId)) return { ok: false, message: "Tâche introuvable." };
  const { organizationId, acteur: qui } = await acteur();

  const analyse = lireTache(donnees);
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  try {
    const { numero } = await db.transaction((tx) =>
      modifierTacheDans(tx, organizationId, tacheId, analyse.data, qui),
    );
    rafraichir();
    return { ok: true, message: `Tâche ${numero} mise à jour.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

const MESSAGES: Record<Geste, (numero: string) => string> = {
  demarrer: (n) => `${n} en cours.`,
  terminer: (n) => `${n} terminée.`,
  rouvrir: (n) => `${n} rouverte.`,
  annuler: (n) => `${n} annulée.`,
};

export async function agirSurTache(tacheId: string, geste: Geste, texteLibre?: string): Promise<Resultat> {
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(tacheId) || !(geste in MESSAGES)) return { ok: false, message: "Geste inconnu." };
  const { organizationId, acteur: qui } = await acteur();

  try {
    const { numero } = await db.transaction((tx) =>
      appliquerGesteDans(tx, organizationId, tacheId, geste, qui, texteLibre?.slice(0, 2000) ?? null),
    );
    rafraichir();
    return { ok: true, message: MESSAGES[geste](numero) };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
