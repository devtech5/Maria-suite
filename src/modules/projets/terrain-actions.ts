"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { stockageConfigure, urlSignee } from "@/lib/stockage";

import {
  changerRoleMembrePour,
  confierMembrePour,
  creerRelevePour,
  equipeDuProjet,
  examinerRelevePour,
  preuvesAvecContexte,
  projetDuTerrain,
  retirerMembrePour,
  type FichierPreuve,
} from "./terrain";
import { NATURES_PREUVE, PREUVES_MAX, lirePosition, peutExaminer, peutGererEquipe, peutSaisirPour, type Acteur, type NaturePreuve } from "./terrain-regles";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texte = (d: FormData, c: string): string => {
  const v = d.get(c);
  return typeof v === "string" ? v.trim() : "";
};

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 260) return message;
  console.error("Terrain", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function rafraichir(projetId?: string) {
  revalidatePath("/terrain", "layout");
  revalidatePath("/projets", "layout");
  if (projetId) revalidatePath(`/terrain/${projetId}`);
}

/** Qui agit, sur quel projet, avec quels droits : une seule lecture pour toutes les actions. */
async function contexte(projetId: string) {
  const session = await exigerEntreprise();
  if (!UUID.test(projetId)) return { session, projet: null, equipe: [], acteur: null as Acteur | null };
  const [projet, equipe, gestionnaire] = await Promise.all([projetDuTerrain(session.organizationId, projetId), equipeDuProjet(session.organizationId, projetId), peut("projet.gerer")]);
  return { session, projet, equipe, acteur: { userId: session.userId, gestionnaire } as Acteur };
}

// ------------------------------------------------------------------ équipe

/** Confier du personnel au projet : le chef de projet, ou l'encadrement. */
export async function confierMembre(projetId: string, d: FormData): Promise<Resultat> {
  const { session, projet, acteur } = await contexte(projetId);
  if (!projet || !acteur) return { ok: false, message: "Projet introuvable." };
  if (!peutGererEquipe(acteur, projet)) return { ok: false, message: "Seul le chef de projet confie du personnel à ce projet." };
  try {
    await confierMembrePour(session.organizationId, session.userId, projetId, {
      role: texte(d, "role"),
      origine: texte(d, "origine"),
      personne: texte(d, "personne"),
      nom: texte(d, "nom"),
      telephone: texte(d, "telephone"),
      organisme: texte(d, "organisme"),
    });
    rafraichir(projetId);
    return { ok: true, message: "Personnel confié au projet." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

async function surMembre(projetId: string, membreId: string, travail: (organizationId: string, userId: string) => Promise<string>): Promise<Resultat> {
  const { session, projet, acteur } = await contexte(projetId);
  if (!projet || !acteur || !UUID.test(membreId)) return { ok: false, message: "Projet introuvable." };
  if (!peutGererEquipe(acteur, projet)) return { ok: false, message: "Seul le chef de projet règle l'équipe de ce projet." };
  try {
    const message = await travail(session.organizationId, session.userId);
    rafraichir(projetId);
    return { ok: true, message };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function changerRoleMembre(projetId: string, membreId: string, role: string): Promise<Resultat> {
  return surMembre(projetId, membreId, async (org, user) => {
    await changerRoleMembrePour(org, user, membreId, role);
    return role === "superviseur" ? "Superviseur nommé." : "Rôle enregistré.";
  });
}

export async function retirerMembre(projetId: string, membreId: string): Promise<Resultat> {
  return surMembre(projetId, membreId, async (org, user) => {
    await retirerMembrePour(org, user, membreId);
    return "Membre retiré du projet.";
  });
}

// ------------------------------------------------------------------ relevés

const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

/**
 * Lit les preuves jointes : `photo` (prise par la caméra) et `capture`
 * (image d'écran). Tout est contrôlé avant le premier dépôt.
 */
async function lirePreuves(d: FormData): Promise<FichierPreuve[] | string> {
  const lues: { nature: NaturePreuve; fichier: File }[] = [];
  for (const nature of NATURES_PREUVE) {
    for (const v of d.getAll(nature)) if (v instanceof File && v.size > 0) lues.push({ nature, fichier: v });
  }
  if (lues.length === 0) return [];
  if (!stockageConfigure()) return "Le dépôt de fichiers n'est pas configuré : les preuves ne peuvent pas être enregistrées.";
  if (lues.length > PREUVES_MAX) return `${PREUVES_MAX} preuves au plus par relevé.`;
  const total = lues.reduce((s, l) => s + l.fichier.size, 0);
  if (total > TAILLE_MAX) return `Envoi trop lourd : ${Math.ceil(total / 1024 / 1024)} Mo pour 10 Mo au plus.`;
  for (const l of lues) if (!TYPES_IMAGE.has(l.fichier.type)) return `« ${l.fichier.name} » : format non accepté, image seulement.`;
  return Promise.all(lues.map(async (l) => ({ nature: l.nature, nom: l.fichier.name, typeMime: l.fichier.type, contenu: await l.fichier.arrayBuffer() })));
}

/**
 * Enregistre un relevé de terrain. Position GPS et preuves sont exigées :
 * c'est la traçabilité. L'heure de prise vient de l'appareil, l'heure de
 * réception est celle du serveur : les deux se gardent.
 */
export async function enregistrerReleve(projetId: string, d: FormData): Promise<Resultat> {
  const { session, projet, equipe, acteur } = await contexte(projetId);
  if (!projet || !acteur) return { ok: false, message: "Projet introuvable." };
  const membreId = texte(d, "membreId");
  const cible = membreId ? equipe.find((m) => m.id === membreId) : equipe.find((m) => m.userId === session.userId);
  if (!cible) return { ok: false, message: "Vous n'êtes pas en poste sur ce projet." };
  if (!peutSaisirPour(acteur, projet, equipe, { userId: cible.userId, origine: cible.origine })) return { ok: false, message: "Vous ne pouvez pas relever pour cette personne." };

  const preuves = await lirePreuves(d);
  if (typeof preuves === "string") return { ok: false, message: preuves };
  const position = lirePosition(texte(d, "latitude"), texte(d, "longitude"), texte(d, "precision"));
  const priseLe = new Date(texte(d, "priseLe"));
  try {
    await creerRelevePour(
      session.organizationId,
      session.userId,
      projetId,
      {
        membreId: cible.id,
        libelle: texte(d, "libelle"),
        note: texte(d, "note"),
        avancement: texte(d, "avancement"),
        position: "erreur" in position ? null : position,
        priseLe: Number.isNaN(priseLe.getTime()) ? new Date() : priseLe,
        fichiers: preuves,
      },
      equipe,
    );
    rafraichir(projetId);
    return { ok: true, message: "Relevé enregistré : le superviseur et le chef de projet sont prévenus." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Valider un relevé, ou le renvoyer avec un motif : le superviseur, le chef de projet, l'encadrement. */
export async function examinerReleve(projetId: string, releveId: string, decision: string, commentaire: string): Promise<Resultat> {
  const { session, projet, equipe, acteur } = await contexte(projetId);
  if (!projet || !acteur || !UUID.test(releveId)) return { ok: false, message: "Projet introuvable." };
  if (!peutExaminer(acteur, projet, equipe)) return { ok: false, message: "Seuls le superviseur et le chef de projet examinent les relevés." };
  try {
    await examinerRelevePour(session.organizationId, session.userId, releveId, decision, commentaire);
    rafraichir(projetId);
    return { ok: true, message: decision === "valide" ? "Relevé validé." : "Relevé renvoyé pour être refait." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/**
 * URL signées des preuves, demandées au clic ou à l'affichage, jamais posées
 * dans le HTML : une adresse signée resterait valable pour qui retrouve la
 * page en cache. Une preuve ne se signe que pour qui peut examiner le projet,
 * ou pour le compte qui l'a saisie — jamais pour un autre agent.
 */
export async function signerPreuves(ids: string[]): Promise<Record<string, string>> {
  const session = await exigerEntreprise();
  const valides = ids.filter((i) => UUID.test(i)).slice(0, 100);
  const lignes = await preuvesAvecContexte(session.organizationId, valides);
  const gestionnaire = await peut("projet.gerer");
  const acteur: Acteur = { userId: session.userId, gestionnaire };
  const projets = new Map<string, boolean>();
  for (const projetId of new Set(lignes.map((l) => l.projetId))) {
    const [projet, equipe] = await Promise.all([projetDuTerrain(session.organizationId, projetId), equipeDuProjet(session.organizationId, projetId)]);
    projets.set(projetId, Boolean(projet && peutExaminer(acteur, projet, equipe)));
  }
  const permises = lignes.filter((l) => projets.get(l.projetId) || l.saisiParUserId === session.userId);
  const signees = await Promise.all(permises.map(async (l) => [l.id, await urlSignee(l.chemin, 120)] as const));
  return Object.fromEntries(signees.filter((s): s is readonly [string, string] => s[1] !== null));
}
