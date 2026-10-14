CREATE TYPE "public"."statut_reunion" AS ENUM('planifiee', 'en_cours', 'terminee', 'annulee');--> statement-breakpoint
CREATE TABLE "reunion_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reunion_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invite_par_user_id" uuid NOT NULL,
	"rejoint_le" timestamp with time zone,
	"vu_le" timestamp with time zone,
	"secondes_presence" integer DEFAULT 0 NOT NULL,
	"micro" boolean DEFAULT false NOT NULL,
	"camera" boolean DEFAULT false NOT NULL,
	"ecran" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reunion_participants_unique" UNIQUE("reunion_id","user_id"),
	CONSTRAINT "reunion_participants_presence" CHECK ("reunion_participants"."secondes_presence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reunions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"titre" text NOT NULL,
	"ordre_du_jour" text,
	"debut_prevu" timestamp with time zone NOT NULL,
	"duree_minutes" integer DEFAULT 60 NOT NULL,
	"statut" "statut_reunion" DEFAULT 'planifiee' NOT NULL,
	"organisateur_user_id" uuid NOT NULL,
	"ouverte_le" timestamp with time zone,
	"terminee_le" timestamp with time zone,
	"terminee_par_user_id" uuid,
	"compte_rendu" text,
	"annulee_le" timestamp with time zone,
	"motif_annulation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reunions_numero_unique" UNIQUE("organization_id","numero"),
	CONSTRAINT "reunions_duree" CHECK ("reunions"."duree_minutes" BETWEEN 5 AND 480),
	CONSTRAINT "reunions_ouverte_datee" CHECK ("reunions"."statut" NOT IN ('en_cours', 'terminee') OR "reunions"."ouverte_le" IS NOT NULL),
	CONSTRAINT "reunions_terminee_datee" CHECK ("reunions"."statut" <> 'terminee' OR "reunions"."terminee_le" IS NOT NULL),
	CONSTRAINT "reunions_annulation_motivee" CHECK ("reunions"."statut" <> 'annulee' OR "reunions"."motif_annulation" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "reunion_participants" ADD CONSTRAINT "reunion_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion_participants" ADD CONSTRAINT "reunion_participants_reunion_id_reunions_id_fk" FOREIGN KEY ("reunion_id") REFERENCES "public"."reunions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunions" ADD CONSTRAINT "reunions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reunion_participants_user_idx" ON "reunion_participants" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "reunions_org_debut_idx" ON "reunions" USING btree ("organization_id","debut_prevu");--> statement-breakpoint
CREATE INDEX "reunions_organisateur_idx" ON "reunions" USING btree ("organization_id","organisateur_user_id");--> statement-breakpoint
ALTER TABLE "reunions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reunion_participants" ENABLE ROW LEVEL SECURITY;