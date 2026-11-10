"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";

import { chapitre } from "./chapitres";
import { corriger, progression, tirerQuiz, type Correction } from "./regles";
import { chapitresDeLaSession, chapitresLus, enregistrerQuizPour, graineQuiz, marquerLuPour, nombreEssais } from "./requetes";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

/** Marque un chapitre lu. Seul un chapitre que la personne peut lire compte. */
export async function marquerLu(cle: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const siens = await chapitresDeLaSession();
  if (!chapitre(cle) || !siens.some((c) => c.cle === cle)) return { ok: false, message: "Chapitre introuvable." };
  await marquerLuPour(session.organizationId, session.userId, cle);
  revalidatePath("/guide", "layout");
  return { ok: true, message: "Chapitre marqué comme lu." };
}

export type ResultatQuiz = { ok: true; correction: Correction } | { ok: false; message: string };

/**
 * Corrige le quiz. Les questions sont retirées côté serveur avec la même
 * graine que l'écran (compte et numéro d'essai) : la copie ne peut ni
 * choisir ses questions ni voir les réponses avant de les rendre.
 */
export async function rendreQuiz(reponses: Record<string, number>): Promise<ResultatQuiz> {
  const session = await exigerEntreprise();
  const [siens, lus, essais] = await Promise.all([
    chapitresDeLaSession(),
    chapitresLus(session.organizationId, session.userId),
    nombreEssais(session.organizationId, session.userId),
  ]);
  const p = progression(siens, lus);
  if (p.lus < p.total) return { ok: false, message: "Lisez d'abord tous les chapitres de votre parcours." };
  const questions = tirerQuiz(siens, graineQuiz(session.userId, essais));
  if (questions.length === 0) return { ok: false, message: "Aucune question pour votre parcours." };
  const correction = corriger(questions, reponses);
  await enregistrerQuizPour(session.organizationId, session.userId, correction);
  // Pas de revalidation ici : elle rejouerait la page avec l'essai suivant,
  // donc d'autres questions, et effacerait la correction à peine affichée.
  // « Repasser le quiz » rafraîchit, lui.
  return { ok: true, correction };
}
