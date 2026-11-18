CREATE TYPE "public"."statut_commande_interne" AS ENUM('demande', 'approuve', 'rejete', 'annule');--> statement-breakpoint
CREATE TABLE "bons_commande_interne" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"objet" text NOT NULL,
	"service" text,
	"lieu_livraison" text,
	"notes" text,
	"lignes" jsonb NOT NULL,
	"total" bigint NOT NULL,
	"statut" "statut_commande_interne" DEFAULT 'demande' NOT NULL,
	"demande_par_user_id" uuid NOT NULL,
	"approuve_par_user_id" uuid,
	"approuve_le" timestamp with time zone,
	"motif_rejet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bons_commande_interne_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "bons_commande_interne_total" CHECK ("bons_commande_interne"."total" > 0),
	CONSTRAINT "bons_commande_interne_rejet_motive" CHECK ("bons_commande_interne"."statut" <> 'rejete' OR "bons_commande_interne"."motif_rejet" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "bons_commande_interne" ADD CONSTRAINT "bons_commande_interne_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bons_commande_interne_statut_idx" ON "bons_commande_interne" USING btree ("organization_id","statut");--> statement-breakpoint
ALTER TABLE "bons_commande_interne" ENABLE ROW LEVEL SECURITY;
