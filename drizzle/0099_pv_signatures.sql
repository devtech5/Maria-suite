-- Signatures des participants présents sur un PV publié : tracé en chemin SVG
-- vérifié, horodatage, adresse et appareil ; une par participant et par version.
CREATE TABLE "pv_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pv_id" uuid NOT NULL,
	"rang" integer NOT NULL,
	"nom" text NOT NULL,
	"qualite" text,
	"user_id" uuid,
	"recueillie_par_user_id" uuid,
	"trace" text NOT NULL,
	"signe_le" timestamp with time zone DEFAULT now() NOT NULL,
	"adresse_ip" text,
	"appareil" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pv_signatures_unique" UNIQUE("pv_id","rang"),
	CONSTRAINT "pv_signatures_qui" CHECK ("pv_signatures"."user_id" IS NOT NULL OR "pv_signatures"."recueillie_par_user_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "pv_signatures" ADD CONSTRAINT "pv_signatures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_signatures" ADD CONSTRAINT "pv_signatures_pv_id_proces_verbaux_id_fk" FOREIGN KEY ("pv_id") REFERENCES "public"."proces_verbaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pv_signatures_pv_idx" ON "pv_signatures" USING btree ("organization_id","pv_id");--> statement-breakpoint
ALTER TABLE "pv_signatures" ENABLE ROW LEVEL SECURITY;
