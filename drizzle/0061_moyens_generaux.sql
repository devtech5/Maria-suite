CREATE TYPE "public"."sens_mouvement_fourniture" AS ENUM('entree', 'sortie');--> statement-breakpoint
ALTER TYPE "public"."type_actif" ADD VALUE 'local';--> statement-breakpoint
CREATE TABLE "fournitures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"designation" text NOT NULL,
	"unite" text DEFAULT 'unité' NOT NULL,
	"seuil" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fournitures_designation_unique" UNIQUE("organization_id","designation"),
	CONSTRAINT "fournitures_seuil" CHECK ("fournitures"."seuil" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mouvements_fournitures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fourniture_id" uuid NOT NULL,
	"sens" "sens_mouvement_fourniture" NOT NULL,
	"quantite" integer NOT NULL,
	"date" date NOT NULL,
	"cout" bigint,
	"employe_id" uuid,
	"service" text,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "mouvements_fournitures_quantite" CHECK ("mouvements_fournitures"."quantite" > 0),
	CONSTRAINT "mouvements_fournitures_cout" CHECK ("mouvements_fournitures"."cout" IS NULL OR ("mouvements_fournitures"."sens" = 'entree' AND "mouvements_fournitures"."cout" >= 0))
);
--> statement-breakpoint
ALTER TABLE "fournitures" ADD CONSTRAINT "fournitures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_fournitures" ADD CONSTRAINT "mouvements_fournitures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_fournitures" ADD CONSTRAINT "mouvements_fournitures_fourniture_id_fournitures_id_fk" FOREIGN KEY ("fourniture_id") REFERENCES "public"."fournitures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_fournitures" ADD CONSTRAINT "mouvements_fournitures_employe_id_employees_id_fk" FOREIGN KEY ("employe_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mouvements_fournitures_fourniture_idx" ON "mouvements_fournitures" USING btree ("organization_id","fourniture_id");--> statement-breakpoint
CREATE INDEX "mouvements_fournitures_date_idx" ON "mouvements_fournitures" USING btree ("organization_id","date");--> statement-breakpoint
ALTER TABLE "fournitures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mouvements_fournitures" ENABLE ROW LEVEL SECURITY;
