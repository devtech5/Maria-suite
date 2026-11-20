import "server-only";

import { and, count, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { estDoublon } from "@/lib/erreurs-pg";
import { newId } from "@/lib/ids";
import { prochainNumero } from "@/lib/sequences";
import { missions } from "@/modules/missions/schema";
import { projets } from "@/modules/projets/schema";

import { validerReponse, type QuestionEnquete } from "./calcul";
import { enquetes, reponsesEnquete, type StatutEnquete } from "./schema";

export interface NouvelleEnquete {
  titre: string;
  introduction?: string | null;
  projetId?: string | null;
  questions: QuestionEnquete[];
  objectif?: number | null;
  lienPublic?: boolean;
}

async function verifierProjet(organizationId: string, projetId: string | null | undefined) {
  if (!projetId) return;
  const [p] = await db
    .select({ id: projets.id })
    .from(projets)
    .where(and(eq(projets.id, projetId), eq(projets.organizationId, organizationId), isNull(projets.deletedAt)));
  if (!p) throw new Error("Projet introuvable.");
}

/** Crée une enquête en brouillon, numérotée « ENQ-2026-001 ». */
export async function creerEnquetePour(
  organizationId: string,
  saisie: NouvelleEnquete,
  userId: string,
  maintenant = new Date(),
): Promise<{ id: string; numero: string }> {
  if (saisie.titre.trim().length < 3) throw new Error("Donnez un titre à l'enquête.");
  if (saisie.questions.length === 0) throw new Error("Le questionnaire n'a aucune question.");
  await verifierProjet(organizationId, saisie.projetId);

  return db.transaction(async (tx) => {
    const annee = String(maintenant.getFullYear());
    const numero = await prochainNumero(tx, organizationId, { cle: "enquete", prefix: `ENQ-${annee}-`, padding: 3, periode: annee });
    const id = newId();
    await tx.insert(enquetes).values({
      id,
      organizationId,
      numero,
      titre: saisie.titre.trim(),
      introduction: saisie.introduction?.trim() || null,
      projetId: saisie.projetId ?? null,
      questions: saisie.questions,
      objectif: saisie.objectif ?? null,
      lienPublic: saisie.lienPublic ?? true,
      userId,
    });
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "enquete.creer",
      entityType: "enquete",
      entityId: id,
      after: { numero, titre: saisie.titre, questions: saisie.questions.length },
    });
    return { id, numero };
  });
}

/**
 * Remplace le questionnaire. Refusé dès la première réponse : changer une
 * question après coup changerait le sens des réponses déjà reçues.
 */
export async function modifierQuestionsPour(
  organizationId: string,
  userId: string,
  enqueteId: string,
  questions: QuestionEnquete[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(reponsesEnquete)
      .where(and(eq(reponsesEnquete.enqueteId, enqueteId), eq(reponsesEnquete.organizationId, organizationId), isNull(reponsesEnquete.deletedAt)));
    if (n > 0) throw new Error("L'enquête a déjà des réponses : ses questions ne se modifient plus. Dupliquez-la pour en changer.");
    const [maj] = await tx
      .update(enquetes)
      .set({ questions, updatedAt: new Date(), version: sql`${enquetes.version} + 1` })
      .where(and(isNull(enquetes.deletedAt), eq(enquetes.id, enqueteId), eq(enquetes.organizationId, organizationId)))
      .returning({ numero: enquetes.numero });
    if (!maj) throw new Error("Enquête introuvable.");
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "enquete.modifier",
      entityType: "enquete",
      entityId: enqueteId,
      after: { numero: maj.numero, questions: questions.length },
    });
  });
}

/**
 * Ouvre, ferme ou rouvre une enquête. Un brouillon ne reçoit pas de réponse ;
 * une enquête close non plus — c'est ce qui fige les résultats d'une campagne.
 */
export async function changerStatutPour(
  organizationId: string,
  userId: string,
  enqueteId: string,
  statut: Exclude<StatutEnquete, "brouillon">,
): Promise<void> {
  const maintenant = new Date();
  const [maj] = await db
    .update(enquetes)
    .set({
      statut,
      ...(statut === "ouverte" ? { ouverteLe: maintenant, closeLe: null } : { closeLe: maintenant }),
      updatedAt: maintenant,
      version: sql`${enquetes.version} + 1`,
    })
    .where(and(eq(enquetes.id, enqueteId), eq(enquetes.organizationId, organizationId), isNull(enquetes.deletedAt)))
    .returning({ numero: enquetes.numero });
  if (!maj) throw new Error("Enquête introuvable.");
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: statut === "ouverte" ? "enquete.ouvrir" : "enquete.fermer",
    entityType: "enquete",
    entityId: enqueteId,
    after: { numero: maj.numero },
  });
}

