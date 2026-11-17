CREATE TABLE "notes_annexes_redigees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exercice" text NOT NULL,
	"numero" text NOT NULL,
	"texte" text DEFAULT '' NOT NULL,
	"neant" boolean DEFAULT false NOT NULL,
	"redige_par_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "notes_annexes_redigees_unique" UNIQUE("organization_id","exercice","numero"),
	CONSTRAINT "notes_annexes_redigees_exercice" CHECK ("notes_annexes_redigees"."exercice" ~ '^[0-9]{4}$'),
	CONSTRAINT "notes_annexes_redigees_texte" CHECK (length("notes_annexes_redigees"."texte") <= 20000 AND (NOT "notes_annexes_redigees"."neant" OR "notes_annexes_redigees"."texte" = ''))
);
--> statement-breakpoint
ALTER TABLE "notes_annexes_redigees" ADD CONSTRAINT "notes_annexes_redigees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_annexes_redigees" ENABLE ROW LEVEL SECURITY;
