CREATE TABLE "reponses_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"valeur" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reponses_messages_unique" UNIQUE("message_id","user_id","valeur")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "genre" text DEFAULT 'texte' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "donnees" jsonb;--> statement-breakpoint
ALTER TABLE "reponses_messages" ADD CONSTRAINT "reponses_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reponses_messages" ADD CONSTRAINT "reponses_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reponses_messages" ADD CONSTRAINT "reponses_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reponses_messages_message_idx" ON "reponses_messages" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_genre" CHECK ("messages"."genre" in ('texte', 'sondage', 'evenement', 'contact'));
--> statement-breakpoint
ALTER TABLE "reponses_messages" ENABLE ROW LEVEL SECURITY;