/** Coupe ou rétablit le lien public, sans toucher à la collecte de terrain. */
export async function basculerLienPour(organizationId: string, userId: string, enqueteId: string, actif: boolean): Promise<void> {
  const [maj] = await db
    .update(enquetes)
    .set({ lienPublic: actif, updatedAt: new Date(), version: sql`${enquetes.version} + 1` })
    .where(and(isNull(enquetes.deletedAt), eq(enquetes.id, enqueteId), eq(enquetes.organizationId, organizationId)))
    .returning({ numero: enquetes.numero });
  if (!maj) throw new Error("Enquête introuvable.");
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: actif ? "enquete.lien_activer" : "enquete.lien_couper",
    entityType: "enquete",
    entityId: enqueteId,
    after: { numero: maj.numero },
  });
}

export interface NouvelleReponse {
  /** Produit par l'appareil : un renvoi ne double pas la réponse. */
  id: string;
  enqueteId: string;
  canal: "terrain" | "lien";
  saisie: Record<string, unknown>;
  repondant?: string | null;
  missionId?: string | null;
  latitudeMicro?: number | null;
  longitudeMicro?: number | null;
  priseLe?: Date;
}

/**
 * Enregistre une réponse.
 *
 * L'enquête doit être ouverte ; par le lien public, son lien doit l'être
 * aussi. Les valeurs sont revalidées ici contre le questionnaire, quel que
 * soit le canal : un formulaire public se trafique depuis le navigateur.
 */
export async function enregistrerReponsePour(
  organizationId: string,
  reponse: NouvelleReponse,
  userId: string | null,
): Promise<{ deja: boolean }> {
  const [enquete] = await db
    .select({ statut: enquetes.statut, lienPublic: enquetes.lienPublic, questions: enquetes.questions })
    .from(enquetes)
    .where(and(eq(enquetes.id, reponse.enqueteId), eq(enquetes.organizationId, organizationId), isNull(enquetes.deletedAt)));
  if (!enquete) throw new Error("Enquête introuvable.");

  const [deja] = await db
    .select({ id: reponsesEnquete.id })
    .from(reponsesEnquete)
    .where(and(eq(reponsesEnquete.id, reponse.id), eq(reponsesEnquete.organizationId, organizationId)));
  if (deja) return { deja: true };

  if (enquete.statut !== "ouverte") throw new Error("Cette enquête n'est pas ouverte aux réponses.");
  if (reponse.canal === "lien" && !enquete.lienPublic) throw new Error("Cette enquête ne reçoit plus de réponse en ligne.");

  const analyse = validerReponse(enquete.questions, reponse.saisie);
  if ("erreur" in analyse) throw new Error(analyse.erreur);
  if (Object.keys(analyse.valeurs).length === 0) throw new Error("La réponse est vide.");

  if (reponse.missionId) {
    const [m] = await db
      .select({ id: missions.id })
      .from(missions)
      .where(and(eq(missions.id, reponse.missionId), eq(missions.organizationId, organizationId), isNull(missions.deletedAt)));
    if (!m) throw new Error("Mission introuvable.");
  }

  const valeurs = {
    id: reponse.id,
    organizationId,
    enqueteId: reponse.enqueteId,
    canal: reponse.canal,
    valeurs: analyse.valeurs,
    repondant: reponse.repondant?.trim().slice(0, 120) || null,
    userId,
    missionId: reponse.missionId ?? null,
    latitudeMicro: reponse.latitudeMicro ?? null,
    longitudeMicro: reponse.longitudeMicro ?? null,
    priseLe: reponse.priseLe ?? new Date(),
  };
  try {
    await db.insert(reponsesEnquete).values(valeurs);
  } catch (erreur) {
    // Le même envoi, arrivé deux fois au même instant : le second trouve la
    // réponse posée par le premier.
    if (estDoublon(erreur)) return { deja: true };
    throw erreur;
  }
  return { deja: false };
}
