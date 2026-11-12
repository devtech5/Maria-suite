import "server-only";

import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { tracerPour } from "@/lib/audit";
import { utilisateursAyantDroit } from "@/lib/droits/destinataires";
import { newId } from "@/lib/ids";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";

import {
  corpsDuGenre,
  depouillerEvenement,
  depouillerSondage,
  choixValides,
  REPONSES_EVENEMENT,
  type DonneesContact,
  type DonneesEvenement,
  type DonneesSondage,
  type Genre,
  type ReponseEvenement,
  type ResultatEvenement,
  type ResultatSondage,
} from "./genres";
import { conversations, messages, participants, reponsesMessages } from "./schema";

/**
 * Messagerie interne.
 *
 * Toute lecture et toute écriture vérifient que la personne PARTICIPE à la
 * conversation : l'identifiant d'une conversation vient du navigateur, et le
 * deviner ne doit rien donner. Un participant retiré garde la lecture de ce
 * qui a été dit avant son départ, rien de ce qui suit.
 */

export interface MembreEchangeable {
  userId: string;
  nom: string;
}

/** Les comptes de l'entreprise à qui l'on peut écrire : ceux qui ont la messagerie. */
export async function membresEchangeables(organizationId: string, sauf?: string): Promise<MembreEchangeable[]> {
  const ids = (await utilisateursAyantDroit(organizationId, "messagerie.utiliser")).filter((id) => id !== sauf);
  if (ids.length === 0) return [];
  return db.select({ userId: users.id, nom: users.fullName }).from(users).where(inArray(users.id, ids)).orderBy(asc(users.fullName));
}

async function participation(organizationId: string, conversationId: string, userId: string) {
  const [p] = await db
    .select({ role: participants.role, retireLe: participants.retireLe, type: conversations.type })
    .from(participants)
    .innerJoin(conversations, eq(conversations.id, participants.conversationId))
    .where(
      and(
        eq(participants.conversationId, conversationId),
        eq(participants.userId, userId),
        eq(conversations.organizationId, organizationId),
        isNull(conversations.deletedAt),
      ),
    );
  return p ?? null;
}

/**
 * Conversation privée avec quelqu'un : la retrouve si elle existe, la crée
 * sinon. Deux ouvertures simultanées se rejoignent sur la contrainte d'unicité.
 */
export async function ouvrirConversationPrivee(organizationId: string, userId: string, autreId: string): Promise<string> {
  if (autreId === userId) throw new Error("On ne s'écrit pas à soi-même.");
  const possibles = await utilisateursAyantDroit(organizationId, "messagerie.utiliser");
  if (!possibles.includes(autreId)) throw new Error("Cette personne n'a pas accès à la messagerie.");

  const cle = [userId, autreId].sort().join(":");
  const id = newId();
  await db.transaction(async (tx) => {
    const creees = await tx
      .insert(conversations)
      .values({ id, organizationId, type: "privee", clePrivee: cle, creePar: userId })
      .onConflictDoNothing()
      .returning({ id: conversations.id });
    if (creees.length > 0) {
      await tx.insert(participants).values([
        { id: newId(), organizationId, conversationId: id, userId, role: "membre" },
        { id: newId(), organizationId, conversationId: id, userId: autreId, role: "membre" },
      ]);
    }
  });
  const [existante] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.clePrivee, cle)));
  return existante.id;
}

export async function creerGroupe(
  organizationId: string,
  userId: string,
  saisie: { nom: string; description?: string | null; membres: string[] },
): Promise<string> {
  const nom = saisie.nom.trim();
  if (nom.length < 2) throw new Error("Nommez le groupe.");
  const possibles = new Set(await utilisateursAyantDroit(organizationId, "messagerie.utiliser"));
  const membres = [...new Set(saisie.membres)].filter((m) => m !== userId && possibles.has(m));
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(conversations).values({ id, organizationId, type: "groupe", nom, description: saisie.description ?? null, creePar: userId });
    await tx.insert(participants).values([
      { id: newId(), organizationId, conversationId: id, userId, role: "admin" },
      ...membres.map((m) => ({ id: newId(), organizationId, conversationId: id, userId: m, role: "membre" as const })),
    ]);
  });
  await tracerPour(organizationId, userId, { action: "groupe.creer", entite: "conversation", entiteId: id, apres: { nom, membres: membres.length + 1 } });
  return id;
}

