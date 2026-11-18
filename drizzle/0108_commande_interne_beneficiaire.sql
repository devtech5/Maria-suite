ALTER TABLE "bons_commande_interne" ADD COLUMN "beneficiaire" text;--> statement-breakpoint
ALTER TABLE "bons_commande_interne" ADD COLUMN "beneficiaire_employe_id" uuid;--> statement-breakpoint
ALTER TABLE "bons_commande_interne" ADD COLUMN "beneficiaire_user_id" uuid;--> statement-breakpoint
ALTER TABLE "bons_commande_interne" ADD CONSTRAINT "bons_commande_interne_beneficiaire_employe_id_employees_id_fk" FOREIGN KEY ("beneficiaire_employe_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;