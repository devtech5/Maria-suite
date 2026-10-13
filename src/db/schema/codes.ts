import { boolean, index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { organizations } from "./tenancy";

export const codeKind = pgEnum("code_kind", [
  "qrcode",
  "code128",
  "ean13",
  "nfc",
]);

/**
 * Codes scannables rattachés à n'importe quelle entité.
 *
 * Tout ce qui est ajouté dans Maria Suite peut porter un code : un article, un
 * engin, un ordinateur du parc, un plat de la carte, un modèle en atelier, un
 * employé — pour sa carte professionnelle —, un ticket de caisse, un contrat de
 * location, une chambre, un colis.
 *
 * Table séparée plutôt qu'une colonne, pour trois raisons :
 *
 *   1. Une même entité porte souvent plusieurs codes. Un article a l'EAN
 *      imprimé par le fabricant ET notre code interne ; les deux doivent
 *      fonctionner au scan sans que l'un écrase l'autre.
 *   2. Le type varie selon l'usage : QR pour un badge ou un ticket, EAN-13
 *      pour un produit de grande distribution, Code 128 pour une étiquette de
 *      rayon, NFC pour un badge d'accès.
 *   3. Un code se remplace — étiquette abîmée, badge perdu — sans toucher
 *      l'entité elle-même.
 *
 * `token` est la clé de résolution : court, unique à l'échelle de
 * l'installation, il permet à un scan de retrouver l'entité en une seule
 * lecture d'index, sans savoir à l'avance de quel type d'objet il s'agit.
 *
 * Le scan doit fonctionner sans réseau. Le token est donc résolu localement
 * quand l'appareil détient déjà la donnée ; `target_url` ne sert qu'au scan
 * par un tiers avec un téléphone quelconque — un client qui vérifie un reçu,
 * un agent qui contrôle un badge.
 */
export const entityCodes = pgTable(
  "entity_codes",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** article, asset, employee, worker, sale, contract, room, parcel… */
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),

    kind: codeKind("kind").notNull().default("qrcode"),

    /**
     * Contenu encodé dans le symbole. Pour un EAN fournisseur, le chiffre
     * imprimé sur l'emballage. Pour un QR interne, l'URL de résolution.
     */
    value: text("value").notNull(),

    /** Jeton court de résolution, propre à Maria Suite. Nul pour un code externe. */
    token: text("token"),

    /** URL ouverte par un téléphone qui scanne le symbole. */
    targetUrl: text("target_url"),

    /** Le code présenté par défaut sur les étiquettes et les impressions. */
    isPrimary: boolean("is_primary").notNull().default(false),

    /** Étiquette abîmée, badge perdu : le code est retiré sans être supprimé. */
    isActive: boolean("is_active").notNull().default(true),

    label: text("label"),

    ...timestamps,
  },
  (t) => [
    unique("entity_codes_token_unique").on(t.token),
    unique("entity_codes_org_value_unique").on(t.organizationId, t.kind, t.value),
    index("entity_codes_entity_idx").on(t.entityType, t.entityId),
    index("entity_codes_org_idx").on(t.organizationId),
  ],
);
