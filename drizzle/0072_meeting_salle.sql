CREATE TABLE "reunion_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reunion_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"corps" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reunion_messages_corps" CHECK (char_length("reunion_messages"."corps") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "reunion_participants" ADD COLUMN "main_levee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reunion_participants" ADD COLUMN "reaction" text;--> statement-breakpoint
ALTER TABLE "reunion_participants" ADD COLUMN "reaction_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reunions" ADD COLUMN "lien_actif" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reunion_messages" ADD CONSTRAINT "reunion_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion_messages" ADD CONSTRAINT "reunion_messages_reunion_id_reunions_id_fk" FOREIGN KEY ("reunion_id") REFERENCES "public"."reunions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reunion_messages_reunion_idx" ON "reunion_messages" USING btree ("reunion_id","created_at");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "reunion_messages" ENABLE ROW LEVEL SECURITY;
