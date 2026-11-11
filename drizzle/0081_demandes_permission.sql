CREATE TABLE "demandes_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"genre" text NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"heure_debut" text,
	"heure_fin" text,
	"minutes" integer DEFAULT 0 NOT NULL,
	"jours_centiemes" integer DEFAULT 0 NOT NULL,
	"motif" text NOT NULL,
	"precision" text,
	"justificatif" text,
	"statut" "statut_conge" DEFAULT 'demande' NOT NULL,
	"traitement" text,
	"centiemes_deduits" integer DEFAULT 0 NOT NULL,
	"demande_par_user_id" uuid NOT NULL,
	"decide_par_user_id" uuid,
	"decide_le" timestamp with time zone,
	"commentaire" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "demandes_permission_numero" UNIQUE("organization_id","numero"),
	CONSTRAINT "demandes_permission_genre" CHECK ("demandes_permission"."genre" IN ('heures', 'journees')),
	CONSTRAINT "demandes_permission_periode" CHECK ("demandes_permission"."fin" >= "demandes_permission"."debut"),
	CONSTRAINT "demandes_permission_heures" CHECK ("demandes_permission"."genre" = 'journees' OR ("demandes_permission"."fin" = "demandes_permission"."debut" AND "demandes_permission"."heure_debut" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "demandes_permission"."heure_fin" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "demandes_permission"."heure_fin" > "demandes_permission"."heure_debut")),
	CONSTRAINT "demandes_permission_motif" CHECK ("demandes_permission"."motif" IN ('medical', 'administratif', 'familial', 'enfant', 'personnel', 'autre')),
	CONSTRAINT "demandes_permission_traitement" CHECK ("demandes_permission"."traitement" IS NULL OR "demandes_permission"."traitement" IN ('payee', 'a_recuperer', 'deduite_conges', 'non_payee')),
	CONSTRAINT "demandes_permission_durees" CHECK ("demandes_permission"."minutes" >= 0 AND "demandes_permission"."jours_centiemes" >= 0 AND "demandes_permission"."centiemes_deduits" >= 0)
);
--> statement-breakpoint
ALTER TABLE "demandes_permission" ADD CONSTRAINT "demandes_permission_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demandes_permission" ADD CONSTRAINT "demandes_permission_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demandes_permission_salarie" ON "demandes_permission" USING btree ("organization_id","employee_id","debut");--> statement-breakpoint
CREATE INDEX "demandes_permission_statut" ON "demandes_permission" USING btree ("organization_id","statut");
--> statement-breakpoint
ALTER TABLE "demandes_permission" ENABLE ROW LEVEL SECURITY;
