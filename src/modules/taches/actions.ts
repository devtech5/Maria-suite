"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";

import type { Acteur, Geste } from "./calcul";
import { TYPES_COLONNE } from "./colonnes";
import { creerColonneDans, definirValeurDans, deplacerColonneDans, modifierColonneDans, supprimerColonneDans } from "./colonnes-base";
import { appliquerGesteDans, creerTacheDans, modifierTacheDans, type Executant } from "./creation";
import { ajouterIntervenantDans, retirerIntervenantDans } from "./intervenants";
import { lireRef, lireRefs } from "./intervenants-regles";
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
  dateDebut: z.string().regex(DATE_ISO).optional(),
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
    dateDebut: texte(donnees, "dateDebut"),
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
    const intervenants = lireRefs(donnees.getAll("intervenants"));
    const { numero, assigneeUserId, pourAutrui, aPrevenir } = await db.transaction((tx) =>
      creerTacheDans(tx, organizationId, { ...analyse.data, intervenants }, qui),
    );
    rafraichir();
    // Un collaborateur sans compte n'a pas de cloche : c'est l'auteur qui suit sa tâche.
    if (assigneeUserId !== qui.userId) {
      await notifier(organizationId, [assigneeUserId], {
        categorie: "tache",
        titre: `Nouvelle tâche ${numero} : ${analyse.data.titre}`,
        corps: analyse.data.echeance ? `À faire avant le ${analyse.data.echeance}.` : null,
        lien: "/taches",
      });
    }
    if (aPrevenir.length > 0) {
      await notifier(organizationId, aPrevenir, {
        categorie: "tache",
        titre: `Vous intervenez sur ${numero} : ${analyse.data.titre}`,
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

// ------------------------------------------------------------ colonnes personnalisées

const schemaOptions = z
  .object({
    unite: z.string().max(40).optional(),
    etiquettes: z
      .array(z.object({ cle: z.string().max(10), libelle: z.string().max(200), couleur: z.string().max(10) }))
      .max(50)
      .optional(),
  })
  .optional();

const schemaNouvelleColonne = z.object({
  libelle: z.string().max(200),
  type: z.enum(TYPES_COLONNE),
  options: schemaOptions,
});

/** Les colonnes sont celles de toute l'entreprise : seul qui attribue les compose. */
async function gestionnaire(): Promise<{ organizationId: string; userId: string } | { refus: string }> {
  const refus = await refusDroit("taches.attribuer");
  if (refus) return { refus: refus.erreur };
  const session = await exigerEntreprise();
  return { organizationId: session.organizationId, userId: session.userId };
}

export async function creerColonne(saisie: z.input<typeof schemaNouvelleColonne>): Promise<Resultat> {
  const qui = await gestionnaire();
  if ("refus" in qui) return { ok: false, message: qui.refus };
  const analyse = schemaNouvelleColonne.safeParse(saisie);
  if (!analyse.success) return { ok: false, message: "Colonne invalide." };
  try {
    await db.transaction((tx) => creerColonneDans(tx, qui.organizationId, analyse.data, qui.userId));
    rafraichir();
    return { ok: true, message: `Colonne « ${analyse.data.libelle.trim()} » ajoutée.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function modifierColonne(colonneId: string, saisie: { libelle: string; options?: z.input<typeof schemaOptions> }): Promise<Resultat> {
  const qui = await gestionnaire();
  if ("refus" in qui) return { ok: false, message: qui.refus };
  const analyse = z.object({ libelle: z.string().max(200), options: schemaOptions }).safeParse(saisie);
  if (!UUID.test(colonneId) || !analyse.success) return { ok: false, message: "Colonne invalide." };
  try {
    await db.transaction((tx) => modifierColonneDans(tx, qui.organizationId, colonneId, analyse.data, qui.userId));
    rafraichir();
    return { ok: true, message: "Colonne enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function supprimerColonne(colonneId: string): Promise<Resultat> {
  const qui = await gestionnaire();
  if ("refus" in qui) return { ok: false, message: qui.refus };
  if (!UUID.test(colonneId)) return { ok: false, message: "Colonne invalide." };
  try {
    const { libelle } = await db.transaction((tx) => supprimerColonneDans(tx, qui.organizationId, colonneId, qui.userId));
    rafraichir();
    return { ok: true, message: `Colonne « ${libelle} » retirée.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function deplacerColonne(colonneId: string, sens: -1 | 1): Promise<Resultat> {
  const qui = await gestionnaire();
  if ("refus" in qui) return { ok: false, message: qui.refus };
  if (!UUID.test(colonneId) || (sens !== -1 && sens !== 1)) return { ok: false, message: "Colonne invalide." };
  try {
    await db.transaction((tx) => deplacerColonneDans(tx, qui.organizationId, colonneId, sens, qui.userId));
    rafraichir();
    return { ok: true, message: "Colonne déplacée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function definirValeur(tacheId: string, colonneId: string, valeur: string | null): Promise<Resultat> {
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(tacheId) || !UUID.test(colonneId) || (valeur !== null && (typeof valeur !== "string" || valeur.length > 2000))) {
    return { ok: false, message: "Valeur invalide." };
  }
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { numero, libelle } = await db.transaction((tx) => definirValeurDans(tx, organizationId, tacheId, colonneId, valeur, qui));
    rafraichir();
    return { ok: true, message: `${numero} : ${libelle} enregistré.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

// ------------------------------------------------------------ intervenants

/** Ajoute un collaborateur (`e:…`) ou un intervenant (`w:…`) à la tâche ; un collaborateur avec un compte est prévenu. */
export async function ajouterIntervenant(tacheId: string, valeur: string): Promise<Resultat> {
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  const ref = lireRef(valeur);
  if (!UUID.test(tacheId) || !ref) return { ok: false, message: "Intervenant inconnu." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const r = await db.transaction((tx) => ajouterIntervenantDans(tx, organizationId, tacheId, ref, qui));
    rafraichir();
    if (r.aPrevenir) {
      await notifier(organizationId, [r.aPrevenir], {
        categorie: "tache",
        titre: `Vous intervenez sur ${r.numero} : ${r.titre}`,
        corps: null,
        lien: "/taches",
      });
    }
    return { ok: true, message: r.ajoute ? `${r.nom} intervient sur ${r.numero}.` : `${r.nom} intervient déjà sur ${r.numero}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function retirerIntervenant(tacheId: string, valeur: string): Promise<Resultat> {
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  const ref = lireRef(valeur);
  if (!UUID.test(tacheId) || !ref) return { ok: false, message: "Intervenant inconnu." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { numero } = await db.transaction((tx) => retirerIntervenantDans(tx, organizationId, tacheId, ref, qui));
    rafraichir();
    return { ok: true, message: `Intervenant retiré de ${numero}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
