CREATE TABLE "intervenants_mission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"tache" text NOT NULL,
	"nature" text NOT NULL,
	"nom" text NOT NULL,
	"telephone" text,
	"worker_id" uuid,
	"prestataire_id" uuid,
	"montant_convenu" bigint NOT NULL,
	"statut" text DEFAULT 'a_payer' NOT NULL,
	"paye_le" date,
	"moyen" text,
	"recu_par" text,
	"decharge_chemin" text,
	"decharge_nom" text,
	"decharge_type" text,
	"paye_par_user_id" uuid,
	"motif_annulation" text,
	"cree_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "intervenants_mission_nature" CHECK ("intervenants_mission"."nature" in ('intervenant', 'entreprise', 'prestataire')),
	CONSTRAINT "intervenants_mission_statut" CHECK ("intervenants_mission"."statut" in ('a_payer', 'paye', 'annule')),
	CONSTRAINT "intervenants_mission_montant" CHECK ("intervenants_mission"."montant_convenu" > 0),
	CONSTRAINT "intervenants_mission_moyen" CHECK ("intervenants_mission"."moyen" IS NULL OR "intervenants_mission"."moyen" in ('especes', 'mobile_money')),
	CONSTRAINT "intervenants_mission_paiement" CHECK ("intervenants_mission"."statut" <> 'paye' OR ("intervenants_mission"."paye_le" IS NOT NULL AND "intervenants_mission"."moyen" IS NOT NULL AND "intervenants_mission"."recu_par" IS NOT NULL AND "intervenants_mission"."decharge_chemin" IS NOT NULL)),
	CONSTRAINT "intervenants_mission_annulation_motivee" CHECK ("intervenants_mission"."statut" <> 'annule' OR "intervenants_mission"."motif_annulation" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "budget" bigint;--> statement-breakpoint
ALTER TABLE "intervenants_mission" ADD CONSTRAINT "intervenants_mission_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervenants_mission" ADD CONSTRAINT "intervenants_mission_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervenants_mission" ADD CONSTRAINT "intervenants_mission_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervenants_mission" ADD CONSTRAINT "intervenants_mission_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intervenants_mission_mission_idx" ON "intervenants_mission" USING btree ("organization_id","mission_id");--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_budget_positif" CHECK ("missions"."budget" IS NULL OR "missions"."budget" >= 0);--> statement-breakpoint
ALTER TABLE "intervenants_mission" ENABLE ROW LEVEL SECURITY;
