ALTER TABLE "avances_tresorerie" ADD COLUMN "beneficiaire_employe_id" uuid;--> statement-breakpoint
ALTER TABLE "bons_caisse" ADD COLUMN "beneficiaire_tiers_id" uuid;--> statement-breakpoint
ALTER TABLE "bons_caisse" ADD COLUMN "beneficiaire_employe_id" uuid;--> statement-breakpoint
ALTER TABLE "bons_caisse" ADD COLUMN "beneficiaire_worker_id" uuid;--> statement-breakpoint
ALTER TABLE "avances_tresorerie" ADD CONSTRAINT "avances_tresorerie_beneficiaire_employe_id_employees_id_fk" FOREIGN KEY ("beneficiaire_employe_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_caisse" ADD CONSTRAINT "bons_caisse_beneficiaire_tiers_id_tiers_id_fk" FOREIGN KEY ("beneficiaire_tiers_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_caisse" ADD CONSTRAINT "bons_caisse_beneficiaire_employe_id_employees_id_fk" FOREIGN KEY ("beneficiaire_employe_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_caisse" ADD CONSTRAINT "bons_caisse_beneficiaire_worker_id_workers_id_fk" FOREIGN KEY ("beneficiaire_worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_caisse" ADD CONSTRAINT "bons_caisse_une_fiche" CHECK (num_nonnulls("bons_caisse"."beneficiaire_tiers_id", "bons_caisse"."beneficiaire_employe_id", "bons_caisse"."beneficiaire_worker_id") <= 1);