/** Administrateur du groupe, ou détenteur du droit de gérer les groupes. */
async function exigerAdmin(organizationId: string, conversationId: string, userId: string, gereLesGroupes: boolean) {
  const p = await participation(organizationId, conversationId, userId);
  const [c] = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)));
  if (!c) throw new Error("Conversation introuvable.");
  if (c.type !== "groupe") throw new Error("Une conversation privée n'a pas de membres à gérer.");
  if (!gereLesGroupes && !(p && !p.retireLe && p.role === "admin")) throw new Error("Seul un administrateur du groupe peut le faire.");
}

export async function ajouterMembres(organizationId: string, userId: string, conversationId: string, membres: string[], gereLesGroupes: boolean): Promise<number> {
  await exigerAdmin(organizationId, conversationId, userId, gereLesGroupes);
  const possibles = new Set(await utilisateursAyantDroit(organizationId, "messagerie.utiliser"));
  const valides = [...new Set(membres)].filter((m) => possibles.has(m));
  for (const m of valides) {
    await db
      .insert(participants)
      .values({ id: newId(), organizationId, conversationId, userId: m, role: "membre", luJusquAu: new Date() })
      .onConflictDoUpdate({ target: [participants.conversationId, participants.userId], set: { retireLe: null, updatedAt: new Date() } });
  }
  await tracerPour(organizationId, userId, { action: "groupe.ajouter", entite: "conversation", entiteId: conversationId, apres: { membres: valides.length } });
  return valides.length;
}

export async function retirerMembre(organizationId: string, userId: string, conversationId: string, membre: string, gereLesGroupes: boolean): Promise<void> {
  if (membre !== userId) await exigerAdmin(organizationId, conversationId, userId, gereLesGroupes);
  const retires = await db
    .update(participants)
    // Le départ solde la lecture : un groupe quitté ne laisse pas de non-lus.
    .set({ retireLe: new Date(), luJusquAu: new Date(), updatedAt: new Date() })
    .where(and(eq(participants.conversationId, conversationId), eq(participants.userId, membre), isNull(participants.retireLe), eq(participants.organizationId, organizationId)))
    .returning({ id: participants.id });
  if (retires.length === 0) throw new Error("Ce membre ne fait pas partie du groupe.");
  await tracerPour(organizationId, userId, { action: membre === userId ? "groupe.quitter" : "groupe.retirer", entite: "conversation", entiteId: conversationId });
}

export async function renommerGroupe(organizationId: string, userId: string, conversationId: string, nom: string, gereLesGroupes: boolean): Promise<void> {
  await exigerAdmin(organizationId, conversationId, userId, gereLesGroupes);
  if (nom.trim().length < 2) throw new Error("Nommez le groupe.");
  await db.update(conversations).set({ nom: nom.trim(), updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

export interface PieceJointe {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

export const TYPES_PIECE_JOINTE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/**
 * Écrit dans une conversation. Le fichier part AVANT l'insertion, comme pour
 * les documents ; l'auteur a lu son propre message.
 */
export async function ecrire(
  organizationId: string,
  userId: string,
  conversationId: string,
  corps: string | null,
  piece: PieceJointe | null,
): Promise<{ id: string; le: Date }> {
  const p = await participation(organizationId, conversationId, userId);
  if (!p || p.retireLe) throw new Error("Vous ne participez pas à cette conversation.");
  const texte = corps?.trim() || null;
  if (!texte && !piece) throw new Error("Message vide.");
  if (texte && texte.length > 4000) throw new Error("Message trop long : 4 000 caractères au plus.");

  const id = newId();
  let chemin: string | null = null;
  if (piece) {
    const ext = TYPES_PIECE_JOINTE[piece.typeMime];
    if (!ext) throw new Error("Format non accepté : photo, vidéo, PDF, Word ou Excel.");
    if (piece.contenu.byteLength > 10 * 1024 * 1024) throw new Error("Fichier trop lourd : 10 Mo au plus.");
    chemin = cheminDe(organizationId, id, ext);
    const depot = await deposer({ chemin, contenu: piece.contenu, typeMime: piece.typeMime });
    if (!depot.ok) throw new Error(depot.raison);
  }

  const le = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(messages).values({
        id,
        organizationId,
        conversationId,
        auteurId: userId,
        corps: texte,
        chemin,
        nomFichier: piece ? piece.nom.slice(0, 200) : null,
        typeMime: piece?.typeMime ?? null,
        tailleOctets: piece?.contenu.byteLength ?? null,
        createdAt: le,
      });
      await tx.update(conversations).set({ dernierMessageLe: le }).where(eq(conversations.id, conversationId));
      await tx.update(participants).set({ luJusquAu: le }).where(and(eq(participants.conversationId, conversationId), eq(participants.userId, userId)));
    });
  } catch (erreur) {
    if (chemin) await supprimer(chemin);
    throw erreur;
  }
  return { id, le };
}

/** Retire son propre message : il reste une ligne « message supprimé », le fichier part. */
export async function effacerMessage(organizationId: string, userId: string, messageId: string): Promise<void> {
  const [m] = await db
    .select({ chemin: messages.chemin, auteurId: messages.auteurId })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.organizationId, organizationId), isNull(messages.deletedAt)));
  if (!m) throw new Error("Message introuvable.");
  if (m.auteurId !== userId) throw new Error("On ne supprime que ses propres messages.");
  await db
    .update(messages)
    .set({ deletedAt: new Date(), corps: null, chemin: null, nomFichier: null, typeMime: null, tailleOctets: null })
    .where(eq(messages.id, messageId));
  if (m.chemin) await supprimer(m.chemin);
}

