"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { codePostgres } from "@/lib/erreurs-pg";
import type { Transaction } from "@/lib/sequences";

import { tableDecrite } from "./catalogue";
import {
  basculerActifDans,
  effacerLigneDans,
  mettreALaCorbeilleDans,
  modifierLigneDans,
  restaurerLigneDans,
  type Contexte,
  type Resultat,
} from "./operations";
import type { TableDecrite } from "./regles";

const MESSAGES_PG: Record<string, string> = {
  "23505": "Cette valeur est déjà utilisée par une autre ligne.",
  "23503": "Cette ligne est liée à d'autres : la base refuse ce changement.",
  "23514": "La base refuse cette valeur : elle contredit une règle de la table.",
  "23502": "Un champ obligatoire est vide.",
  "22P02": "Une valeur n'a pas le bon format.",
};

/**
 * Réservé au propriétaire : la console passe outre les écrans des modules.
 * Toute erreur de la base revient en phrase, jamais en page d'erreur.
 */
async function operer(nomTable: string, geste: (tx: Transaction, t: TableDecrite, ctx: Contexte) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  if (!session.estProprietaire) return { ok: false, message: "La console des données est réservée au propriétaire." };
  const t = tableDecrite(nomTable);
  if (!t || !t.cle) return { ok: false, message: "Table inconnue." };
  try {
    const ctx = { organizationId: session.organizationId, userId: session.userId };
    const r = await db.transaction((tx) => geste(tx, t, ctx));
    if (r.ok) revalidatePath("/", "layout");
    return r;
  } catch (erreur) {
    const code = codePostgres(erreur);
    if (code && MESSAGES_PG[code]) return { ok: false, message: MESSAGES_PG[code] };
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Console des données : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

export async function modifierLigne(donnees: FormData): Promise<Resultat> {
  const id = String(donnees.get("id") ?? "");
  return operer(String(donnees.get("table") ?? ""), (tx, t, ctx) => modifierLigneDans(tx, t, ctx, id, donnees));
}

export async function basculerActif(table: string, id: string): Promise<Resultat> {
  return operer(table, (tx, t, ctx) => basculerActifDans(tx, t, ctx, id));
}

export async function mettreALaCorbeille(table: string, id: string): Promise<Resultat> {
  return operer(table, (tx, t, ctx) => mettreALaCorbeilleDans(tx, t, ctx, id));
}

export async function restaurerLigne(table: string, id: string): Promise<Resultat> {
  return operer(table, (tx, t, ctx) => restaurerLigneDans(tx, t, ctx, id));
}

export async function effacerLigne(table: string, id: string): Promise<Resultat> {
  return operer(table, (tx, t, ctx) => effacerLigneDans(tx, t, ctx, id));
}
