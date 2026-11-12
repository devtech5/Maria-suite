"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise, session as lireSessionCourante } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";
import { urlSignee } from "@/lib/stockage";
import { notifier } from "@/modules/communication/notifications";

import { validerEvenement, validerSondage, type DonneesContact, type DonneesEvenement, type DonneesSondage } from "./genres";

import {
  ajouterMembres,
  cheminPieceJointe,
  conversation,
  contactPartageable,
  conversationsDe,
  creerGroupe,
  ecrire,
  ecrireStructure,
  effacerMessage,
  marquerConversationLue,
  ouvrirConversationPrivee,
  renommerGroupe,
  repondreEvenementPour,
  retirerMembre,
  voterSondage,
  type DetailConversation,
  type ResumeConversation,
} from "./conversations";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Messagerie", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

/**
 * Interrogation régulière : la liste, et les nouveaux messages de la
 * conversation ouverte. Une session verrouillée ne redirige pas — la page
 * conservée sous le voile serait perdue — et ne reçoit rien.
 */
export async function actualiser(
  conversationId: string | null,
  depuis: string | null,
): Promise<{ conversations: ResumeConversation[]; detail: DetailConversation | null } | null> {
  const s = await lireSessionCourante();
  if (!s?.organizationId || s.verrouillee) return null;
  if (!(await peut("messagerie.utiliser"))) return null;
  const detail =
    conversationId && UUID.test(conversationId)
      ? await conversation(s.organizationId, s.userId, conversationId, depuis ? new Date(depuis) : undefined)
      : null;
  if (detail && detail.messages.length > 0 && !detail.retire) await marquerConversationLue(s.organizationId, s.userId, conversationId!);
  return { conversations: await conversationsDe(s.organizationId, s.userId), detail };
}

export async function ecrireA(autreId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("messagerie.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(autreId)) return { ok: false, message: "Destinataire inconnu." };
  try {
    const id = await ouvrirConversationPrivee(session.organizationId, session.userId, autreId);
    return { ok: true, message: "Conversation ouverte.", id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function nouveauGroupe(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("messagerie.groupe.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const nom = String(donnees.get("nom") ?? "").slice(0, 80);
  const description = String(donnees.get("description") ?? "").trim().slice(0, 300) || null;
  const membres = donnees.getAll("membres").map(String).filter((m) => UUID.test(m));
  try {
    const id = await creerGroupe(session.organizationId, session.userId, { nom, description, membres });
    await notifier(session.organizationId, membres, { categorie: "message", titre: `Vous avez été ajouté au groupe « ${nom.trim()} »`, lien: `/messagerie?c=${id}` });
    revalidatePath("/messagerie");
    return { ok: true, message: `Groupe « ${nom.trim()} » créé.`, id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function envoyer(conversationId: string, donnees: FormData): Promise<Resultat & { le?: string }> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("messagerie.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(conversationId)) return { ok: false, message: "Conversation inconnue." };
  const corps = String(donnees.get("corps") ?? "");
  const brut = donnees.get("fichier");
  const piece = brut instanceof File && brut.size > 0 ? { nom: brut.name || "fichier", typeMime: brut.type, contenu: await brut.arrayBuffer() } : null;
  try {
    const { id, le } = await ecrire(session.organizationId, session.userId, conversationId, corps, piece);
    return { ok: true, message: "Envoyé.", id, le: le.toISOString() };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

type Structure =
  | { genre: "sondage"; donnees: DonneesSondage }
  | { genre: "evenement"; donnees: DonneesEvenement }
  | { genre: "contact"; donnees: DonneesContact }
  | { erreur: string };

async function envoyerStructure(conversationId: string, fabriquer: () => Promise<Structure>): Promise<Resultat & { le?: string }> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("messagerie.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(conversationId)) return { ok: false, message: "Conversation inconnue." };
  try {
    const v = await fabriquer();
    if ("erreur" in v) return { ok: false, message: v.erreur };
    const { id, le } = await ecrireStructure(session.organizationId, session.userId, conversationId, v.genre, v.donnees);
    return { ok: true, message: "Envoyé.", id, le: le.toISOString() };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function envoyerSondage(conversationId: string, brut: { question: string; options: string[]; multiple: boolean }): Promise<Resultat & { le?: string }> {
  return envoyerStructure(conversationId, async () => {
    const v = validerSondage(brut);
    return "erreur" in v ? v : { genre: "sondage" as const, donnees: v };
  });
}

export async function envoyerEvenement(conversationId: string, brut: { titre: string; date: string; heure: string; lieu: string; description: string }): Promise<Resultat & { le?: string }> {
  return envoyerStructure(conversationId, async () => {
    const v = validerEvenement(brut);
    return "erreur" in v ? v : { genre: "evenement" as const, donnees: v };
  });
}

export async function envoyerContact(conversationId: string, membreId: string): Promise<Resultat & { le?: string }> {
  const session = await exigerEntreprise();
  return envoyerStructure(conversationId, async () => {
    if (!UUID.test(membreId)) return { erreur: "Contact inconnu." };
    const c = await contactPartageable(session.organizationId, membreId);
    return c ? { genre: "contact" as const, donnees: c } : { erreur: "Contact inconnu." };
  });
}

export async function voter(messageId: string, choix: number[]): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("messagerie.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(messageId)) return { ok: false, message: "Message inconnu." };
  try {
    await voterSondage(session.organizationId, session.userId, messageId, choix);
    return { ok: true, message: "Vote enregistré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function repondreEvenement(messageId: string, reponse: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("messagerie.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(messageId)) return { ok: false, message: "Message inconnu." };
  try {
    await repondreEvenementPour(session.organizationId, session.userId, messageId, reponse);
    return { ok: true, message: "Réponse enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function supprimerMessage(messageId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  if (!UUID.test(messageId)) return { ok: false, message: "Message inconnu." };
  try {
    await effacerMessage(session.organizationId, session.userId, messageId);
    return { ok: true, message: "Message supprimé." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** URL signée de cinq minutes, demandée au clic. */
export async function ouvrirPieceJointe(messageId: string): Promise<string | null> {
  const session = await exigerEntreprise();
  if (!UUID.test(messageId)) return null;
  const chemin = await cheminPieceJointe(session.organizationId, session.userId, messageId);
  return chemin ? urlSignee(chemin) : null;
}

export async function ajouterAuGroupe(conversationId: string, membres: string[]): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("messagerie.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(conversationId)) return { ok: false, message: "Groupe inconnu." };
  try {
    const n = await ajouterMembres(session.organizationId, session.userId, conversationId, membres.filter((m) => UUID.test(m)), await peut("messagerie.groupe.gerer"));
    await notifier(session.organizationId, membres, { categorie: "message", titre: "Vous avez été ajouté à un groupe de discussion", lien: `/messagerie?c=${conversationId}` });
    return { ok: true, message: `${n} membre${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function retirerDuGroupe(conversationId: string, membre: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  if (!UUID.test(conversationId) || !UUID.test(membre)) return { ok: false, message: "Choix invalide." };
  try {
    await retirerMembre(session.organizationId, session.userId, conversationId, membre, await peut("messagerie.groupe.gerer"));
    return { ok: true, message: membre === session.userId ? "Vous avez quitté le groupe." : "Membre retiré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function renommer(conversationId: string, nom: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  if (!UUID.test(conversationId)) return { ok: false, message: "Groupe inconnu." };
  try {
    await renommerGroupe(session.organizationId, session.userId, conversationId, nom.slice(0, 80), await peut("messagerie.groupe.gerer"));
    return { ok: true, message: "Groupe renommé." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
