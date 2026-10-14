ALTER TABLE "licences_logicielles" ADD COLUMN "fournisseur_id" uuid;--> statement-breakpoint
ALTER TABLE "licences_logicielles" ADD CONSTRAINT "licences_logicielles_fournisseur_id_tiers_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Licences déjà saisies : rattachées à leur fiche quand un seul fournisseur porte exactement ce nom.
UPDATE "licences_logicielles" l SET "fournisseur_id" = t."id"
FROM "tiers" t
WHERE l."fournisseur_id" IS NULL AND l."fournisseur" IS NOT NULL
  AND t."organization_id" = l."organization_id" AND t."est_fournisseur"
  AND lower(trim(t."nom")) = lower(trim(l."fournisseur"))
  AND (SELECT count(*) FROM "tiers" d WHERE d."organization_id" = l."organization_id" AND d."est_fournisseur"
       AND lower(trim(d."nom")) = lower(trim(l."fournisseur"))) = 1;