export async function marquerConversationLue(organizationId: string, userId: string, conversationId: string): Promise<void> {
  await db
    .update(participants)
    .set({ luJusquAu: new Date() })
    .where(and(eq(participants.organizationId, organizationId), eq(participants.conversationId, conversationId), eq(participants.userId, userId), isNull(participants.retireLe)));
}

export interface ResumeConversation {
  id: string;
  type: "privee" | "groupe";
  nom: string;
  apercu: string | null;
  dernierLe: string | null;
  nonLus: number;
  membres: number;
  retire: boolean;
  /** Le dernier message est de soi : la liste l'annonce d'une coche, comme WhatsApp. */
  dernierDeMoi: boolean;
  /** Prénom de l'auteur du dernier message, pour l'aperçu d'un groupe. */
  dernierAuteur: string | null;
}

/** Les conversations de la personne, la plus récente en tête, avec leurs non-lus. */
export async function conversationsDe(organizationId: string, userId: string): Promise<ResumeConversation[]> {
  const lignes = await db.execute<{
    id: string;
    type: "privee" | "groupe";
    nom: string | null;
    autre: string | null;
    apercu: string | null;
    piece: string | null;
    efface: boolean | null;
    dernier_le: string | null;
    non_lus: string;
    membres: string;
    retire_le: string | null;
    dernier_auteur_id: string | null;
    dernier_auteur: string | null;
  }>(sql`
    select
      c.id,
      c.type,
      c.nom,
      (select u.full_name from participants p2 join users u on u.id = p2.user_id
        where p2.conversation_id = c.id and p2.user_id <> ${userId} limit 1) as autre,
      dm.corps as apercu,
      dm.nom_fichier as piece,
      (dm.deleted_at is not null) as efface,
      c.dernier_message_le as dernier_le,
      (select count(*) from messages m
        where m.conversation_id = c.id and m.deleted_at is null
          and m.auteur_id is distinct from ${userId}
          and (p.lu_jusqu_au is null or m.created_at > p.lu_jusqu_au)
          and (p.retire_le is null or m.created_at <= p.retire_le)) as non_lus,
      (select count(*) from participants p3 where p3.conversation_id = c.id and p3.retire_le is null) as membres,
      p.retire_le,
      dm.auteur_id as dernier_auteur_id,
      (select u.full_name from users u where u.id = dm.auteur_id) as dernier_auteur
    from participants p
      join conversations c on c.id = p.conversation_id
      left join lateral (
        select corps, nom_fichier, deleted_at, auteur_id from messages
        where conversation_id = c.id
          and (p.retire_le is null or created_at <= p.retire_le)
        order by created_at desc limit 1
      ) dm on true
    where p.user_id = ${userId}
      and c.organization_id = ${organizationId}
      and c.deleted_at is null
    order by coalesce(c.dernier_message_le, c.created_at) desc
  `);
  return lignes.map((l) => ({
    id: l.id,
    type: l.type,
    nom: l.type === "groupe" ? (l.nom ?? "Groupe") : (l.autre ?? "Conversation"),
    apercu: l.efface ? "Message supprimé" : l.apercu ?? (l.piece ? `📎 ${l.piece}` : null),
    dernierLe: l.dernier_le ? new Date(l.dernier_le).toISOString() : null,
    nonLus: Number(l.non_lus),
    membres: Number(l.membres),
    retire: l.retire_le !== null,
    dernierDeMoi: l.dernier_auteur_id === userId,
    dernierAuteur: l.dernier_auteur ? l.dernier_auteur.split(/\s+/)[0] : null,
  }));
}

