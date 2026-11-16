-- PV de réunion de chantier : rattaché à un projet, numéroté dans la suite de
-- ses réunions, avec météo, effectifs, avancement par lot et prochaine réunion.
-- Aucune table nouvelle : RLS reste actif sur proces_verbaux.
ALTER TABLE "proces_verbaux" DROP CONSTRAINT "proces_verbaux_type";--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD COLUMN "projet_id" uuid;--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD COLUMN "numero_reunion" integer;--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD COLUMN "chantier" jsonb;--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD CONSTRAINT "proces_verbaux_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proces_verbaux_projet_idx" ON "proces_verbaux" USING btree ("organization_id","projet_id");--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD CONSTRAINT "proces_verbaux_numero_reunion" CHECK ("proces_verbaux"."numero_reunion" IS NULL OR "proces_verbaux"."numero_reunion" BETWEEN 1 AND 9999);--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD CONSTRAINT "proces_verbaux_type" CHECK ("proces_verbaux"."type" IN ('reunion', 'chantier', 'compte_rendu', 'rapport'));