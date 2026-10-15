ALTER TABLE "bulletins_paie" ADD COLUMN "rappel" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD COLUMN "rappel_libelle" text;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_rappel" CHECK ("bulletins_paie"."rappel" = 0 OR "bulletins_paie"."rappel_libelle" IS NOT NULL);