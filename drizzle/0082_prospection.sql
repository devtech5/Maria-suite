ALTER TYPE "public"."nature_tiers" ADD VALUE 'ong';--> statement-breakpoint
ALTER TYPE "public"."nature_tiers" ADD VALUE 'mutuelle';--> statement-breakpoint
ALTER TYPE "public"."nature_tiers" ADD VALUE 'association';--> statement-breakpoint
ALTER TYPE "public"."nature_tiers" ADD VALUE 'cooperative';--> statement-breakpoint
CREATE TABLE "actions_prospection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"date_prevue" date NOT NULL,
	"heure" text,
	"canal" text NOT NULL,
	"objet" text NOT NULL,
	"statut" text DEFAULT 'prevue' NOT NULL,
	"compte_rendu" text,
	"realisee_le" timestamp with time zone,
	"realisee_par" uuid,
	"cree_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "actions_prospection_canal" CHECK ("actions_prospection"."canal" in ('visite', 'appel', 'whatsapp', 'email', 'rendez_vous', 'demonstration')),
	CONSTRAINT "actions_prospection_statut" CHECK ("actions_prospection"."statut" in ('prevue', 'realisee', 'annulee')),
	CONSTRAINT "actions_prospection_heure" CHECK ("actions_prospection"."heure" IS NULL OR "actions_prospection"."heure" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "plans_prospection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"commercial_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"zone" text,
	"cibles" text,
	"objectif_contacts" integer DEFAULT 0 NOT NULL,
	"objectif_clients" integer DEFAULT 0 NOT NULL,
	"objectif_ca" bigint DEFAULT 0 NOT NULL,
	"statut" text DEFAULT 'ouvert' NOT NULL,
	"notes" text,
	"clos_le" timestamp with time zone,
	"cree_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "plans_prospection_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "plans_prospection_periode" CHECK ("plans_prospection"."fin" >= "plans_prospection"."debut"),
	CONSTRAINT "plans_prospection_objectifs" CHECK ("plans_prospection"."objectif_contacts" >= 0 AND "plans_prospection"."objectif_clients" >= 0 AND "plans_prospection"."objectif_ca" >= 0),
	CONSTRAINT "plans_prospection_statut" CHECK ("plans_prospection"."statut" in ('ouvert', 'clos'))
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"nature" "nature_tiers" DEFAULT 'entreprise' NOT NULL,
	"contact" text,
	"fonction" text,
	"telephone" text,
	"email" text,
	"ville" text,
	"secteur" text,
	"besoin" text,
	"potentiel" bigint DEFAULT 0 NOT NULL,
	"statut" text DEFAULT 'a_contacter' NOT NULL,
	"motif_perte" text,
	"tiers_id" uuid,
	"converti_le" timestamp with time zone,
	"cree_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "prospects_potentiel" CHECK ("prospects"."potentiel" >= 0),
	CONSTRAINT "prospects_statut" CHECK ("prospects"."statut" in ('a_contacter', 'en_discussion', 'interesse', 'converti', 'perdu')),
	CONSTRAINT "prospects_converti" CHECK ("prospects"."statut" <> 'converti' OR "prospects"."tiers_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "actions_prospection" ADD CONSTRAINT "actions_prospection_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions_prospection" ADD CONSTRAINT "actions_prospection_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions_prospection" ADD CONSTRAINT "actions_prospection_realisee_par_users_id_fk" FOREIGN KEY ("realisee_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions_prospection" ADD CONSTRAINT "actions_prospection_cree_par_users_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_prospection" ADD CONSTRAINT "plans_prospection_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_prospection" ADD CONSTRAINT "plans_prospection_commercial_id_commerciaux_id_fk" FOREIGN KEY ("commercial_id") REFERENCES "public"."commerciaux"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans_prospection" ADD CONSTRAINT "plans_prospection_cree_par_users_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_plan_id_plans_prospection_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans_prospection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_tiers_id_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_cree_par_users_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_prospection_prospect_idx" ON "actions_prospection" USING btree ("organization_id","prospect_id");--> statement-breakpoint
CREATE INDEX "actions_prospection_date_idx" ON "actions_prospection" USING btree ("organization_id","date_prevue");--> statement-breakpoint
CREATE INDEX "plans_prospection_commercial_idx" ON "plans_prospection" USING btree ("organization_id","commercial_id","debut");--> statement-breakpoint
CREATE INDEX "prospects_plan_idx" ON "prospects" USING btree ("organization_id","plan_id");--> statement-breakpoint
ALTER TABLE "plans_prospection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "actions_prospection" ENABLE ROW LEVEL SECURITY;
