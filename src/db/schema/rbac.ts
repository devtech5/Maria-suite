import { relations } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { memberships, organizations } from "./tenancy";

/**
 * Rôle.
 *
 * Un rôle marqué `isSystem` est fourni par Maria Suite : il est copié dans chaque
 * entreprise à sa création, et ses droits sont lus dans le code
 * (`src/lib/droits/catalogue.ts`), jamais dans `role_permissions`. Copié
 * plutôt que partagé, pour qu'un exploitant puisse appeler son caissier
 * « guichetier » sans renommer celui du voisin — seule la `key` reste commune,
 * et c'est elle qui décide des droits.
 *
 * Une entreprise peut en créer d'autres, qui n'appartiennent qu'à elle et
 * tirent leurs droits de `role_permissions`.
 */
export const roles = pgTable(
  "roles",
  {
    id: primaryId(),
    organizationId: uuid("organization_id"),
    /** proprietaire, gerant, caissier, comptable, magasinier… */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (t) => [unique("roles_org_key_unique").on(t.organizationId, t.key)],
);

/**
 * Catalogue des permissions. Alimenté par le code, pas par l'utilisateur :
 * chaque module déclare les siennes au format `module.ressource.action`,
 * par exemple `pos.session.ouvrir` ou `stock.inventaire.valider`.
 */
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  moduleKey: text("module_key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionKey],
    references: [permissions.key],
  }),
}));

/**
 * Niveau d'accès d'une personne à un module.
 *
 *   · aucun        — le module disparaît pour elle : ni menu, ni écran ;
 *   · consultation — elle voit, sans rien pouvoir modifier ;
 *   · complet      — son rôle décide, sans restriction de plus.
 */
export const niveauAcces = pgEnum("niveau_acces", ["aucun", "consultation", "complet"]);

/**
 * Restriction d'accès par module, pour une personne dans une entreprise.
 *
 * Le rôle donne le PLAFOND des droits ; cette table le resserre, module par
 * module, sans créer un rôle par personne. Elle ne peut jamais AJOUTER un
 * droit que le rôle n'a pas : un caissier réglé « complet » sur la
 * comptabilité reste un caissier. L'absence de ligne vaut « complet ».
 *
 * Le propriétaire n'est jamais restreint : l'entreprise lui appartient, et une
 * configuration malheureuse ne doit pas lui fermer sa propre porte.
 */
export const accesModules = pgTable(
  "acces_modules",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    niveau: niveauAcces("niveau").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("acces_modules_unique").on(t.membershipId, t.moduleKey),
    index("acces_modules_org_idx").on(t.organizationId),
  ],
);

export type NiveauAcces = (typeof accesModules.$inferSelect)["niveau"];
