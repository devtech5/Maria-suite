CREATE TABLE "accueils" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"lieu" text,
	"piece_exigee" boolean DEFAULT true NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "accueils_nom_unique" UNIQUE("organization_id","nom")
);
--> statement-breakpoint
CREATE TABLE "accueils_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"accueil_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "accueils_agents_unique" UNIQUE("accueil_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "visites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"accueil_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"statut" text NOT NULL,
	"nom" text NOT NULL,
	"telephone" text,
	"societe" text,
	"motif" text NOT NULL,
	"type_piece" text,
	"numero_piece" text,
	"visite_user_id" uuid,
	"visite_libelle" text,
	"attendu_le" timestamp with time zone,
	"arrivee_le" timestamp with time zone,
	"sortie_le" timestamp with time zone,
	"jeton_badge" text NOT NULL,
	"photo_recto" text,
	"photo_verso" text,
	"photo_visiteur" text,
	"photos_effacees_le" timestamp with time zone,
	"annonce_par" uuid,
	"arrivee_par" uuid,
	"sortie_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "visites_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "visites_jeton_unique" UNIQUE("jeton_badge"),
	CONSTRAINT "visites_statut" CHECK ("visites"."statut" in ('attendue', 'presente', 'sortie', 'annulee')),
	CONSTRAINT "visites_arrivee" CHECK ("visites"."statut" in ('attendue', 'annulee') or "visites"."arrivee_le" is not null),
	CONSTRAINT "visites_sortie" CHECK ("visites"."statut" <> 'sortie' or "visites"."sortie_le" is not null)
);
--> statement-breakpoint
ALTER TABLE "accueils" ADD CONSTRAINT "accueils_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accueils_agents" ADD CONSTRAINT "accueils_agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accueils_agents" ADD CONSTRAINT "accueils_agents_accueil_id_accueils_id_fk" FOREIGN KEY ("accueil_id") REFERENCES "public"."accueils"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accueils_agents" ADD CONSTRAINT "accueils_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_accueil_id_accueils_id_fk" FOREIGN KEY ("accueil_id") REFERENCES "public"."accueils"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_visite_user_id_users_id_fk" FOREIGN KEY ("visite_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_annonce_par_users_id_fk" FOREIGN KEY ("annonce_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_arrivee_par_users_id_fk" FOREIGN KEY ("arrivee_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_sortie_par_users_id_fk" FOREIGN KEY ("sortie_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accueils_agents_user_idx" ON "accueils_agents" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "visites_accueil_idx" ON "visites" USING btree ("organization_id","accueil_id","statut");--> statement-breakpoint
CREATE INDEX "visites_arrivee_idx" ON "visites" USING btree ("organization_id","arrivee_le");--> statement-breakpoint
CREATE INDEX "visites_attendu_idx" ON "visites" USING btree ("organization_id","attendu_le");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "accueils" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accueils_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visites" ENABLE ROW LEVEL SECURITY;
