import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { droitsActifs } from "@/lib/droits/garde";
import { modulesOuverts } from "@/lib/modules/garde";
import { groupesVisibles } from "@/lib/navigation";
import { newId } from "@/lib/ids";

import { CHAPITRES } from "./chapitres";
import { chapitresPour, type Chapitre, type Correction } from "./regles";
import { guideLectures, guideQuiz } from "./schema";

/**
 * Guide d'utilisation, côté base. La progression seulement : le contenu est
 * dans le code.
 */

/** Les chapitres de la session courante : même filtre que le menu. */
export async function chapitresDeLaSession(): Promise<Chapitre[]> {
  const entrees = groupesVisibles(await droitsActifs(), modulesOuverts()).flatMap((g) => g.modules.map((m) => m.href));
  return chapitresPour(CHAPITRES, entrees);
}

export async function chapitresLus(organizationId: string, userId: string): Promise<Set<string>> {
  const lignes = await db
    .select({ chapitre: guideLectures.chapitre })
    .from(guideLectures)
    .where(and(eq(guideLectures.organizationId, organizationId), eq(guideLectures.userId, userId)));
  return new Set(lignes.map((l) => l.chapitre));
}

/** Marque un chapitre lu ; la première lecture fait foi. */
export async function marquerLuPour(organizationId: string, userId: string, chapitre: string): Promise<void> {
  await db
    .insert(guideLectures)
    .values({ id: newId(), organizationId, userId, chapitre })
    .onConflictDoNothing({ target: [guideLectures.organizationId, guideLectures.userId, guideLectures.chapitre] });
}

export interface PassageQuiz {
  bonnes: number;
  total: number;
  reussi: boolean;
  passeLe: Date;
}

/** Le meilleur passage réussi s'il y en a un, sinon le dernier passage. */
export async function resultatQuiz(organizationId: string, userId: string): Promise<PassageQuiz | null> {
  const [ligne] = await db
    .select({ bonnes: guideQuiz.bonnes, total: guideQuiz.total, reussi: guideQuiz.reussi, passeLe: guideQuiz.passeLe })
    .from(guideQuiz)
    .where(and(eq(guideQuiz.organizationId, organizationId), eq(guideQuiz.userId, userId)))
    .orderBy(desc(guideQuiz.reussi), desc(guideQuiz.passeLe))
    .limit(1);
  return ligne ?? null;
}

export async function enregistrerQuizPour(organizationId: string, userId: string, correction: Correction, maintenant = new Date()): Promise<void> {
  await db.insert(guideQuiz).values({
    id: newId(),
    organizationId,
    userId,
    bonnes: correction.bonnes,
    total: correction.total,
    reussi: correction.reussi,
    reponses: correction.details.map(({ cle, donnee, bonne }) => ({ cle, donnee, bonne })),
    passeLe: maintenant,
  });
}

export interface LigneSuivi {
  userId: string;
  nom: string;
  lus: number;
  derniereLecture: Date | null;
  reussiLe: Date | null;
  meilleur: { bonnes: number; total: number } | null;
}

/** Où en est chaque compte actif : chapitres lus, quiz réussi ou meilleur essai. */
export async function suiviGuide(organizationId: string): Promise<LigneSuivi[]> {
  const lignes = await db
    .select({
      userId: users.id,
      nom: users.fullName,
      lus: sql<number>`(select count(*)::int from guide_lectures l where l.organization_id = ${organizationId} and l.user_id = ${users.id})`,
      derniereLecture: sql<Date | null>`(select max(l.lu_le) from guide_lectures l where l.organization_id = ${organizationId} and l.user_id = ${users.id})`,
      reussiLe: sql<Date | null>`(select min(q.passe_le) from guide_quiz q where q.organization_id = ${organizationId} and q.user_id = ${users.id} and q.reussi)`,
      meilleur: sql<{ bonnes: number; total: number } | null>`(select json_build_object('bonnes', q.bonnes, 'total', q.total) from guide_quiz q where q.organization_id = ${organizationId} and q.user_id = ${users.id} order by q.reussi desc, q.bonnes * 1000 / greatest(q.total, 1) desc, q.passe_le desc limit 1)`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), eq(users.status, "actif")))
    .orderBy(users.fullName);
  // Les sous-requêtes rendent des chaînes pour les dates sous certains pilotes.
  return lignes.map((l) => ({
    ...l,
    derniereLecture: l.derniereLecture ? new Date(l.derniereLecture) : null,
    reussiLe: l.reussiLe ? new Date(l.reussiLe) : null,
  }));
}

/** Passages déjà faits : la graine du prochain quiz, qui change à chaque essai. */
export async function nombreEssais(organizationId: string, userId: string): Promise<number> {
  const [ligne] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guideQuiz)
    .where(and(eq(guideQuiz.organizationId, organizationId), eq(guideQuiz.userId, userId)));
  return ligne?.n ?? 0;
}

/** Graine du quiz d'un compte : stable tant qu'il n'a pas rendu sa copie. */
export function graineQuiz(userId: string, essais: number): string {
  return `${userId}:${essais}`;
}
