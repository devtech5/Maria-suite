ALTER TABLE "organizations" ADD COLUMN "valeur_nominale_part" bigint;--> statement-breakpoint
ALTER TABLE "postes" ADD COLUMN "categorie" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_valeur_nominale_positive" CHECK ("organizations"."valeur_nominale_part" IS NULL OR "organizations"."valeur_nominale_part" > 0);--> statement-breakpoint
ALTER TABLE "postes" ADD CONSTRAINT "postes_categorie" CHECK ("postes"."categorie" IS NULL OR "postes"."categorie" IN ('cadre_superieur', 'cadre_moyen', 'maitrise', 'employe'));