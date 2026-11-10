CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"libelle" text NOT NULL,
	"pole" text DEFAULT 'support' NOT NULL,
	"mission" text,
	"ordre" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "services_libelle_unique" UNIQUE("organization_id","libelle"),
	CONSTRAINT "services_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "services_pole_check" CHECK ("services"."pole" in ('direction', 'support', 'metiers'))
);
--> statement-breakpoint
ALTER TABLE "postes" ADD COLUMN "service_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "services_org_idx" ON "services" USING btree ("organization_id","ordre");--> statement-breakpoint
ALTER TABLE "postes" ADD CONSTRAINT "postes_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Défense en profondeur, comme toutes les tables : aucune policy, le rôle propriétaire la contourne.
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Les services d'une société à plusieurs activités : direction générale,
-- fonctions support, puis un service par métier — communication, BTP,
-- immobilier, mines, conception de projets et financement
-- (SERVICES_DE_DEPART, src/modules/personnes/services.ts).
INSERT INTO "services" ("organization_id", "code", "libelle", "pole", "mission", "ordre")
SELECT o.id, s.code, s.libelle, s.pole, s.mission, s.ordre
FROM "organizations" o
CROSS JOIN (VALUES
	('DG', 'Direction générale', 'direction', 'Stratégie du groupe, arbitrage entre les activités, représentation de la société.', 1),
	('DAF', 'Administration et finances', 'support', 'Comptabilité SYSCOHADA, trésorerie, fiscalité DGI, contrôle de gestion et caisse.', 2),
	('RH', 'Ressources humaines', 'support', 'Recrutement, contrats, paie, CNPS, formation, discipline et règlement intérieur.', 3),
	('JUR', 'Juridique et conformité', 'support', 'Contrats, contentieux, droit foncier et minier, conformité réglementaire.', 4),
	('SAP', 'Secrétariat, accueil et protocole', 'support', 'Accueil des visiteurs, standard, courrier entrant et sortant, protocole.', 5),
	('MGL', 'Moyens généraux et logistique', 'support', 'Véhicules et chauffeurs, magasin, fournitures, entretien des locaux, gardiennage.', 6),
	('ACH', 'Achats et approvisionnements', 'support', 'Consultation des fournisseurs, commandes, réceptions, approvisionnement des chantiers.', 7),
	('DSI', 'Informatique', 'support', 'Parc informatique, réseau, logiciels, messagerie et sécurité des données.', 8),
	('QHSE', 'Qualité, hygiène, sécurité et environnement', 'support', 'Sécurité des chantiers et des sites miniers, études d''impact, démarche qualité.', 9),
	('COM', 'Commercial et développement', 'support', 'Prospection, relation client, offres commerciales, suivi des ventes et de l''après-vente.', 10),
	('CEV', 'Communication et événementiel', 'metiers', 'Stratégie de communication, création graphique, digital, audiovisuel, relations presse, événements.', 11),
	('BET', 'Bureau d''études et architecture', 'metiers', 'Conception des ouvrages : plans, études techniques, métrés, devis estimatifs, permis de construire.', 12),
	('TRV', 'Travaux et chantiers', 'metiers', 'Exécution des chantiers BTP : conduite des travaux, équipes, intervenants, matériaux et engins.', 13),
	('CTL', 'Suivi et contrôle des travaux', 'metiers', 'Contrôle des ouvrages, attachements, réceptions provisoire et définitive, missions de contrôle pour des maîtres d''ouvrage.', 14),
	('IMM', 'Immobilier et foncier', 'metiers', 'Promotion, lotissements, gestion locative, vente de biens et procédures foncières.', 15),
	('MIN', 'Mines et géologie', 'metiers', 'Permis, prospection, géologie, exploitation minière et suivi environnemental des sites.', 16),
	('IPF', 'Conception de projets et financement', 'metiers', 'Montage de projets, études de faisabilité, dossiers bailleurs et banques, levée de fonds, partenariats.', 17)
) AS s(code, libelle, pole, mission, ordre)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Les postes des services métiers et des fonctions support qui manquaient,
-- à la suite des vingt-cinq premiers. Un poste déjà présent sous une autre
-- casse n'est pas doublé.
INSERT INTO "postes" ("organization_id", "libelle", "ordre")
SELECT o.id, p.libelle, p.ordre
FROM "organizations" o
CROSS JOIN (VALUES
	('Responsable des ressources humaines', 26),
	('Chargé(e) des ressources humaines', 27),
	('Juriste', 28),
	('Responsable QHSE', 29),
	('Chargé(e) de communication', 30),
	('Graphiste', 31),
	('Community manager', 32),
	('Ingénieur(e) génie civil', 33),
	('Dessinateur(trice) projeteur(se)', 34),
	('Métreur(se)', 35),
	('Conducteur(trice) de travaux', 36),
	('Chef de chantier', 37),
	('Contrôleur(se) de travaux', 38),
	('Gestionnaire immobilier', 39),
	('Géomètre-topographe', 40),
	('Géologue', 41),
	('Ingénieur(e) des mines', 42),
	('Chargé(e) de recherche de financement', 43),
	('Analyste financier(ère)', 44)
) AS p(libelle, ordre)
WHERE NOT EXISTS (
	SELECT 1 FROM "postes" x
	WHERE x.organization_id = o.id AND lower(x.libelle) = lower(p.libelle)
)
ON CONFLICT ("organization_id", "libelle") DO NOTHING;
--> statement-breakpoint
-- Chaque poste de départ rejoint son service. Un poste déjà rangé n'est pas
-- déplacé ; un poste ajouté à la main reste à ranger.
UPDATE "postes" p
SET "service_id" = s.id, "updated_at" = now(), "version" = p.version + 1
FROM (VALUES
	('PDG', 'DG'),
	('Directeur(trice) général(e)', 'DG'),
	('Gérant(e)', 'DG'),
	('Assistant(e) de direction', 'DG'),
	('Responsable administratif et financier', 'DAF'),
	('Comptable', 'DAF'),
	('Caissier(ère)', 'DAF'),
	('Responsable des ressources humaines', 'RH'),
	('Chargé(e) des ressources humaines', 'RH'),
	('Juriste', 'JUR'),
	('Secrétaire', 'SAP'),
	('Réceptionniste', 'SAP'),
	('Assistant(e)', 'SAP'),
	('Homme de main / Protocole', 'SAP'),
	('Chauffeur-livreur', 'MGL'),
	('Magasinier(ère)', 'MGL'),
	('Agent d''entretien', 'MGL'),
	('Ménagère', 'MGL'),
	('Gardien', 'MGL'),
	('Responsable des achats', 'ACH'),
	('Informaticien', 'DSI'),
	('Responsable QHSE', 'QHSE'),
	('Responsable commercial(e)', 'COM'),
	('Commercial(e)', 'COM'),
	('Délégué(e) médical(e)', 'COM'),
	('Technicien(ne) biomédical(e)', 'COM'),
	('Chargé(e) de communication', 'CEV'),
	('Graphiste', 'CEV'),
	('Community manager', 'CEV'),
	('Architecte', 'BET'),
	('Ingénieur(e) génie civil', 'BET'),
	('Dessinateur(trice) projeteur(se)', 'BET'),
	('Métreur(se)', 'BET'),
	('Conducteur(trice) de travaux', 'TRV'),
	('Chef de chantier', 'TRV'),
	('Technicien BTP', 'TRV'),
	('Contrôleur(se) de travaux', 'CTL'),
	('Gestionnaire immobilier', 'IMM'),
	('Géomètre-topographe', 'IMM'),
	('Géologue', 'MIN'),
	('Ingénieur(e) des mines', 'MIN'),
	('Chef de projet', 'IPF'),
	('Chargé(e) de recherche de financement', 'IPF'),
	('Analyste financier(ère)', 'IPF')
) AS r(poste, code)
JOIN "services" s ON s.code = r.code
WHERE p.organization_id = s.organization_id
	AND p.service_id IS NULL
	AND lower(p.libelle) = lower(r.poste);
--> statement-breakpoint
-- Un salarié sans service prend celui de son poste principal. Un service
-- déjà saisi sur la fiche n'est pas touché.
UPDATE "employees" e
SET "service" = s.libelle, "updated_at" = now(), "version" = e.version + 1
FROM "postes" p
JOIN "services" s ON s.id = p.service_id
WHERE p.organization_id = e.organization_id
	AND lower(p.libelle) = lower(btrim(e.poste))
	AND (e.service IS NULL OR btrim(e.service) = '')
	AND e.deleted_at IS NULL;
