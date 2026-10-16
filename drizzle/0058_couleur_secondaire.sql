ALTER TABLE "organizations" ADD COLUMN "couleur_secondaire" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_couleur_secondaire" CHECK ("organizations"."couleur_secondaire" IS NULL OR "organizations"."couleur_secondaire" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
-- Couleurs de MARIA GROUP SARL : bleu nuit en primaire, or en secondaire.
UPDATE "organizations"
SET "couleur_documents" = '#162E49',
    "couleur_secondaire" = '#BFA169',
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "slug" = 'maria-group';
