import { jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";

/**
 * Ratios des calculs chantier d'une entreprise : dosages du béton et du
 * mortier, agglos au m², pertes, conditionnements. Une ligne par entreprise,
 * créée au premier enregistrement ; sans elle, les valeurs de départ
 * (`REGLAGES_DEFAUT`) s'appliquent.
 *
 * `valeurs` est un JSON relu par `normaliserReglages` : un ratio ajouté au
 * code plus tard prend sa valeur de départ sans migration. Les ratios
 * restent « à vérifier » tant qu'un responsable ne les a pas attestés.
 */
export const reglagesCalculs = pgTable(
  "reglages_calculs",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    valeurs: jsonb("valeurs").notNull(),
    verifieLe: timestamp("verifie_le", { withTimezone: true }),
    verifieParUserId: uuid("verifie_par_user_id"),
    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("reglages_calculs_org").on(t.organizationId)],
);

export type LigneReglagesCalculs = typeof reglagesCalculs.$inferSelect;
