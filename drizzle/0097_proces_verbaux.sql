-- Procès-verbaux, comptes rendus et rapports : rédaction, validation par la
-- direction, publication numérotée, diffusion avec accusé de lecture, actions.
CREATE TABLE "proces_verbaux" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"remplace_id" uuid,
	"type" text DEFAULT 'reunion' NOT NULL,
	"statut" text DEFAULT 'brouillon' NOT NULL,
	"objet" text NOT NULL,
	"date_seance" date NOT NULL,
	"lieu" text,
	"reunion_id" uuid,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conclusion" text,
	"diffusion" jsonb DEFAULT '{"tous":false,"services":[],"comptes":[]}'::jsonb NOT NULL,
	"accuse_requis" boolean DEFAULT false NOT NULL,
	"confidentiel" boolean DEFAULT false NOT NULL,
	"redige_par_user_id" uuid NOT NULL,
	"soumis_le" timestamp with time zone,
	"remarque" text,
	"publie_le" timestamp with time zone,
	"publie_par_user_id" uuid,
	"derniere_relance_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "proces_verbaux_numero_revision" UNIQUE("organization_id","numero","revision"),
	CONSTRAINT "proces_verbaux_type" CHECK ("proces_verbaux"."type" IN ('reunion', 'compte_rendu', 'rapport')),
	CONSTRAINT "proces_verbaux_statut" CHECK ("proces_verbaux"."statut" IN ('brouillon', 'a_valider', 'publie')),
	CONSTRAINT "proces_verbaux_publie" CHECK ("proces_verbaux"."statut" <> 'publie' OR ("proces_verbaux"."numero" IS NOT NULL AND "proces_verbaux"."publie_le" IS NOT NULL)),
	CONSTRAINT "proces_verbaux_revision" CHECK ("proces_verbaux"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "pv_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pv_id" uuid NOT NULL,
	"rang" integer DEFAULT 0 NOT NULL,
	"libelle" text NOT NULL,
	"responsable_employe_id" uuid,
	"echeance" date,
	"tache_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pv_lectures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pv_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"lu_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pv_lectures_unique" UNIQUE("pv_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD CONSTRAINT "proces_verbaux_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proces_verbaux" ADD CONSTRAINT "proces_verbaux_reunion_id_reunions_id_fk" FOREIGN KEY ("reunion_id") REFERENCES "public"."reunions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_actions" ADD CONSTRAINT "pv_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_actions" ADD CONSTRAINT "pv_actions_pv_id_proces_verbaux_id_fk" FOREIGN KEY ("pv_id") REFERENCES "public"."proces_verbaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_actions" ADD CONSTRAINT "pv_actions_responsable_employe_id_employees_id_fk" FOREIGN KEY ("responsable_employe_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_actions" ADD CONSTRAINT "pv_actions_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_lectures" ADD CONSTRAINT "pv_lectures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pv_lectures" ADD CONSTRAINT "pv_lectures_pv_id_proces_verbaux_id_fk" FOREIGN KEY ("pv_id") REFERENCES "public"."proces_verbaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proces_verbaux_org_idx" ON "proces_verbaux" USING btree ("organization_id","statut","date_seance");--> statement-breakpoint
CREATE INDEX "proces_verbaux_redacteur_idx" ON "proces_verbaux" USING btree ("organization_id","redige_par_user_id");--> statement-breakpoint
CREATE INDEX "pv_actions_pv_idx" ON "pv_actions" USING btree ("organization_id","pv_id","rang");--> statement-breakpoint
CREATE INDEX "pv_lectures_user_idx" ON "pv_lectures" USING btree ("organization_id","user_id");--> statement-breakpoint
ALTER TABLE "proces_verbaux" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pv_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pv_lectures" ENABLE ROW LEVEL SECURITY;
