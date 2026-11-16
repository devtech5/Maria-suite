CREATE TABLE "calculs_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cle" text NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "calculs_articles_cle" UNIQUE("organization_id","cle"),
	CONSTRAINT "calculs_articles_cle_forme" CHECK ("calculs_articles"."cle" ~ '^[a-z0-9_]{2,40}$')
);
--> statement-breakpoint
CREATE TABLE "notes_calcul" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"projet_id" uuid NOT NULL,
	"type" text NOT NULL,
	"libelle" text NOT NULL,
	"saisie" jsonb NOT NULL,
	"resultat" jsonb NOT NULL,
	"materiaux" jsonb NOT NULL,
	"reglages" jsonb NOT NULL,
	"reglages_verifies" boolean NOT NULL,
	"cree_par_user_id" uuid NOT NULL,
	"annulee_le" timestamp with time zone,
	"motif_annulation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "notes_calcul_numero" UNIQUE("organization_id","numero"),
	CONSTRAINT "notes_calcul_type" CHECK ("notes_calcul"."type" IN ('beton', 'maconnerie', 'carrelage', 'pente', 'escalier', 'equerre')),
	CONSTRAINT "notes_calcul_libelle" CHECK (length("notes_calcul"."libelle") BETWEEN 2 AND 200),
	CONSTRAINT "notes_calcul_annulation" CHECK (("notes_calcul"."annulee_le" IS NULL) = ("notes_calcul"."motif_annulation" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notes_calcul_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"nature" text NOT NULL,
	"piece_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"cree_par_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "notes_calcul_suites_nature" CHECK ("notes_calcul_suites"."nature" IN ('devis', 'commande'))
);
--> statement-breakpoint
ALTER TABLE "calculs_articles" ADD CONSTRAINT "calculs_articles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculs_articles" ADD CONSTRAINT "calculs_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_calcul" ADD CONSTRAINT "notes_calcul_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_calcul" ADD CONSTRAINT "notes_calcul_projet_id_projets_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_calcul_suites" ADD CONSTRAINT "notes_calcul_suites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_calcul_suites" ADD CONSTRAINT "notes_calcul_suites_note_id_notes_calcul_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes_calcul"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_calcul_projet_idx" ON "notes_calcul" USING btree ("organization_id","projet_id");--> statement-breakpoint
CREATE INDEX "notes_calcul_suites_note_idx" ON "notes_calcul_suites" USING btree ("organization_id","note_id");--> statement-breakpoint
ALTER TABLE "notes_calcul" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notes_calcul_suites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "calculs_articles" ENABLE ROW LEVEL SECURITY;
