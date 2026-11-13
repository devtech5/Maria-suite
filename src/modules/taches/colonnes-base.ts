import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";

import type { Acteur } from "./calcul";
import {
  COLONNES_MAX,
  deplacer,
  estTypeColonne,
  normaliserLibelle,
  normaliserOptions,
  normaliserValeur,
  type OptionsColonne,
  type TypeColonne,
} from "./colonnes";
import { estIntervenant } from "./intervenants";
import { taches, tachesColonnes, tachesValeurs } from "./schema";

export interface ColonneVue {
  id: string;
  libelle: string;
  type: TypeColonne;
  options: OptionsColonne;
}

async function tracer(
  tx: Transaction,
  organizationId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  apres: Record<string, unknown> | null,
  avant?: Record<string, unknown> | null,
) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType, entityId, before: avant ?? null, after: apres });
}

/** Colonnes en service, de gauche à droite. Le filtre sur l'entreprise est posé ici. */
export async function listerColonnes(organizationId: string): Promise<ColonneVue[]> {
  const lignes = await db
    .select({ id: tachesColonnes.id, libelle: tachesColonnes.libelle, type: tachesColonnes.type, options: tachesColonnes.options })
    .from(tachesColonnes)
    .where(and(eq(tachesColonnes.organizationId, organizationId), isNull(tachesColonnes.deletedAt)))
    .orderBy(asc(tachesColonnes.rang), asc(tachesColonnes.createdAt));
  return lignes.flatMap((l) => (estTypeColonne(l.type) ? [{ ...l, type: l.type, options: l.options ?? {} }] : []));
}

/** Valeurs posées sur ces tâches : `tache → colonne → valeur`. */
export async function valeursDe(organizationId: string, tacheIds: string[]): Promise<Map<string, Record<string, string>>> {
  const parTache = new Map<string, Record<string, string>>();
  if (tacheIds.length === 0) return parTache;
  const lignes = await db
    .select({ tacheId: tachesValeurs.tacheId, colonneId: tachesValeurs.colonneId, valeur: tachesValeurs.valeur })
    .from(tachesValeurs)
    .where(
      and(
        eq(tachesValeurs.organizationId, organizationId),
        inArray(tachesValeurs.tacheId, tacheIds),
        isNull(tachesValeurs.deletedAt),
        sql`${tachesValeurs.valeur} is not null`,
      ),
    );
  for (const l of lignes) {
    if (l.valeur === null) continue;
    parTache.set(l.tacheId, { ...(parTache.get(l.tacheId) ?? {}), [l.colonneId]: l.valeur });
  }
  return parTache;
}

async function colonneVerrouillee(tx: Transaction, organizationId: string, colonneId: string) {
  const [c] = await tx
    .select()
    .from(tachesColonnes)
    .where(and(eq(tachesColonnes.id, colonneId), eq(tachesColonnes.organizationId, organizationId), isNull(tachesColonnes.deletedAt)))
    .for("update");
  if (!c || !estTypeColonne(c.type)) throw new Error("Cette colonne n'existe plus.");
  return { ...c, type: c.type };
}

export interface SaisieColonne {
  libelle: string;
  type: TypeColonne;
  options?: OptionsColonne;
}

/** Ajoute une colonne au bout du tableau. Réservé à qui attribue : l'appelant le vérifie. */
export async function creerColonneDans(tx: Transaction, organizationId: string, saisie: SaisieColonne, userId: string): Promise<{ id: string }> {
  const libelle = normaliserLibelle(saisie.libelle);
  if (!libelle.ok) throw new Error(libelle.message);
  const options = normaliserOptions(saisie.type, saisie.options);
  if (!options.ok) throw new Error(options.message);

  // Le verrou sur les colonnes de l'entreprise sérialise deux ajouts simultanés : le plafond et le rang tiennent.
  const existantes = await tx
    .select({ rang: tachesColonnes.rang })
    .from(tachesColonnes)
    .where(and(eq(tachesColonnes.organizationId, organizationId), isNull(tachesColonnes.deletedAt)))
    .for("update");
  if (existantes.length >= COLONNES_MAX) throw new Error(`${COLONNES_MAX} colonnes au plus.`);
  const rang = existantes.reduce((m, c) => Math.max(m, c.rang), -1) + 1;

  const id = newId();
  await tx.insert(tachesColonnes).values({ id, organizationId, libelle: libelle.valeur, type: saisie.type, options: options.valeur, rang, creeParUserId: userId });
  await tracer(tx, organizationId, userId, "tache.colonne.creer", "tache_colonne", id, { libelle: libelle.valeur, type: saisie.type, options: options.valeur });
  return { id };
}

/** Renomme une colonne ou change ses options. Le type, lui, ne change pas. */
export async function modifierColonneDans(
  tx: Transaction,
  organizationId: string,
  colonneId: string,
  saisie: { libelle: string; options?: OptionsColonne },
  userId: string,
): Promise<void> {
  const avant = await colonneVerrouillee(tx, organizationId, colonneId);
  const libelle = normaliserLibelle(saisie.libelle);
  if (!libelle.ok) throw new Error(libelle.message);
  const options = normaliserOptions(avant.type, saisie.options);
  if (!options.ok) throw new Error(options.message);

  await tx
    .update(tachesColonnes)
    .set({ libelle: libelle.valeur, options: options.valeur, updatedAt: new Date(), version: sql`${tachesColonnes.version} + 1` })
    .where(eq(tachesColonnes.id, colonneId));
  await tracer(
    tx,
    organizationId,
    userId,
    "tache.colonne.modifier",
    "tache_colonne",
    colonneId,
    { libelle: libelle.valeur, options: options.valeur },
    { libelle: avant.libelle, options: avant.options },
  );
}

