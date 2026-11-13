-- Intervenants d'une tâche : collaborateurs du Personnel ou intervenants (workers),
-- en plus du responsable. Une ligne par personne et par tâche, retrait logique.
CREATE TABLE "taches_intervenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	"employee_id" uuid,
	"worker_id" uuid,
	"ajoute_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "taches_intervenants_un_seul" CHECK (("taches_intervenants"."employee_id" IS NULL) <> ("taches_intervenants"."worker_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "taches_intervenants" ADD CONSTRAINT "taches_intervenants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_intervenants" ADD CONSTRAINT "taches_intervenants_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_intervenants" ADD CONSTRAINT "taches_intervenants_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_intervenants" ADD CONSTRAINT "taches_intervenants_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taches_intervenants_collaborateur" ON "taches_intervenants" USING btree ("tache_id","employee_id") WHERE "taches_intervenants"."employee_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "taches_intervenants_intervenant" ON "taches_intervenants" USING btree ("tache_id","worker_id") WHERE "taches_intervenants"."worker_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "taches_intervenants_tache" ON "taches_intervenants" USING btree ("organization_id","tache_id");--> statement-breakpoint
ALTER TABLE "taches_intervenants" ENABLE ROW LEVEL SECURITY;
