"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";
import { stockageConfigure } from "@/lib/stockage";

import type { Acteur, Geste } from "./calcul";
import { TYPES_COLONNE } from "./colonnes";
import { creerColonneDans, definirValeurDans, deplacerColonneDans, modifierColonneDans, supprimerColonneDans } from "./colonnes-base";
import { appliquerGesteDans, creerTacheDans, modifierTacheDans, type Executant } from "./creation";
import { ajouterIntervenantDans, retirerIntervenantDans } from "./intervenants";
import { lireRef, lireRefs } from "./intervenants-regles";
import { texteSimple } from "./mise-en-forme";
import {
  ajouterSousTacheDans,
  cocherDansMessageDans,
  cocherSousTacheDans,
  joindreFichier,
  modifierSousTacheDans,
  publierMessageDans,
  retirerFichier,
  retirerMessageDans,
  suiviDe,
  supprimerSousTacheDans,
  urlFichierTache,
  type SuiviTache,
} from "./suivi";
import { FICHIER_MAX_OCTETS } from "./suivi-regles";
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

// ------------------------------------------------------------ suivi : sous-tâches, mises à jour, fichiers

async function enSuivi<T>(travail: (organizationId: string, qui: Acteur) => Promise<T>, message: (r: T) => string): Promise<Resultat> {
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const r = await travail(organizationId, qui);
    rafraichir();
    return { ok: true, message: message(r) };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function ajouterSousTache(tacheId: string, titre: string): Promise<Resultat> {
  if (!UUID.test(tacheId) || typeof titre !== "string") return { ok: false, message: "Sous-tâche invalide." };
  return enSuivi(
    (org, qui) => db.transaction((tx) => ajouterSousTacheDans(tx, org, tacheId, titre, qui)),
    (r) => `Sous-tâche ajoutée à ${r.numero}.`,
  );
}

export async function cocherSousTache(sousTacheId: string, faite: boolean): Promise<Resultat> {
  if (!UUID.test(sousTacheId)) return { ok: false, message: "Sous-tâche invalide." };
  return enSuivi(
    (org, qui) => db.transaction((tx) => cocherSousTacheDans(tx, org, sousTacheId, faite === true, qui)),
    (r) => (faite ? `Sous-tâche de ${r.numero} faite.` : `Sous-tâche de ${r.numero} rouverte.`),
  );
}

export async function modifierSousTache(sousTacheId: string, r: { titre?: string; responsable?: string | null; echeance?: string | null }): Promise<Resultat> {
  if (!UUID.test(sousTacheId) || typeof r !== "object" || r === null) return { ok: false, message: "Sous-tâche invalide." };
  const responsable = r.responsable === undefined ? undefined : r.responsable === null || r.responsable === "" ? null : lireRef(r.responsable);
  if (responsable === null && r.responsable) return { ok: false, message: "Responsable inconnu." };
  if (r.echeance != null && (typeof r.echeance !== "string" || !DATE_ISO.test(r.echeance))) return { ok: false, message: "Date invalide." };
  return enSuivi(
    (org, qui) =>
      db.transaction((tx) =>
        modifierSousTacheDans(tx, org, sousTacheId, { titre: typeof r.titre === "string" ? r.titre : undefined, responsable, echeance: r.echeance === undefined ? undefined : r.echeance || null }, qui),
      ),
    (x) => `Sous-tâche de ${x.numero} mise à jour.`,
  );
}

export async function supprimerSousTache(sousTacheId: string): Promise<Resultat> {
  if (!UUID.test(sousTacheId)) return { ok: false, message: "Sous-tâche invalide." };
  return enSuivi(
    (org, qui) => db.transaction((tx) => supprimerSousTacheDans(tx, org, sousTacheId, qui)),
    (r) => `Sous-tâche retirée de ${r.numero}.`,
  );
}

export async function publierMessage(tacheId: string, corps: string): Promise<Resultat> {
  if (!UUID.test(tacheId) || typeof corps !== "string" || corps.length > 20_000) return { ok: false, message: "Mise à jour invalide." };
  const refus = await refusDroit("taches.executer");
  if (refus) return { ok: false, message: refus.erreur };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const r = await db.transaction((tx) => publierMessageDans(tx, organizationId, tacheId, corps, qui));
    rafraichir();
    if (r.aPrevenir.length > 0) {
      await notifier(organizationId, r.aPrevenir, {
        categorie: "tache",
        titre: `Mise à jour de ${r.numero} : ${r.titre}`,
        corps: texteSimple(corps),
        lien: "/taches",
      });
    }
    return { ok: true, message: "Mise à jour publiée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function retirerMessage(messageId: string): Promise<Resultat> {
  if (!UUID.test(messageId)) return { ok: false, message: "Mise à jour invalide." };
  return enSuivi(
    (org, qui) => db.transaction((tx) => retirerMessageDans(tx, org, messageId, qui)),
    () => "Mise à jour retirée.",
  );
}

export async function cocherDansMessage(messageId: string, rang: number): Promise<Resultat> {
  if (!UUID.test(messageId) || !Number.isInteger(rang) || rang < 0 || rang > 500) return { ok: false, message: "Case invalide." };
  return enSuivi(
    (org, qui) => db.transaction((tx) => cocherDansMessageDans(tx, org, messageId, rang, qui)),
    () => "Case mise à jour.",
  );
}

export async function joindreFichierTache(donnees: FormData): Promise<Resultat> {
  const tacheId = donnees.get("tacheId");
  const brut = donnees.get("fichier");
  if (typeof tacheId !== "string" || !UUID.test(tacheId) || !(brut instanceof File) || brut.size === 0) return { ok: false, message: "Choisissez un fichier." };
  if (!stockageConfigure()) return { ok: false, message: "Le dépôt de fichiers n'est pas configuré (STOCKAGE_LOCAL) : la pièce ne peut pas être jointe." };
  if (brut.size > FICHIER_MAX_OCTETS) return { ok: false, message: "Fichier trop lourd : 10 Mo au plus." };
  const fichier = { nom: brut.name, typeMime: brut.type, contenu: await brut.arrayBuffer() };
  return enSuivi(
    (org, qui) => joindreFichier(org, tacheId, fichier, qui),
    (r) => `« ${brut.name} » joint à ${r.numero}.`,
  );
}

export async function retirerFichierTache(fichierId: string): Promise<Resultat> {
  if (!UUID.test(fichierId)) return { ok: false, message: "Fichier invalide." };
  return enSuivi(
    (org, qui) => retirerFichier(org, fichierId, qui),
    (r) => `Fichier retiré de ${r.numero}.`,
  );
}

/** URL signée de deux minutes, demandée au clic, jamais posée dans la page. */
export async function ouvrirFichierTache(fichierId: string): Promise<string | null> {
  if (!UUID.test(fichierId)) return null;
  if (await refusDroit("taches.consulter")) return null;
  const { organizationId, acteur: qui } = await acteur();
  try {
    return await urlFichierTache(organizationId, fichierId, qui);
  } catch {
    return null;
  }
}

/** Mises à jour, fichiers et activités d'une tâche, lus à l'ouverture de son panneau. */
export async function chargerSuivi(tacheId: string): Promise<SuiviTache | null> {
  if (!UUID.test(tacheId)) return null;
  if (await refusDroit("taches.consulter")) return null;
  const { organizationId, acteur: qui } = await acteur();
  try {
    return await suiviDe(organizationId, tacheId, qui);
  } catch {
    return null;
  }
}
