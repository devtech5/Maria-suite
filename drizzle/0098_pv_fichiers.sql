-- Pièces jointes des procès-verbaux : la clé du fichier dans le dépôt, jamais le fichier.
CREATE TABLE "pv_fichiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pv_id" uuid NOT NULL,
	"nom_fichier" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille" integer NOT NULL,
	"chemin" text NOT NULL,
	"depose_par_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pv_fichiers_taille" CHECK ("pv_fichiers"."taille" > 0)
);
--> statement-breakpoint
ALTER TABLE "pv_fichiers" ADD CONSTRAINT "pv_fichiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_fichiers" ADD CONSTRAINT "pv_fichiers_pv_id_proces_verbaux_id_fk" FOREIGN KEY ("pv_id") REFERENCES "public"."proces_verbaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pv_fichiers_pv_idx" ON "pv_fichiers" USING btree ("organization_id","pv_id");--> statement-breakpoint
CREATE INDEX "pv_fichiers_chemin_idx" ON "pv_fichiers" USING btree ("chemin");--> statement-breakpoint
ALTER TABLE "pv_fichiers" ENABLE ROW LEVEL SECURITY;
