ALTER TABLE "employees" ADD COLUMN "email_professionnel" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "service" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "superieur_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "fin_periode_essai" date;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_superieur_id_employees_id_fk" FOREIGN KEY ("superieur_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_superieur_autre" CHECK ("employees"."superieur_id" IS NULL OR "employees"."superieur_id" <> "employees"."id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_essai_apres_entree" CHECK ("employees"."fin_periode_essai" IS NULL OR "employees"."fin_periode_essai" >= "employees"."debut");