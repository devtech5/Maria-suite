ALTER TABLE "organizations" ALTER COLUMN "delai_verrouillage_minutes" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "maintenue_le" timestamp with time zone;--> statement-breakpoint
-- Verrou à 15 minutes pour toutes les entreprises ; 30 et 60 ne sont plus
-- proposés, la session prenant fin après 30 minutes sans activité.
UPDATE "organizations"
SET "delai_verrouillage_minutes" = 15,
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "delai_verrouillage_minutes" <> 15;
