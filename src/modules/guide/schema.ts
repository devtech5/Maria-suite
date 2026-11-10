import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { users } from "@/db/schema/auth";
import { organizations } from "@/db/schema/tenancy";

/**
 * Guide d'utilisation : ce que chacun a lu, et ses passages du quiz. Le
 * contenu du guide vit dans le code (`./chapitres*.ts`) ; la base ne garde
 * que la progression, pour le parcours du nouveau venu et le suivi des RH.
 */
export const guideLectures = pgTable(
  "guide_lectures",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Clé du chapitre (`Chapitre.cle`). */
    chapitre: text("chapitre").notNull(),
    luLe: timestamp("lu_le", { withTimezone: true }).notNull().defaultNow(),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [unique("guide_lectures_unique").on(t.organizationId, t.userId, t.chapitre), index("guide_lectures_user_idx").on(t.organizationId, t.userId)],
);

export const guideQuiz = pgTable(
  "guide_quiz",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bonnes: integer("bonnes").notNull(),
    total: integer("total").notNull(),
    reussi: boolean("reussi").notNull(),
    /** Clé de chaque question, rang donné, rang attendu : de quoi relire la copie. */
    reponses: jsonb("reponses").$type<{ cle: string; donnee: number | null; bonne: number }[]>().notNull(),
    passeLe: timestamp("passe_le", { withTimezone: true }).notNull().defaultNow(),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [index("guide_quiz_user_idx").on(t.organizationId, t.userId, t.passeLe)],
);
