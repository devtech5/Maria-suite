import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import type { NoteAnnexe } from "@/lib/comptabilite/notes";
import { aReprendre, NOTES_A_REDIGER, noteRedigee, verifierRedaction, type Redaction } from "@/lib/comptabilite/notes-redigees";
import { newId } from "@/lib/ids";

import { notesAnnexesRedigees } from "./schema";

export interface RedactionEnregistree extends Redaction {
  /** Dernière modification, ISO. */
  modifieeLe: string;
}

/** Les notes rédigées d'un exercice. */
export async function redactionsDe(organizationId: string, exercice: string): Promise<RedactionEnregistree[]> {
  const lignes = await db
    .select({ numero: notesAnnexesRedigees.numero, texte: notesAnnexesRedigees.texte, neant: notesAnnexesRedigees.neant, modifieeLe: notesAnnexesRedigees.updatedAt })
    .from(notesAnnexesRedigees)
    .where(and(eq(notesAnnexesRedigees.organizationId, organizationId), eq(notesAnnexesRedigees.exercice, exercice), isNull(notesAnnexesRedigees.deletedAt)));
  return lignes.map((l) => ({ numero: l.numero, texte: l.texte, neant: l.neant, modifieeLe: new Date(l.modifieeLe).toISOString() }));
}

/** Rédige ou réécrit une note : texte, ou « néant ». Chaque version se trace. */
export async function enregistrerRedactionPour(organizationId: string, userId: string, exercice: string, saisie: Redaction): Promise<void> {
  if (!/^\d{4}$/.test(exercice)) throw new Error("Exercice invalide.");
  const refus = verifierRedaction(saisie);
  if (refus) throw new Error(refus);
  const texte = saisie.neant ? "" : saisie.texte.trim();
  await db
    .insert(notesAnnexesRedigees)
    .values({ id: newId(), organizationId, exercice, numero: saisie.numero, texte, neant: saisie.neant, redigeParUserId: userId })
    .onConflictDoUpdate({
      target: [notesAnnexesRedigees.organizationId, notesAnnexesRedigees.exercice, notesAnnexesRedigees.numero],
      set: { texte, neant: saisie.neant, redigeParUserId: userId, deletedAt: null, updatedAt: new Date(), version: sql`${notesAnnexesRedigees.version} + 1` },
    });
  await tracerPour(organizationId, userId, {
    action: "note_annexe.rediger",
    entite: "note_annexe",
    apres: { exercice, numero: saisie.numero, neant: saisie.neant, longueur: texte.length },
  });
}

/**
 * Reprend les notes de l'exercice précédent qui n'ont pas encore de rédaction
 * cette année : les méthodes et les sûretés changent rarement d'un an sur
 * l'autre. Rend le nombre de notes reprises.
 */
export async function reprendrePrecedentPour(organizationId: string, userId: string, exercice: string): Promise<number> {
  if (!/^\d{4}$/.test(exercice)) throw new Error("Exercice invalide.");
  const [precedentes, actuelles] = await Promise.all([redactionsDe(organizationId, String(Number(exercice) - 1)), redactionsDe(organizationId, exercice)]);
  const reprises = aReprendre(precedentes, actuelles);
  if (reprises.length === 0) return 0;
  await db
    .insert(notesAnnexesRedigees)
    .values(reprises.map((r) => ({ id: newId(), organizationId, exercice, numero: r.numero, texte: r.texte, neant: r.neant, redigeParUserId: userId })))
    .onConflictDoNothing();
  await tracerPour(organizationId, userId, { action: "note_annexe.reprendre", entite: "note_annexe", apres: { exercice, numeros: reprises.map((r) => r.numero) } });
  return reprises.length;
}

/** Les notes rédigées de l'exercice, telles qu'elles s'impriment dans la liasse. */
export async function notesRedigeesPourLiasse(organizationId: string, exercice: string): Promise<NoteAnnexe[]> {
  const redactions = new Map((await redactionsDe(organizationId, exercice)).map((r) => [r.numero, r]));
  return NOTES_A_REDIGER.map((n) => noteRedigee(n.numero, redactions.get(n.numero)));
}
