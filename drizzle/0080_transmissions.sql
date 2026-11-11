CREATE TABLE "transmissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"sens" text NOT NULL,
	"statut" text NOT NULL,
	"objet" text NOT NULL,
	"mention" text NOT NULL,
	"pieces" jsonb NOT NULL,
	"emetteur_user_id" uuid,
	"emetteur_service_id" uuid,
	"destinataire_user_id" uuid,
	"destinataire_service_id" uuid,
	"tiers_id" uuid,
	"entreprise" text,
	"contact" text,
	"responsable_user_id" uuid,
	"date_limite" date,
	"moyen" text,
	"transmise_le" timestamp with time zone,
	"accuse_le" timestamp with time zone,
	"accuse_par" text,
	"recue_le" timestamp with time zone,
	"traitee_le" timestamp with time zone,
	"avis" text,
	"note" text,
	"preuve" text,
	"preuve_type" text,
	"pli_id" uuid,
	"derniere_relance_le" timestamp with time zone,
	"cree_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "transmissions_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "transmissions_sens" CHECK ("transmissions"."sens" in ('interne', 'sortante', 'entrante')),
	CONSTRAINT "transmissions_statut" CHECK ("transmissions"."statut" in ('a_transmettre', 'transmise', 'accusee', 'attendue', 'recue', 'traitee', 'annulee'))
);
--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_emetteur_user_id_users_id_fk" FOREIGN KEY ("emetteur_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_emetteur_service_id_services_id_fk" FOREIGN KEY ("emetteur_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_destinataire_user_id_users_id_fk" FOREIGN KEY ("destinataire_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_destinataire_service_id_services_id_fk" FOREIGN KEY ("destinataire_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_tiers_id_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_responsable_user_id_users_id_fk" FOREIGN KEY ("responsable_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_pli_id_plis_id_fk" FOREIGN KEY ("pli_id") REFERENCES "public"."plis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_cree_par_users_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transmissions_org_idx" ON "transmissions" USING btree ("organization_id","sens","statut");--> statement-breakpoint
CREATE INDEX "transmissions_destinataire_idx" ON "transmissions" USING btree ("organization_id","destinataire_user_id");--> statement-breakpoint
CREATE INDEX "transmissions_limite_idx" ON "transmissions" USING btree ("organization_id","date_limite");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "transmissions" ENABLE ROW LEVEL SECURITY;
