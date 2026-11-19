import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";

import {
  accesColonne,
  desactivable,
  libelle,
  lireSaisie,
  memeValeur,
  refusSuppressionDefinitive,
  supprimable,
  verrouLigne,
  type ColonneDecrite,
  type TableDecrite,
} from "./regles";
import { designer, referencesVers, verrouillerLigne, type Ligne } from "./requetes";

/**
 * Les gestes de la console, dans une transaction : la ligne est verrouillée,
 * son verrou métier vérifié, le changement écrit avec sa date et sa version,
 * puis tracé au journal d'audit (avant, après). Le contrôle du propriétaire
 * est fait par l'action qui appelle.
 */

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

export interface Contexte {
  organizationId: string;
  userId: string;
}

async function tracer(tx: Transaction, ctx: Contexte, action: string, t: TableDecrite, id: string, avant: Ligne | null, apres: Ligne | null) {
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: `donnees.${action}`,
    entityType: t.nom,
    entityId: id,
    before: avant,
    after: apres,
  });
}

async function ligneDe(tx: Transaction, t: TableDecrite, ctx: Contexte, id: string): Promise<Ligne> {
  const ligne = await verrouillerLigne(tx, t, ctx.organizationId, id);
  if (!ligne) throw new Error("Ligne introuvable.");
  return ligne;
}

/** Ce qui accompagne toute écriture : la date de mise à jour et la version, quand la table les porte. */
function suivi(t: TableDecrite): SQL[] {
  const sets: SQL[] = [];
  if (t.colonnes.some((c) => c.nom === "updated_at")) sets.push(sql`updated_at = now()`);
  if (t.colonnes.some((c) => c.nom === "version")) sets.push(sql`version = version + 1`);
  return sets;
}

/** La valeur, convertie au type de sa colonne : jamais de nombre à virgule, une énumération reste une énumération. */
function valeurSql(c: ColonneDecrite, v: unknown): SQL {
  if (v === null) return sql`null`;
  switch (c.genre) {
    case "entier":
      return sql`${String(v)}::bigint`;
    case "booleen":
      return sql`${v ? "true" : "false"}::boolean`;
    case "date":
      return sql`${String(v)}::date`;
    case "choix":
      return sql`${String(v)}::${sql.identifier(c.typeEnum ?? "text")}`;
    case "json":
      return sql`${JSON.stringify(v)}::jsonb`;
    default:
      return sql`${String(v)}::text`;
  }
}

async function ecrire(tx: Transaction, t: TableDecrite, ctx: Contexte, id: string, sets: SQL[]) {
  await tx.execute(sql`update ${sql.identifier(t.nom)} set ${sql.join([...sets, ...suivi(t)], sql`, `)} where ${designer(t, ctx.organizationId, id)}`);
}

/**
 * Modifie les champs modifiables d'une ligne ; seuls ceux qui changent
 * s'écrivent. Une case à cocher décochée n'est pas envoyée par le
 * navigateur : le formulaire signale sa présence par `present:<colonne>`.
 */
export async function modifierLigneDans(tx: Transaction, t: TableDecrite, ctx: Contexte, id: string, donnees: FormData): Promise<Resultat> {
  const avant = await ligneDe(tx, t, ctx, id);
  const verrou = verrouLigne(t, avant);
  if (verrou) return { ok: false, message: verrou };
  const sets: SQL[] = [];
  const ancien: Ligne = {};
  const nouveau: Ligne = {};
  for (const c of t.colonnes) {
    if (accesColonne(t.nom, c) !== "modifiable") continue;
    if (!donnees.has(c.genre === "booleen" ? `present:${c.nom}` : c.nom)) continue;
    const brut = donnees.get(c.nom);
    const saisie = lireSaisie(c, typeof brut === "string" ? brut : null, avant[c.nom]);
    if (!saisie.ok) return { ok: false, message: saisie.message };
    if (memeValeur(saisie.valeur, avant[c.nom])) continue;
    sets.push(sql`${sql.identifier(c.nom)} = ${valeurSql(c, saisie.valeur)}`);
    ancien[c.nom] = avant[c.nom];
    nouveau[c.nom] = saisie.valeur as Ligne[string];
  }
  if (sets.length === 0) return { ok: true, message: "Aucun changement." };
  await ecrire(tx, t, ctx, id, sets);
  await tracer(tx, ctx, "modifier", t, id, ancien, nouveau);
  const noms = Object.keys(nouveau).map((n) => libelle(n).toLocaleLowerCase("fr-FR"));
  return { ok: true, message: `Ligne modifiée : ${noms.join(", ")}.` };
}

