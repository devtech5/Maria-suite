import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { primaryId, rowVersion, timestamps } from "@/db/schema/_shared";
import { organizations } from "@/db/schema/tenancy";
import { employees, services } from "@/modules/personnes/schema";

/**
 * Contacts : l'annuaire interne de l'entreprise. Règles dans `./regles.ts`.
 *
 * Ni les contacts des clients (`contacts_tiers`), ni la boîte mail de chacun
 * (`comptes_courriel`) : ici, la liste des adresses professionnelles de
 * l'entreprise, à qui elles sont affectées, et les numéros du personnel.
 */

/**
 * Adresse e-mail professionnelle de l'entreprise : direction@, compta@,
 * awa.kone@.
 *
 * L'affectation se fait en deux temps : au SERVICE d'abord (la boîte
 * commune d'un service, ou celle d'un de ses membres), puis, si l'adresse
 * est nominative, au COLLABORATEUR de ce service. Pas de collaborateur sans
 * service : la contrainte `adresses_pro_titulaire_a_un_service` l'impose.
 */
export const adressesPro = pgTable(
  "adresses_pro",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** En minuscules, domaine admis par `adresseAutorisee`. */
    adresse: text("adresse").notNull(),
    /** À quoi elle sert : « Boîte de la comptabilité », « Contact clients ». */
    libelle: text("libelle"),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    /** Le titulaire, quand l'adresse est nominative. Un collaborateur de `serviceId`. */
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    /** Une adresse fermée reste listée, mais n'est plus proposée. */
    actif: boolean("actif").notNull().default(true),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    uniqueIndex("adresses_pro_adresse_unique")
      .on(t.organizationId, t.adresse)
      .where(sql`${t.deletedAt} IS NULL`),
    index("adresses_pro_service_idx").on(t.organizationId, t.serviceId),
    index("adresses_pro_employe_idx").on(t.organizationId, t.employeeId),
    check("adresses_pro_minuscules", sql`${t.adresse} = lower(${t.adresse})`),
    check("adresses_pro_forme", sql`${t.adresse} LIKE '%_@_%'`),
    check("adresses_pro_titulaire_a_un_service", sql`${t.employeeId} IS NULL OR ${t.serviceId} IS NOT NULL`),
  ],
);

/**
 * Numéro de téléphone d'un collaborateur : un collaborateur en a plusieurs
 * (mobile professionnel, fixe du bureau, WhatsApp, mobile personnel).
 *
 * C'est une donnée personnelle. `usage` décide qui la lit : un numéro
 * « professionnel » se lit avec `contacts.consulter`, un numéro
 * « personnel » seulement avec `contacts.gerer`.
 */
export const numerosCollaborateurs = pgTable(
  "numeros_collaborateurs",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    /** Format international, chiffres seuls : 2250707123456. */
    numero: text("numero").notNull(),
    nature: text("nature").notNull().default("mobile"),
    usage: text("usage").notNull().default("professionnel"),

    ...timestamps,
    ...rowVersion,
  },
  (t) => [
    uniqueIndex("numeros_collaborateurs_unique")
      .on(t.employeeId, t.numero)
      .where(sql`${t.deletedAt} IS NULL`),
    index("numeros_collaborateurs_org_idx").on(t.organizationId, t.employeeId),
    check("numeros_collaborateurs_nature", sql`${t.nature} in ('mobile', 'fixe', 'whatsapp')`),
    check("numeros_collaborateurs_usage", sql`${t.usage} in ('professionnel', 'personnel')`),
    check("numeros_collaborateurs_chiffres", sql`${t.numero} ~ '^[0-9]{8,15}$'`),
  ],
);

export type AdressePro = typeof adressesPro.$inferSelect;
export type NumeroCollaborateur = typeof numerosCollaborateurs.$inferSelect;
