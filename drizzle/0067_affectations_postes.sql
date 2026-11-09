CREATE TABLE "affectations_postes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"poste_id" uuid NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "affectations_postes_unique" UNIQUE("employee_id","poste_id")
);
--> statement-breakpoint
ALTER TABLE "affectations_postes" ADD CONSTRAINT "affectations_postes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations_postes" ADD CONSTRAINT "affectations_postes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations_postes" ADD CONSTRAINT "affectations_postes_poste_id_postes_id_fk" FOREIGN KEY ("poste_id") REFERENCES "public"."postes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affectations_postes_un_principal" ON "affectations_postes" USING btree ("employee_id") WHERE "affectations_postes"."principal" AND "affectations_postes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "affectations_postes_org_poste_idx" ON "affectations_postes" USING btree ("organization_id","poste_id");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "affectations_postes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Un poste porté par une fiche mais absent du référentiel y entre, comme en 0064.
INSERT INTO "postes" ("organization_id", "libelle", "ordre")
SELECT e.organization_id, min(btrim(regexp_replace(e.poste, '\s+', ' ', 'g'))), 100
FROM "employees" e
WHERE e.deleted_at IS NULL
	AND btrim(e.poste) <> ''
	AND NOT EXISTS (
		SELECT 1 FROM "postes" p
		WHERE p.organization_id = e.organization_id
			AND lower(p.libelle) = lower(btrim(regexp_replace(e.poste, '\s+', ' ', 'g')))
	)
GROUP BY e.organization_id, lower(btrim(regexp_replace(e.poste, '\s+', ' ', 'g')))
ON CONFLICT ("organization_id", "libelle") DO NOTHING;
--> statement-breakpoint
-- Le poste actuel de chaque salarié devient son poste principal. Un seul
-- par salarié, même si deux postes ne diffèrent que par la casse.
INSERT INTO "affectations_postes" ("organization_id", "employee_id", "poste_id", "principal")
SELECT DISTINCT ON (e.id) e.organization_id, e.id, p.id, true
FROM "employees" e
JOIN "postes" p
	ON p.organization_id = e.organization_id
	AND lower(p.libelle) = lower(btrim(regexp_replace(e.poste, '\s+', ' ', 'g')))
WHERE e.deleted_at IS NULL
ORDER BY e.id, p.ordre, p.libelle
ON CONFLICT ("employee_id", "poste_id") DO NOTHING;
