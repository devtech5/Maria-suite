CREATE TABLE "anniversaires_annonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"jour" date NOT NULL,
	"nature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "anniversaires_annonces_unique" UNIQUE("employee_id","jour","nature"),
	CONSTRAINT "anniversaires_annonces_nature" CHECK ("anniversaires_annonces"."nature" in ('rappel', 'jour'))
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "anniversaire_annonce" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "anniversaires_annonces" ADD CONSTRAINT "anniversaires_annonces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anniversaires_annonces" ADD CONSTRAINT "anniversaires_annonces_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anniversaires_annonces_org_idx" ON "anniversaires_annonces" USING btree ("organization_id","jour");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "anniversaires_annonces" ENABLE ROW LEVEL SECURITY;
