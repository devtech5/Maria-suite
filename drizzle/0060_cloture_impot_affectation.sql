ALTER TYPE "public"."origine_piece" ADD VALUE 'impot';--> statement-breakpoint
ALTER TYPE "public"."origine_piece" ADD VALUE 'affectation';--> statement-breakpoint
CREATE TABLE "affectations_resultat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exercice" text NOT NULL,
	"resultat" bigint NOT NULL,
	"reserve_legale" bigint DEFAULT 0 NOT NULL,
	"autres_reserves" bigint DEFAULT 0 NOT NULL,
	"dividendes" bigint DEFAULT 0 NOT NULL,
	"report_a_nouveau" bigint DEFAULT 0 NOT NULL,
	"date_decision" date NOT NULL,
	"ecriture" text NOT NULL,
	"decide_par_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "affectations_resultat_exercice" UNIQUE("organization_id","exercice")
);
--> statement-breakpoint
CREATE TABLE "fractions_impot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"impot_id" uuid NOT NULL,
	"exercice" text NOT NULL,
	"rang" integer NOT NULL,
	"echeance" date NOT NULL,
	"montant" bigint NOT NULL,
	"payee_le" date,
	"ecriture" text,
	"compte_tresorerie_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fractions_impot_rang" UNIQUE("organization_id","exercice","rang"),
	CONSTRAINT "fractions_impot_montant" CHECK ("fractions_impot"."montant" > 0),
	CONSTRAINT "fractions_impot_payee" CHECK ("fractions_impot"."payee_le" IS NULL OR "fractions_impot"."ecriture" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "impots_benefices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exercice" text NOT NULL,
	"resultat_comptable" bigint NOT NULL,
	"reintegrations" bigint DEFAULT 0 NOT NULL,
	"deductions" bigint DEFAULT 0 NOT NULL,
	"resultat_fiscal" bigint NOT NULL,
	"chiffre_affaires" bigint NOT NULL,
	"impot_theorique" bigint NOT NULL,
	"imf" bigint NOT NULL,
	"impot_du" bigint NOT NULL,
	"regle_appliquee" jsonb NOT NULL,
	"ecriture" text,
	"constate_le" timestamp with time zone DEFAULT now() NOT NULL,
	"constate_par_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "impots_benefices_exercice" UNIQUE("organization_id","exercice"),
	CONSTRAINT "impots_benefices_format" CHECK ("impots_benefices"."exercice" ~ '^[0-9]{4}$'),
	CONSTRAINT "impots_benefices_montants" CHECK ("impots_benefices"."impot_du" >= 0 AND ("impots_benefices"."impot_du" = 0 OR "impots_benefices"."ecriture" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "parametres_fiscaux" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"regle_impot" jsonb NOT NULL,
	"verifie_le" timestamp with time zone,
	"verifie_par_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "parametres_fiscaux_organisation" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "reouvertures_exercice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exercice" text NOT NULL,
	"motif" text NOT NULL,
	"resultat_annule" bigint NOT NULL,
	"ecritures" text[] NOT NULL,
	"rouvert_par_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "affectations_resultat" ADD CONSTRAINT "affectations_resultat_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fractions_impot" ADD CONSTRAINT "fractions_impot_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fractions_impot" ADD CONSTRAINT "fractions_impot_impot_id_impots_benefices_id_fk" FOREIGN KEY ("impot_id") REFERENCES "public"."impots_benefices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fractions_impot" ADD CONSTRAINT "fractions_impot_compte_tresorerie_id_comptes_tresorerie_id_fk" FOREIGN KEY ("compte_tresorerie_id") REFERENCES "public"."comptes_tresorerie"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impots_benefices" ADD CONSTRAINT "impots_benefices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametres_fiscaux" ADD CONSTRAINT "parametres_fiscaux_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reouvertures_exercice" ADD CONSTRAINT "reouvertures_exercice_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fractions_impot_echeance" ON "fractions_impot" USING btree ("organization_id","echeance");--> statement-breakpoint
CREATE INDEX "reouvertures_exercice_idx" ON "reouvertures_exercice" USING btree ("organization_id","exercice");--> statement-breakpoint
ALTER TABLE "parametres_fiscaux" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "impots_benefices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fractions_impot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "affectations_resultat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reouvertures_exercice" ENABLE ROW LEVEL SECURITY;
