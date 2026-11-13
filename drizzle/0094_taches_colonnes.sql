-- Colonnes personnalisées du tableau des tâches (texte, nombre, date, étiquettes,
-- case à cocher, lien) et leurs valeurs, une par tâche et par colonne.
CREATE TABLE "taches_colonnes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rang" integer DEFAULT 0 NOT NULL,
	"cree_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "taches_colonnes_type" CHECK ("taches_colonnes"."type" IN ('texte', 'nombre', 'date', 'etiquette', 'case', 'lien'))
);
--> statement-breakpoint
CREATE TABLE "taches_valeurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	"colonne_id" uuid NOT NULL,
	"valeur" text,
	"modifie_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "taches_valeurs_unique" UNIQUE("tache_id","colonne_id")
);
--> statement-breakpoint
ALTER TABLE "taches_colonnes" ADD CONSTRAINT "taches_colonnes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_valeurs" ADD CONSTRAINT "taches_valeurs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_valeurs" ADD CONSTRAINT "taches_valeurs_tache_id_taches_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."taches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taches_valeurs" ADD CONSTRAINT "taches_valeurs_colonne_id_taches_colonnes_id_fk" FOREIGN KEY ("colonne_id") REFERENCES "public"."taches_colonnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taches_colonnes_rang" ON "taches_colonnes" USING btree ("organization_id","rang");--> statement-breakpoint
CREATE INDEX "taches_valeurs_org" ON "taches_valeurs" USING btree ("organization_id","colonne_id");--> statement-breakpoint
ALTER TABLE "taches_colonnes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taches_valeurs" ENABLE ROW LEVEL SECURITY;
