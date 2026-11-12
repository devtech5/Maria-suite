CREATE TABLE "membres_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"projet_id" uuid NOT NULL,
	"role" text NOT NULL,
	"origine" text NOT NULL,
	"employee_id" uuid,
	"user_id" uuid,
	"nom" text,
	"telephone" text,
	"organisme" text,
	"actif" boolean DEFAULT true NOT NULL,
	"confie_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "membres_projet_role" CHECK ("membres_projet"."role" in ('superviseur', 'agent')),
	CONSTRAINT "membres_projet_origine" CHECK ("membres_projet"."origine" in ('interne', 'externe')),
	CONSTRAINT "membres_projet_identite" CHECK (("membres_projet"."origine" = 'externe' AND "membres_projet"."employee_id" IS NULL AND "membres_projet"."user_id" IS NULL AND "membres_projet"."nom" IS NOT NULL) OR ("membres_projet"."origine" = 'interne' AND ("membres_projet"."employee_id" IS NOT NULL OR "membres_projet"."user_id" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "preuves_releve" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"releve_id" uuid NOT NULL,
	"nature" text NOT NULL,
	"chemin" text NOT NULL,
	"nom_fichier" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille_octets" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "preuves_releve_nature" CHECK ("preuves_releve"."nature" in ('photo', 'capture'))
);
--> statement-breakpoint
CREATE TABLE "releves_projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"projet_id" uuid NOT NULL,
	"membre_id" uuid NOT NULL,
	"saisi_par_user_id" uuid,
	"libelle" text NOT NULL,
	"note" text,
	"avancement" integer,
	"latitude_micro" integer NOT NULL,
	"longitude_micro" integer NOT NULL,
	"precision_m" integer,
	"prise_le" timestamp with time zone NOT NULL,
	"recue_le" timestamp with time zone DEFAULT now() NOT NULL,
	"statut" text DEFAULT 'soumis' NOT NULL,
	"revise_par_user_id" uuid,
	"revise_le" timestamp with time zone,
	"commentaire" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "releves_projet_statut" CHECK ("releves_projet"."statut" in ('soumis', 'valide', 'a_refaire')),
	CONSTRAINT "releves_projet_avancement" CHECK ("releves_projet"."avancement" IS NULL OR "releves_projet"."avancement" BETWEEN 0 AND 100),
	CONSTRAINT "releves_projet_position" CHECK ("releves_projet"."latitude_micro" BETWEEN -90000000 AND 90000000 AND "releves_projet"."longitude_micro" BETWEEN -180000000 AND 180000000 AND NOT ("releves_projet"."latitude_micro" = 0 AND "releves_projet"."longitude_micro" = 0)),
	CONSTRAINT "releves_projet_renvoi_motive" CHECK ("releves_projet"."statut" <> 'a_refaire' OR "releves_projet"."commentaire" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membres_projet" ADD CONSTRAINT "membres_projet_confie_par_users_id_fk" FOREIGN KEY ("confie_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preuves_releve" ADD CONSTRAINT "preuves_releve_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preuves_releve" ADD CONSTRAINT "preuves_releve_releve_id_releves_projet_id_fk" FOREIGN KEY ("releve_id") REFERENCES "public"."releves_projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releves_projet" ADD CONSTRAINT "releves_projet_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releves_projet" ADD CONSTRAINT "releves_projet_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releves_projet" ADD CONSTRAINT "releves_projet_membre_id_membres_projet_id_fk" FOREIGN KEY ("membre_id") REFERENCES "public"."membres_projet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releves_projet" ADD CONSTRAINT "releves_projet_saisi_par_user_id_users_id_fk" FOREIGN KEY ("saisi_par_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releves_projet" ADD CONSTRAINT "releves_projet_revise_par_user_id_users_id_fk" FOREIGN KEY ("revise_par_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membres_projet_projet_idx" ON "membres_projet" USING btree ("organization_id","projet_id");--> statement-breakpoint
CREATE INDEX "membres_projet_user_idx" ON "membres_projet" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membres_projet_superviseur_unique" ON "membres_projet" USING btree ("projet_id") WHERE "membres_projet"."role" = 'superviseur' AND "membres_projet"."actif" AND "membres_projet"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "membres_projet_employe_unique" ON "membres_projet" USING btree ("projet_id","employee_id") WHERE "membres_projet"."employee_id" IS NOT NULL AND "membres_projet"."actif" AND "membres_projet"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "membres_projet_compte_unique" ON "membres_projet" USING btree ("projet_id","user_id") WHERE "membres_projet"."user_id" IS NOT NULL AND "membres_projet"."actif" AND "membres_projet"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "preuves_releve_chemin_unique" ON "preuves_releve" USING btree ("organization_id","chemin");--> statement-breakpoint
CREATE INDEX "preuves_releve_releve_idx" ON "preuves_releve" USING btree ("releve_id");--> statement-breakpoint
CREATE INDEX "releves_projet_projet_idx" ON "releves_projet" USING btree ("organization_id","projet_id","prise_le");--> statement-breakpoint
CREATE INDEX "releves_projet_membre_idx" ON "releves_projet" USING btree ("membre_id");--> statement-breakpoint
ALTER TABLE "membres_projet" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "releves_projet" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "preuves_releve" ENABLE ROW LEVEL SECURITY;
