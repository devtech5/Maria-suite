import "server-only";

import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { utilisateursAyantDroit } from "@/lib/droits/destinataires";
import type { Droit } from "@/lib/droits/catalogue";
import { newId } from "@/lib/ids";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";

import { notifications, type NotificationInterne } from "./schema";

export interface NouvelleNotification {
  categorie: string;
  titre: string;
  corps?: string | null;
  lien?: string | null;
}

/**
 * Pose une notification dans la cloche de chaque destinataire.
 *
 * Jamais bloquant : une notification ratée ne doit pas faire échouer la
 * dépense ou la tâche qui l'a provoquée. L'échec se dit en console.
 */
export async function notifier(organizationId: string, userIds: readonly string[], n: NouvelleNotification): Promise<void> {
  const uniques = [...new Set(userIds)];
  if (uniques.length === 0) return;
  try {
    await db.insert(notifications).values(
      uniques.map((userId) => ({
        id: newId(),
        organizationId,
        userId,
        categorie: n.categorie,
        titre: n.titre.slice(0, 200),
        corps: n.corps?.slice(0, 1000) ?? null,
        lien: n.lien ?? null,
      })),
    );
  } catch (erreur) {
    console.error("Notification non posée", erreur);
  }
}

/**
 * Prévient ceux qui peuvent agir : tous les comptes qui détiennent `droit`,
 * sauf l'auteur du geste — on ne se notifie pas sa propre demande.
 */
export async function notifierDetenteurs(
  organizationId: string,
  droit: Droit,
  n: NouvelleNotification,
  sauf?: string,
): Promise<void> {
  try {
    const destinataires = (await utilisateursAyantDroit(organizationId, droit)).filter((u) => u !== sauf);
    await notifier(organizationId, destinataires, n);
  } catch (erreur) {
    console.error("Destinataires de notification introuvables", erreur);
  }
}

export async function notificationsDe(organizationId: string, userId: string, limite = 30, filtres?: FiltresListe): Promise<NotificationInterne[]> {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.userId, userId),
        isNull(notifications.deletedAt),
        // Filtrés en base : la page s'arrête aux cent dernières.
        filtres && motsDans([notifications.titre, notifications.corps], motsRecherche(filtres.q)),
        filtres && dansPeriodeSql(notifications.createdAt, filtres.periode),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limite);
}

export async function nombreNonLues(organizationId: string, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.userId, userId),
        isNull(notifications.lueLe),
        isNull(notifications.deletedAt),
      ),
    );
  return r?.n ?? 0;
}

/** Marque lues des notifications — celles du destinataire seulement. */
export async function marquerLues(organizationId: string, userId: string, ids?: readonly string[]): Promise<void> {
  if (ids && ids.length === 0) return;
  await db
    .update(notifications)
    .set({ lueLe: new Date() })
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.userId, userId),
        isNull(notifications.lueLe),
        ...(ids ? [inArray(notifications.id, [...ids])] : []),
      ),
    );
}