export async function totalNonLus(organizationId: string, userId: string): Promise<number> {
  return (await conversationsDe(organizationId, userId)).reduce((s, c) => s + c.nonLus, 0);
}

export interface MessageAffiche {
  id: string;
  auteurId: string | null;
  auteur: string;
  corps: string | null;
  piece: { nom: string; typeMime: string; taille: number } | null;
  genre: Genre;
  sondage: (DonneesSondage & { resultat: ResultatSondage }) | null;
  evenement: (DonneesEvenement & { resultat: ResultatEvenement }) | null;
  contact: DonneesContact | null;
  efface: boolean;
  le: string;
  /** Autres participants actifs qui l'ont lu. */
  luPar: number;
  /** Autres participants actifs. */
  autres: number;
}

export interface DetailConversation {
  id: string;
  type: "privee" | "groupe";
  nom: string;
  description: string | null;
  estAdmin: boolean;
  retire: boolean;
  membres: { userId: string; nom: string; role: "admin" | "membre" }[];
  messages: MessageAffiche[];
}

/**
 * Une conversation et ses derniers messages — ou seulement ceux postérieurs à
 * `depuis`, pour l'interrogation régulière.
 */
export async function conversation(organizationId: string, userId: string, conversationId: string, depuis?: Date): Promise<DetailConversation | null> {
  const p = await participation(organizationId, conversationId, userId);
  if (!p) return null;

  const [c] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const membres = await db
    .select({ userId: participants.userId, nom: users.fullName, role: participants.role, luJusquAu: participants.luJusquAu, retireLe: participants.retireLe })
    .from(participants)
    .innerJoin(users, eq(users.id, participants.userId))
    .where(eq(participants.conversationId, conversationId))
    .orderBy(asc(users.fullName));

  const conditions = [eq(messages.conversationId, conversationId)];
  if (depuis) conditions.push(gt(messages.createdAt, depuis));
  if (p.retireLe) conditions.push(sql`${messages.createdAt} <= ${p.retireLe.toISOString()}`);
  const lignes = (
    await db
      .select({ m: messages, auteur: users.fullName })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.auteurId))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(depuis ? 200 : 100)
  ).reverse();

  const structures = lignes.filter(({ m }) => m.genre !== "texte" && !m.deletedAt).map(({ m }) => m.id);
  const reponses = structures.length
    ? await db
        .select({ messageId: reponsesMessages.messageId, userId: reponsesMessages.userId, valeur: reponsesMessages.valeur })
        .from(reponsesMessages)
        .where(and(inArray(reponsesMessages.messageId, structures), isNull(reponsesMessages.deletedAt)))
    : [];

  const autresActifs = membres.filter((m) => m.userId !== userId && !m.retireLe);
  const autre = c.type === "privee" ? membres.find((m) => m.userId !== userId) : null;

  return {
    id: c.id,
    type: c.type,
    nom: c.type === "groupe" ? (c.nom ?? "Groupe") : (autre?.nom ?? "Conversation"),
    description: c.description,
    estAdmin: membres.some((m) => m.userId === userId && m.role === "admin" && !m.retireLe),
    retire: p.retireLe !== null,
    membres: membres.filter((m) => !m.retireLe).map((m) => ({ userId: m.userId, nom: m.nom, role: m.role })),
    messages: lignes.map(({ m, auteur }) => ({
      id: m.id,
      auteurId: m.auteurId,
      auteur: auteur ?? "Ancien membre",
      corps: m.corps,
      piece: m.nomFichier && m.typeMime ? { nom: m.nomFichier, typeMime: m.typeMime, taille: m.tailleOctets ?? 0 } : null,
      genre: (m.genre as Genre) ?? "texte",
      sondage:
        m.genre === "sondage" && m.donnees
          ? { ...(m.donnees as unknown as DonneesSondage), resultat: depouillerSondage((m.donnees as unknown as DonneesSondage).options, reponses.filter((r) => r.messageId === m.id), userId) }
          : null,
      evenement:
        m.genre === "evenement" && m.donnees
          ? { ...(m.donnees as unknown as DonneesEvenement), resultat: depouillerEvenement(reponses.filter((r) => r.messageId === m.id), userId) }
          : null,
      contact: m.genre === "contact" && m.donnees ? (m.donnees as unknown as DonneesContact) : null,
      efface: m.deletedAt !== null,
      le: m.createdAt.toISOString(),
      luPar: autresActifs.filter((a) => a.luJusquAu && a.luJusquAu >= m.createdAt).length,
      autres: autresActifs.length,
    })),
  };
}

