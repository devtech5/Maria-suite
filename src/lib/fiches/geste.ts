import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";

import { FICHES, type DefinitionFiche, type Geste, type TypeFiche } from "./registre";

/**
 * Mettre en off, réactiver, supprimer : le circuit commun des fiches du
 * registre. Le droit se vérifie en amont (`./actions.ts`) ; ici, la règle et
 * l'écriture, testables contre une vraie base.
 */

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

export interface Usage {
  table: string;
  nombre: number;
}

/**
 * Lignes encore vivantes qui pointent vers `table(id)`.
 *
 * C'est la base qui le dit, par ses clés étrangères : une table ajoutée demain
 * avec sa contrainte compte d'office, sans qu'on pense à l'inscrire ici. Les
 * lignes déjà supprimées (logiquement) ne comptent pas.
 */
export async function usagesDe(
  tx: Transaction,
  table: string,
  id: string,
  ignorer: readonly { table: string; colonne: string }[] = [],
): Promise<Usage[]> {
  const contraintes = await tx.execute<{ source: string; colonne: string; logique: boolean }>(sql`
    select cl.relname as source, a.attname as colonne,
           exists (
             select 1 from pg_attribute d
             where d.attrelid = c.conrelid and d.attname = 'deleted_at' and not d.attisdropped
           ) as logique
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and cardinality(c.conkey) = 1
      and c.confrelid = to_regclass(${`public.${table}`})
  `);

  const usages: Usage[] = [];
  for (const { source, colonne, logique } of contraintes) {
    if (ignorer.some((i) => i.table === source && i.colonne === colonne)) continue;
    const [{ nombre }] = await tx.execute<{ nombre: number }>(sql`
      select count(*)::int as nombre from ${sql.identifier(source)}
      where ${sql.identifier(colonne)} = ${id} ${logique ? sql`and deleted_at is null` : sql``}
    `);
    if (nombre > 0) usages.push({ table: source, nombre });
  }
  return usages;
}

/** « 3 dans factures fournisseur, 1 dans écritures » — assez pour savoir où regarder. */
export function decrireUsages(usages: readonly Usage[]): string {
  return usages.map((u) => `${u.nombre} dans ${u.table.replaceAll("_", " ")}`).join(", ");
}

/** Usages de la fiche et de ses extensions, ces dernières n'étant pas des usages en soi. */
async function usagesDeLaFiche(tx: Transaction, def: DefinitionFiche, id: string): Promise<Usage[]> {
  const filles = def.filles ?? [];
  const usages = await usagesDe(tx, def.table, id, filles);
  for (const fille of filles) {
    const lignes = await tx.execute<{ cle: string }>(sql`
      select ${sql.identifier(fille.cle)} as cle from ${sql.identifier(fille.table)}
      where ${sql.identifier(fille.colonne)} = ${id} and deleted_at is null
    `);
    for (const ligne of lignes) usages.push(...(await usagesDe(tx, fille.table, ligne.cle)));
  }
  return usages;
}

const MESSAGE: Record<Geste, string> = {
  desactiver: "Fiche mise en off : elle ne sera plus proposée, son historique reste.",
  reactiver: "Fiche réactivée.",
  supprimer: "Fiche supprimée.",
};

/**
 * Applique un geste à une fiche de l'entreprise, avec sa trace.
 *
 * La ligne est verrouillée (`for update`) le temps de la décision : deux
 * gestes simultanés ne s'entrecroisent pas, et une suppression ne passe pas
 * pendant qu'une saisie, ailleurs, rattache la fiche.
 */
export async function appliquerGestePour(
  organizationId: string,
  userId: string | null,
  type: TypeFiche,
  id: string,
  geste: Geste,
): Promise<Resultat> {
  const def: DefinitionFiche = FICHES[type];
  if (geste !== "supprimer" && !def.actif) return { ok: false, message: `On ne met pas ${def.designation} en off ici : la fiche a son propre statut.` };

  return db.transaction(async (tx) => {
    const [ligne] = await tx.execute<{ libelle: string | null; actif: boolean | null }>(sql`
      select ${sql.identifier(def.libelle)}::text as libelle,
             ${def.actif ? sql`actif` : sql`null::boolean`} as actif
      from ${sql.identifier(def.table)}
      where id = ${id} and organization_id = ${organizationId} and deleted_at is null
      for update
    `);
    if (!ligne) return { ok: false, message: "Fiche introuvable, ou déjà supprimée." };

    if (geste === "desactiver" && ligne.actif === false) return { ok: true, message: "Fiche déjà en off." };
    if (geste === "reactiver" && ligne.actif === true) return { ok: true, message: "Fiche déjà active." };

    if (geste === "supprimer") {
      const usages = await usagesDeLaFiche(tx, def, id);
      if (usages.length > 0) {
        return {
          ok: false,
          message:
            `Suppression refusée : ${def.designation} sert déjà (${decrireUsages(usages)}). ` +
            (def.actif ? "Mettez la fiche en off : elle ne sera plus proposée et son historique reste." : "Son historique doit rester."),
        };
      }
      for (const fille of def.filles ?? []) {
        await tx.execute(sql`
          update ${sql.identifier(fille.table)}
          set deleted_at = now(), updated_at = now(), version = version + 1
          where ${sql.identifier(fille.colonne)} = ${id} and organization_id = ${organizationId} and deleted_at is null
        `);
      }
    }

    const changement =
      geste === "supprimer"
        ? sql`deleted_at = now()${def.actif ? sql`, actif = false` : sql``}`
        : sql`actif = ${geste === "reactiver"}`;
    await tx.execute(sql`
      update ${sql.identifier(def.table)}
      set ${changement}, updated_at = now(), version = version + 1
      where id = ${id} and organization_id = ${organizationId}
    `);

    // La trace naît dans la transaction : pas de geste sans elle, pas de trace sans geste.
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: `${type}.${geste}`,
      entityType: def.table,
      entityId: id,
      before: { libelle: ligne.libelle, actif: ligne.actif },
      after: geste === "supprimer" ? { libelle: ligne.libelle, supprime: true } : { libelle: ligne.libelle, actif: geste === "reactiver" },
    });

    return { ok: true, message: MESSAGE[geste] };
  });
}
