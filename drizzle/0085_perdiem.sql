CREATE TABLE "attributions_perdiem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"mission_id" uuid,
	"bareme_id" uuid,
	"bareme_libelle" text NOT NULL,
	"montant_journalier" bigint NOT NULL,
	"jours" integer NOT NULL,
	"montant_total" bigint NOT NULL,
	"debut" date,
	"motif" text,
	"statut" text DEFAULT 'a_payer' NOT NULL,
	"paye_le" date,
	"moyen" text,
	"reference" text,
	"paye_par_user_id" uuid,
	"motif_annulation" text,
	"cree_par_user_id" uuid,
	"annule_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "attributions_perdiem_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "attributions_perdiem_statut" CHECK ("attributions_perdiem"."statut" in ('a_payer', 'paye', 'annule')),
	CONSTRAINT "attributions_perdiem_montants" CHECK ("attributions_perdiem"."jours" > 0 AND "attributions_perdiem"."montant_journalier" > 0 AND "attributions_perdiem"."montant_total" = "attributions_perdiem"."jours" * "attributions_perdiem"."montant_journalier"),
	CONSTRAINT "attributions_perdiem_paiement" CHECK ("attributions_perdiem"."statut" <> 'paye' OR ("attributions_perdiem"."paye_le" IS NOT NULL AND "attributions_perdiem"."moyen" IS NOT NULL)),
	CONSTRAINT "attributions_perdiem_annulation_motivee" CHECK ("attributions_perdiem"."statut" <> 'annule' OR "attributions_perdiem"."motif_annulation" IS NOT NULL),
	CONSTRAINT "attributions_perdiem_moyen" CHECK ("attributions_perdiem"."moyen" IS NULL OR "attributions_perdiem"."moyen" in ('especes', 'mobile_money', 'virement'))
);
--> statement-breakpoint
CREATE TABLE "baremes_perdiem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"montant_journalier" bigint NOT NULL,
	"notes" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "baremes_perdiem_montant" CHECK ("baremes_perdiem"."montant_journalier" > 0)
);
--> statement-breakpoint
ALTER TABLE "attributions_perdiem" ADD CONSTRAINT "attributions_perdiem_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions_perdiem" ADD CONSTRAINT "attributions_perdiem_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions_perdiem" ADD CONSTRAINT "attributions_perdiem_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions_perdiem" ADD CONSTRAINT "attributions_perdiem_bareme_id_baremes_perdiem_id_fk" FOREIGN KEY ("bareme_id") REFERENCES "public"."baremes_perdiem"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions_perdiem" ADD CONSTRAINT "attributions_perdiem_paye_par_user_id_users_id_fk" FOREIGN KEY ("paye_par_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions_perdiem" ADD CONSTRAINT "attributions_perdiem_cree_par_user_id_users_id_fk" FOREIGN KEY ("cree_par_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baremes_perdiem" ADD CONSTRAINT "baremes_perdiem_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attributions_perdiem_employe_idx" ON "attributions_perdiem" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "attributions_perdiem_statut_idx" ON "attributions_perdiem" USING btree ("organization_id","statut");--> statement-breakpoint
CREATE INDEX "attributions_perdiem_mission_idx" ON "attributions_perdiem" USING btree ("mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baremes_perdiem_libelle_unique" ON "baremes_perdiem" USING btree ("organization_id",lower("libelle")) WHERE "baremes_perdiem"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "baremes_perdiem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attributions_perdiem" ENABLE ROW LEVEL SECURITY;
