CREATE TABLE "reglement_acceptations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"accepte_le" timestamp with time zone DEFAULT now() NOT NULL,
	"adresse_ip" text,
	"appareil" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reglement_acceptations_unique" UNIQUE("version_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reglement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" integer,
	"statut" text DEFAULT 'brouillon' NOT NULL,
	"titre" text NOT NULL,
	"preambule" text,
	"articles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resume" text,
	"date_effet" date,
	"publie_le" timestamp with time zone,
	"publie_par" uuid,
	"cree_par" uuid,
	"derniere_relance_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reglement_versions_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "reglement_versions_statut" CHECK ("reglement_versions"."statut" in ('brouillon', 'publie')),
	CONSTRAINT "reglement_versions_publiee" CHECK ("reglement_versions"."statut" = 'brouillon' or ("reglement_versions"."numero" is not null and "reglement_versions"."date_effet" is not null and "reglement_versions"."publie_le" is not null))
);
--> statement-breakpoint
ALTER TABLE "reglement_acceptations" ADD CONSTRAINT "reglement_acceptations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglement_acceptations" ADD CONSTRAINT "reglement_acceptations_version_id_reglement_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."reglement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglement_acceptations" ADD CONSTRAINT "reglement_acceptations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglement_versions" ADD CONSTRAINT "reglement_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglement_versions" ADD CONSTRAINT "reglement_versions_publie_par_users_id_fk" FOREIGN KEY ("publie_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglement_versions" ADD CONSTRAINT "reglement_versions_cree_par_users_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reglement_acceptations_user_idx" ON "reglement_acceptations" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "reglement_versions_org_idx" ON "reglement_versions" USING btree ("organization_id","statut","date_effet");--> statement-breakpoint
CREATE UNIQUE INDEX "reglement_versions_un_brouillon" ON "reglement_versions" USING btree ("organization_id") WHERE statut = 'brouillon' and deleted_at is null;--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "reglement_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reglement_acceptations" ENABLE ROW LEVEL SECURITY;
