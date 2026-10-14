ALTER TABLE "conventions" ADD COLUMN "projet_id" uuid;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "devis_id" uuid;--> statement-breakpoint
ALTER TABLE "soumissions" ADD COLUMN "projet_id" uuid;--> statement-breakpoint
ALTER TABLE "soumissions" ADD COLUMN "devis_id" uuid;--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_devis_id_pieces_commerciales_id_fk" FOREIGN KEY ("devis_id") REFERENCES "public"."pieces_commerciales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soumissions" ADD CONSTRAINT "soumissions_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soumissions" ADD CONSTRAINT "soumissions_devis_id_pieces_commerciales_id_fk" FOREIGN KEY ("devis_id") REFERENCES "public"."pieces_commerciales"("id") ON DELETE set null ON UPDATE no action;