/** Désactive une ligne active, réactive une ligne inactive. */
export async function basculerActifDans(tx: Transaction, t: TableDecrite, ctx: Contexte, id: string): Promise<Resultat> {
  if (!desactivable(t)) return { ok: false, message: "Cette table ne se désactive pas." };
  const avant = await ligneDe(tx, t, ctx, id);
  const verrou = verrouLigne(t, avant);
  if (verrou) return { ok: false, message: verrou };
  const actif = avant.actif !== true;
  await ecrire(tx, t, ctx, id, [sql`actif = ${actif ? "true" : "false"}::boolean`]);
  await tracer(tx, ctx, actif ? "reactiver" : "desactiver", t, id, { actif: avant.actif }, { actif });
  return { ok: true, message: actif ? "Ligne réactivée." : "Ligne désactivée." };
}

/** Met une ligne à la corbeille : suppression logique, réversible. */
export async function mettreALaCorbeilleDans(tx: Transaction, t: TableDecrite, ctx: Contexte, id: string): Promise<Resultat> {
  if (!supprimable(t)) return { ok: false, message: "Cette table ne se supprime pas ici." };
  const avant = await ligneDe(tx, t, ctx, id);
  if (avant.deleted_at !== null) return { ok: false, message: "La ligne est déjà à la corbeille." };
  const verrou = verrouLigne(t, avant);
  if (verrou) return { ok: false, message: verrou };
  await ecrire(tx, t, ctx, id, [sql`deleted_at = now()`]);
  await tracer(tx, ctx, "supprimer", t, id, avant, null);
  return { ok: true, message: "Ligne supprimée : elle est à la corbeille, d'où elle peut revenir." };
}

/** Sort une ligne de la corbeille. */
export async function restaurerLigneDans(tx: Transaction, t: TableDecrite, ctx: Contexte, id: string): Promise<Resultat> {
  if (!supprimable(t)) return { ok: false, message: "Cette table ne se supprime pas ici." };
  const avant = await ligneDe(tx, t, ctx, id);
  if (avant.deleted_at === null) return { ok: false, message: "La ligne n'est pas à la corbeille." };
  await ecrire(tx, t, ctx, id, [sql`deleted_at = null`]);
  await tracer(tx, ctx, "restaurer", t, id, { deleted_at: avant.deleted_at }, { deleted_at: null });
  return { ok: true, message: "Ligne restaurée." };
}

/**
 * Efface une ligne de la corbeille, pour de bon : seulement sans numéro et
 * si plus rien ne la désigne. Le journal d'audit garde son contenu.
 */
export async function effacerLigneDans(tx: Transaction, t: TableDecrite, ctx: Contexte, id: string): Promise<Resultat> {
  const avant = await ligneDe(tx, t, ctx, id);
  const references = await referencesVers(t, ctx.organizationId, id, tx);
  const refus = refusSuppressionDefinitive(
    t,
    avant,
    references.reduce((s, r) => s + r.nombre, 0),
  );
  if (refus) return { ok: false, message: refus };
  await tx.execute(sql`delete from ${sql.identifier(t.nom)} where ${designer(t, ctx.organizationId, id)}`);
  await tracer(tx, ctx, "effacer", t, id, avant, null);
  return { ok: true, message: "Ligne effacée définitivement." };
}
