CREATE TABLE "postes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "postes_libelle_unique" UNIQUE("organization_id","libelle")
);
--> statement-breakpoint
ALTER TABLE "postes" ADD CONSTRAINT "postes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "postes_org_idx" ON "postes" USING btree ("organization_id","ordre");--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "postes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Les postes de MARIA GROUP SARL, dans l'ordre de la direction
-- (POSTES_DE_DEPART, src/modules/personnes/postes.ts).
INSERT INTO "postes" ("organization_id", "libelle", "ordre")
SELECT o.id, p.libelle, p.ordre
FROM "organizations" o
CROSS JOIN (VALUES
	('Assistant(e)', 1),
	('Comptable', 2),
	('Chef de projet', 3),
	('Commercial(e)', 4),
	('Architecte', 5),
	('Technicien BTP', 6),
	('Réceptionniste', 7),
	('Informaticien', 8),
	('Homme de main / Protocole', 9),
	('PDG', 10),
	('Ménagère', 11),
	('Gardien', 12)
) AS p(libelle, ordre)
ON CONFLICT ("organization_id", "libelle") DO NOTHING;
--> statement-breakpoint
-- Les postes déjà saisis à la main sur les fiches entrent aussi au
-- référentiel, à la suite : une fiche ne doit pas porter un poste introuvable
-- dans la liste. Casse et espaces ignorés pour ne pas doubler « comptable ».
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
