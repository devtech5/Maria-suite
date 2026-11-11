CREATE TABLE "plis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sens" text NOT NULL,
	"numero" text NOT NULL,
	"statut" text NOT NULL,
	"nature" text NOT NULL,
	"canal" text NOT NULL,
	"objet" text NOT NULL,
	"correspondant" text NOT NULL,
	"reference" text,
	"date_document" date,
	"confidentiel" boolean DEFAULT false NOT NULL,
	"enregistre_le" timestamp with time zone DEFAULT now() NOT NULL,
	"enregistre_par" uuid,
	"impute_user_id" uuid,
	"impute_service_id" uuid,
	"instructions" text,
	"delai_reponse" date,
	"impute_par" uuid,
	"impute_le" timestamp with time zone,
	"accuse_le" timestamp with time zone,
	"traite_le" timestamp with time zone,
	"traite_par" uuid,
	"note_traitement" text,
	"reponse_pli_id" uuid,
	"derniere_relance_le" timestamp with time zone,
	"courrier_id" uuid,
	"transporteur" text,
	"numero_suivi" text,
	"expedie_le" timestamp with time zone,
	"remis_le" timestamp with time zone,
	"decharge_nom" text,
	"scan" text,
	"scan_type" text,
	"decharge" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "plis_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "plis_sens" CHECK ("plis"."sens" in ('arrivee', 'depart')),
	CONSTRAINT "plis_statut" CHECK (("plis"."sens" = 'arrivee' and "plis"."statut" in ('enregistre', 'impute', 'recu', 'traite')) or ("plis"."sens" = 'depart' and "plis"."statut" in ('a_expedier', 'expedie', 'remis')))
);
--> statement-breakpoint
ALTER TABLE "plis" ADD CONSTRAINT "plis_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plis" ADD CONSTRAINT "plis_enregistre_par_users_id_fk" FOREIGN KEY ("enregistre_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plis" ADD CONSTRAINT "plis_impute_user_id_users_id_fk" FOREIGN KEY ("impute_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plis" ADD CONSTRAINT "plis_impute_service_id_services_id_fk" FOREIGN KEY ("impute_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plis" ADD CONSTRAINT "plis_impute_par_users_id_fk" FOREIGN KEY ("impute_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plis" ADD CONSTRAINT "plis_traite_par_users_id_fk" FOREIGN KEY ("traite_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plis" ADD CONSTRAINT "plis_courrier_id_courriers_id_fk" FOREIGN KEY ("courrier_id") REFERENCES "public"."courriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plis_registre_idx" ON "plis" USING btree ("organization_id","sens","enregistre_le");--> statement-breakpoint
CREATE INDEX "plis_impute_idx" ON "plis" USING btree ("organization_id","impute_user_id","statut");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "plis" ENABLE ROW LEVEL SECURITY;