/** Retire une colonne. Logique : ses valeurs restent en base, avec leur trace. */
export async function supprimerColonneDans(tx: Transaction, organizationId: string, colonneId: string, userId: string): Promise<{ libelle: string }> {
  const avant = await colonneVerrouillee(tx, organizationId, colonneId);
  const maintenant = new Date();
  await tx
    .update(tachesColonnes)
    .set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${tachesColonnes.version} + 1` })
    .where(eq(tachesColonnes.id, colonneId));
  await tracer(tx, organizationId, userId, "tache.colonne.supprimer", "tache_colonne", colonneId, null, { libelle: avant.libelle, type: avant.type });
  return { libelle: avant.libelle };
}

/** Échange une colonne avec sa voisine de gauche (-1) ou de droite (1). */
export async function deplacerColonneDans(tx: Transaction, organizationId: string, colonneId: string, sens: -1 | 1, userId: string): Promise<void> {
  const colonnes = await tx
    .select({ id: tachesColonnes.id })
    .from(tachesColonnes)
    .where(and(eq(tachesColonnes.organizationId, organizationId), isNull(tachesColonnes.deletedAt)))
    .orderBy(asc(tachesColonnes.rang), asc(tachesColonnes.createdAt))
    .for("update");
  const ordre = deplacer(
    colonnes.map((c) => c.id),
    colonneId,
    sens,
  );
  if (!ordre) return;
  // Les rangs se réécrivent 0, 1, 2… : un ordre ancien à trous ou à doublons se répare en passant.
  const maintenant = new Date();
  for (const [rang, id] of ordre.entries()) {
    await tx.update(tachesColonnes).set({ rang, updatedAt: maintenant, version: sql`${tachesColonnes.version} + 1` }).where(eq(tachesColonnes.id, id));
  }
  await tracer(tx, organizationId, userId, "tache.colonne.deplacer", "tache_colonne", colonneId, { sens });
}

/**
 * Pose la valeur d'une colonne sur une tâche, ou la vide. Qui la remplit :
 * le responsable, les intervenants, le créateur, ou qui attribue — ceux qui
 * font vivre la tâche.
 */
export async function definirValeurDans(
  tx: Transaction,
  organizationId: string,
  tacheId: string,
  colonneId: string,
  saisie: string | null,
  acteur: Acteur,
): Promise<{ numero: string; libelle: string }> {
  const [tache] = await tx
    .select({ numero: taches.numero, creeParUserId: taches.creeParUserId, assigneeUserId: taches.assigneeUserId })
    .from(taches)
    .where(and(eq(taches.id, tacheId), eq(taches.organizationId, organizationId), isNull(taches.deletedAt)));
  if (!tache) throw new Error("Tâche introuvable.");
  const partie = acteur.attribue || tache.creeParUserId === acteur.userId || tache.assigneeUserId === acteur.userId;
  if (!partie && !(await estIntervenant(tx, tacheId, acteur.userId))) {
    throw new Error("Seuls le responsable, les intervenants, le créateur ou qui attribue remplissent les colonnes de cette tâche.");
  }

  const colonne = await colonneVerrouillee(tx, organizationId, colonneId);
  const verdict = normaliserValeur(colonne.type, saisie, colonne.options ?? {});
  if (!verdict.ok) throw new Error(`${colonne.libelle} : ${verdict.message}`);

  const [avant] = await tx
    .select({ valeur: tachesValeurs.valeur })
    .from(tachesValeurs)
    .where(and(eq(tachesValeurs.tacheId, tacheId), eq(tachesValeurs.colonneId, colonneId)));
  if ((avant?.valeur ?? null) === verdict.valeur) return { numero: tache.numero, libelle: colonne.libelle };

  const maintenant = new Date();
  await tx
    .insert(tachesValeurs)
    .values({ id: newId(), organizationId, tacheId, colonneId, valeur: verdict.valeur, modifieParUserId: acteur.userId })
    .onConflictDoUpdate({
      target: [tachesValeurs.tacheId, tachesValeurs.colonneId],
      set: {
        valeur: verdict.valeur,
        modifieParUserId: acteur.userId,
        deletedAt: null,
        updatedAt: maintenant,
        version: sql`${tachesValeurs.version} + 1`,
      },
    });
  // La tâche a bougé : « Mise à jour » le montre.
  await tx.update(taches).set({ updatedAt: maintenant, version: sql`${taches.version} + 1` }).where(eq(taches.id, tacheId));
  await tracer(
    tx,
    organizationId,
    acteur.userId,
    "tache.champ",
    "tache",
    tacheId,
    { numero: tache.numero, colonne: colonne.libelle, valeur: verdict.valeur },
    { valeur: avant?.valeur ?? null },
  );
  return { numero: tache.numero, libelle: colonne.libelle };
}
