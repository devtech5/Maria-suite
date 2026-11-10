CREATE TABLE "guide_lectures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chapitre" text NOT NULL,
	"lu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "guide_lectures_unique" UNIQUE("organization_id","user_id","chapitre")
);
--> statement-breakpoint
CREATE TABLE "guide_quiz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"bonnes" integer NOT NULL,
	"total" integer NOT NULL,
	"reussi" boolean NOT NULL,
	"reponses" jsonb NOT NULL,
	"passe_le" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guide_lectures" ADD CONSTRAINT "guide_lectures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_lectures" ADD CONSTRAINT "guide_lectures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_quiz" ADD CONSTRAINT "guide_quiz_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_quiz" ADD CONSTRAINT "guide_quiz_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guide_lectures_user_idx" ON "guide_lectures" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "guide_quiz_user_idx" ON "guide_quiz" USING btree ("organization_id","user_id","passe_le");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "guide_lectures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guide_quiz" ENABLE ROW LEVEL SECURITY;
