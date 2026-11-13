CREATE TABLE "adresses_pro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"adresse" text NOT NULL,
	"libelle" text,
	"service_id" uuid,
	"employee_id" uuid,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "adresses_pro_minuscules" CHECK ("adresses_pro"."adresse" = lower("adresses_pro"."adresse")),
	CONSTRAINT "adresses_pro_forme" CHECK ("adresses_pro"."adresse" LIKE '%_@_%'),
	CONSTRAINT "adresses_pro_titulaire_a_un_service" CHECK ("adresses_pro"."employee_id" IS NULL OR "adresses_pro"."service_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "numeros_collaborateurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"nature" text DEFAULT 'mobile' NOT NULL,
	"usage" text DEFAULT 'professionnel' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "numeros_collaborateurs_nature" CHECK ("numeros_collaborateurs"."nature" in ('mobile', 'fixe', 'whatsapp')),
	CONSTRAINT "numeros_collaborateurs_usage" CHECK ("numeros_collaborateurs"."usage" in ('professionnel', 'personnel')),
	CONSTRAINT "numeros_collaborateurs_chiffres" CHECK ("numeros_collaborateurs"."numero" ~ '^[0-9]{8,15}$')
);
--> statement-breakpoint
ALTER TABLE "adresses_pro" ADD CONSTRAINT "adresses_pro_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adresses_pro" ADD CONSTRAINT "adresses_pro_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adresses_pro" ADD CONSTRAINT "adresses_pro_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeros_collaborateurs" ADD CONSTRAINT "numeros_collaborateurs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeros_collaborateurs" ADD CONSTRAINT "numeros_collaborateurs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "adresses_pro_adresse_unique" ON "adresses_pro" USING btree ("organization_id","adresse") WHERE "adresses_pro"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "adresses_pro_service_idx" ON "adresses_pro" USING btree ("organization_id","service_id");--> statement-breakpoint
CREATE INDEX "adresses_pro_employe_idx" ON "adresses_pro" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "numeros_collaborateurs_unique" ON "numeros_collaborateurs" USING btree ("employee_id","numero") WHERE "numeros_collaborateurs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "numeros_collaborateurs_org_idx" ON "numeros_collaborateurs" USING btree ("organization_id","employee_id");
--> statement-breakpoint
ALTER TABLE "adresses_pro" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "numeros_collaborateurs" ENABLE ROW LEVEL SECURITY;
