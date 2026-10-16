CREATE TABLE "courriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"lieu" text NOT NULL,
	"date_courrier" date NOT NULL,
	"destinataire" text,
	"objet" text NOT NULL,
	"corps" text NOT NULL,
	"signataire" text NOT NULL,
	"fonction" text,
	"redige_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "courriers_numero_unique" UNIQUE("organization_id","numero")
);
--> statement-breakpoint
ALTER TABLE "courriers" ADD CONSTRAINT "courriers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courriers_date_idx" ON "courriers" USING btree ("organization_id","date_courrier");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "courriers" ENABLE ROW LEVEL SECURITY;
