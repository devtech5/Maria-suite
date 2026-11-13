-- Suivi d'une tâche : sous-tâches, mises à jour (fil de messages) et fichiers.
CREATE TABLE "taches_fichiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	"nom_fichier" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille" integer NOT NULL,
	"chemin" text NOT NULL,
	"depose_par_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "taches_fichiers_taille" CHECK ("taches_fichiers"."taille" > 0)
);
--> statement-breakpoint
CREATE TABLE "taches_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	"auteur_user_id" uuid NOT NULL,
	"corps" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taches_sous_taches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"faite" boolean DEFAULT false NOT NULL,
	"faite_le" timestamp with time zone,
	"faite_par_user_id" uuid,
	"responsable_employe_id" uuid,
	"responsable_worker_id" uuid,
	"echeance" date,
	"rang" integer DEFAULT 0 NOT NULL,
	"cree_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "taches_sous_taches_un_responsable" CHECK ("taches_sous_taches"."responsable_employe_id" IS NULL OR "taches_sous_taches"."responsable_worker_id" IS NULL),
	CONSTRAINT "taches_sous_taches_faite_datee" CHECK (NOT "taches_sous_taches"."faite" OR "taches_sous_taches"."faite_le" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "taches_fichiers" ADD CONSTRAINT "taches_fichiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_fichiers" ADD CONSTRAINT "taches_fichiers_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_messages" ADD CONSTRAINT "taches_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_messages" ADD CONSTRAINT "taches_messages_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_sous_taches" ADD CONSTRAINT "taches_sous_taches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_sous_taches" ADD CONSTRAINT "taches_sous_taches_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_sous_taches" ADD CONSTRAINT "taches_sous_taches_responsable_employe_id_employees_id_fk" FOREIGN KEY ("responsable_employe_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_sous_taches" ADD CONSTRAINT "taches_sous_taches_responsable_worker_id_workers_id_fk" FOREIGN KEY ("responsable_worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taches_fichiers_tache" ON "taches_fichiers" USING btree ("organization_id","tache_id");--> statement-breakpoint
CREATE INDEX "taches_messages_tache" ON "taches_messages" USING btree ("organization_id","tache_id","created_at");--> statement-breakpoint
CREATE INDEX "taches_sous_taches_tache" ON "taches_sous_taches" USING btree ("organization_id","tache_id","rang");--> statement-breakpoint
ALTER TABLE "taches_sous_taches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taches_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taches_fichiers" ENABLE ROW LEVEL SECURITY;
