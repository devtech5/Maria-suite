ALTER TABLE "employees" ADD COLUMN "contact_urgence_lien" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contact_urgence_telephone" text;--> statement-breakpoint
-- Matricule MG-AAMM-NNN : année et mois d'entrée, puis rang dans l'effectif
-- (src/modules/personnes/calcul.ts). Les salariés existants sont renumérotés
-- dans l'ordre d'arrivée — date d'embauche, puis ordre d'enregistrement. Les
-- bulletins déjà émis gardent le matricule qu'ils ont imprimé.
WITH rangs AS (
  SELECT "id", "debut",
         row_number() OVER (PARTITION BY "organization_id" ORDER BY "debut", "created_at", "id") AS "rang"
  FROM "employees"
)
UPDATE "employees" e
SET "matricule" = 'MG-' || to_char(r."debut", 'YYMM') || '-' || lpad(r."rang"::text, greatest(3, length(r."rang"::text)), '0'),
    "updated_at" = now(),
    "version" = e."version" + 1
FROM rangs r
WHERE r."id" = e."id";--> statement-breakpoint
-- Le compteur des rangs reprend après l'effectif existant.
INSERT INTO "document_sequences" ("organization_id", "key", "scope", "prefix", "suffix", "padding", "periodicity", "period_key", "next_value")
SELECT o."id", 'matricule', '', '', '', 1, 'aucune', '', count(e."id") + 1
FROM "organizations" o
LEFT JOIN "employees" e ON e."organization_id" = o."id"
GROUP BY o."id"
ON CONFLICT ("organization_id", "key", "scope", "period_key") DO UPDATE SET "next_value" = EXCLUDED."next_value";
