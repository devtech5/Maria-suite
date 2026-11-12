ALTER TABLE "commerciaux" ADD COLUMN "origine" text DEFAULT 'interne' NOT NULL;--> statement-breakpoint
ALTER TABLE "commerciaux" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "commerciaux" ADD COLUMN "organisme" text;--> statement-breakpoint
ALTER TABLE "commerciaux" ADD COLUMN "ville" text;--> statement-breakpoint
-- Reprise : un commercial sans fiche salarié ni compte était déjà un apporteur externe.
UPDATE "commerciaux" SET "origine" = 'externe' WHERE "employee_id" IS NULL AND "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "commerciaux" ADD CONSTRAINT "commerciaux_origine" CHECK ("commerciaux"."origine" in ('interne', 'externe'));--> statement-breakpoint
ALTER TABLE "commerciaux" ADD CONSTRAINT "commerciaux_externe_sans_fiche" CHECK ("commerciaux"."origine" = 'interne' OR ("commerciaux"."employee_id" IS NULL AND "commerciaux"."user_id" IS NULL));