/** Clé du fichier joint, si la personne participe à la conversation du message. */
export async function cheminPieceJointe(organizationId: string, userId: string, messageId: string): Promise<string | null> {
  const [m] = await db
    .select({ chemin: messages.chemin, conversationId: messages.conversationId, le: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.organizationId, organizationId), isNull(messages.deletedAt)));
  if (!m?.chemin) return null;
  const p = await participation(organizationId, m.conversationId, userId);
  if (!p || (p.retireLe && m.le > p.retireLe)) return null;
  return m.chemin;
}

/**
 * Écrit un sondage, un événement ou une carte de contact. Les données ont
 * déjà été validées par `genres.ts` ; le `corps` en garde le résumé.
 */
export async function ecrireStructure(
  organizationId: string,
  userId: string,
  conversationId: string,
  genre: Exclude<Genre, "texte">,
  donnees: DonneesSondage | DonneesEvenement | DonneesContact,
): Promise<{ id: string; le: Date }> {
  const p = await participation(organizationId, conversationId, userId);
  if (!p || p.retireLe) throw new Error("Vous ne participez pas à cette conversation.");
  const id = newId();
  const le = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      id,
      organizationId,
      conversationId,
      auteurId: userId,
      corps: corpsDuGenre(genre, donnees),
      genre,
      donnees: donnees as unknown as Record<string, unknown>,
      createdAt: le,
    });
    await tx.update(conversations).set({ dernierMessageLe: le }).where(eq(conversations.id, conversationId));
    await tx.update(participants).set({ luJusquAu: le }).where(and(eq(participants.conversationId, conversationId), eq(participants.userId, userId)));
  });
  return { id, le };
}

/** Un membre de l'entreprise que l'on peut partager en carte de contact. */
export async function contactPartageable(organizationId: string, userId: string): Promise<DonneesContact | null> {
  const m = (await membresEchangeables(organizationId)).find((x) => x.userId === userId);
  return m ? { userId: m.userId, nom: m.nom } : null;
}

async function messageStructure(organizationId: string, userId: string, messageId: string, genre: "sondage" | "evenement") {
  const [m] = await db
    .select({ conversationId: messages.conversationId, genre: messages.genre, donnees: messages.donnees })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.organizationId, organizationId), isNull(messages.deletedAt)));
  if (!m || m.genre !== genre || !m.donnees) throw new Error("Message introuvable.");
  const p = await participation(organizationId, m.conversationId, userId);
  if (!p || p.retireLe) throw new Error("Vous ne participez plus à cette conversation.");
  return m.donnees;
}

/** Remplace les réponses de la personne à un sondage : vide, elle retire son vote. */
export async function voterSondage(organizationId: string, userId: string, messageId: string, choix: unknown): Promise<void> {
  const sondage = (await messageStructure(organizationId, userId, messageId, "sondage")) as unknown as DonneesSondage;
  const indices = choixValides(choix, sondage.options.length, sondage.multiple);
  if ("erreur" in indices) throw new Error(indices.erreur);
  await db.transaction(async (tx) => {
    await tx.delete(reponsesMessages).where(and(eq(reponsesMessages.messageId, messageId), eq(reponsesMessages.userId, userId)));
    if (indices.length > 0) {
      await tx.insert(reponsesMessages).values(indices.map((i) => ({ organizationId, messageId, userId, valeur: String(i) })));
    }
  });
}

/** Une seule réponse par personne à un événement ; la même, renvoyée, la retire. */
export async function repondreEvenementPour(organizationId: string, userId: string, messageId: string, reponse: unknown): Promise<ReponseEvenement | null> {
  await messageStructure(organizationId, userId, messageId, "evenement");
  if (typeof reponse !== "string" || !(REPONSES_EVENEMENT as readonly string[]).includes(reponse)) throw new Error("Réponse inconnue.");
  const [actuelle] = await db
    .select({ valeur: reponsesMessages.valeur })
    .from(reponsesMessages)
    .where(and(eq(reponsesMessages.messageId, messageId), eq(reponsesMessages.userId, userId)));
  await db.transaction(async (tx) => {
    await tx.delete(reponsesMessages).where(and(eq(reponsesMessages.messageId, messageId), eq(reponsesMessages.userId, userId)));
    if (actuelle?.valeur !== reponse) await tx.insert(reponsesMessages).values({ organizationId, messageId, userId, valeur: reponse });
  });
  return actuelle?.valeur === reponse ? null : (reponse as ReponseEvenement);
}
