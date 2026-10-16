ALTER TABLE "organizations" ALTER COLUMN "delai_verrouillage_minutes" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "maintenue_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "couleur_secondaire" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "slogan" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "site_web" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "capital_social" bigint;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_couleur_secondaire" CHECK ("organizations"."couleur_secondaire" IS NULL OR "organizations"."couleur_secondaire" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_capital_social_positif" CHECK ("organizations"."capital_social" IS NULL OR "organizations"."capital_social" >= 0);--> statement-breakpoint
-- Anciennement 0058 à 0060 sur un poste de développement : renumérotées après
-- les migrations 0058 à 0061 de la branche principale (paie, personnel,
-- moyens généraux), le schéma n'en change pas.
-- Couleurs de MARIA GROUP SARL : bleu nuit en primaire, or en secondaire.
UPDATE "organizations"
SET "couleur_documents" = '#162E49',
    "couleur_secondaire" = '#BFA169',
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "slug" = 'maria-group';--> statement-breakpoint
-- Verrou à 15 minutes pour toutes les entreprises ; 30 et 60 ne sont plus
-- proposés, la session prenant fin après 30 minutes sans activité.
UPDATE "organizations"
SET "delai_verrouillage_minutes" = 15,
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "delai_verrouillage_minutes" <> 15;--> statement-breakpoint
-- Papier à en-tête de MARIA GROUP SARL : sa devise et son site.
UPDATE "organizations"
SET "slogan" = 'Ouvrir les horizons, bâtir avec puissance et détermination',
    "site_web" = 'www.maria-groupe.com',
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "slug" = 'maria-group';
