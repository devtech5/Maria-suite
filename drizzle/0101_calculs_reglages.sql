CREATE TABLE "reglages_calculs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"valeurs" jsonb NOT NULL,
	"verifie_le" timestamp with time zone,
	"verifie_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reglages_calculs_org" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "reglages_calculs" ADD CONSTRAINT "reglages_calculs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglages_calculs" ENABLE ROW LEVEL SECURITY;
