ALTER TABLE "organizations" ADD COLUMN "slogan" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "site_web" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "capital_social" bigint;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_capital_social_positif" CHECK ("organizations"."capital_social" IS NULL OR "organizations"."capital_social" >= 0);--> statement-breakpoint
-- Papier à en-tête de MARIA GROUP SARL : sa devise et son site.
UPDATE "organizations"
SET "slogan" = 'Ouvrir les horizons, bâtir avec puissance et détermination',
    "site_web" = 'www.maria-groupe.com',
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "slug" = 'maria-group';
