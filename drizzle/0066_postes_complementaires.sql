-- Postes complémentaires demandés par la direction, à la suite des douze
-- premiers (POSTES_DE_DEPART, src/modules/personnes/postes.ts). Un poste déjà
-- présent sous une autre casse n'est pas doublé.
INSERT INTO "postes" ("organization_id", "libelle", "ordre")
SELECT o.id, p.libelle, p.ordre
FROM "organizations" o
CROSS JOIN (VALUES
	('Agent d''entretien', 13),
	('Assistant(e) de direction', 14),
	('Caissier(ère)', 15),
	('Chauffeur-livreur', 16),
	('Délégué(e) médical(e)', 17),
	('Directeur(trice) général(e)', 18),
	('Gérant(e)', 19),
	('Magasinier(ère)', 20),
	('Responsable administratif et financier', 21),
	('Responsable commercial(e)', 22),
	('Responsable des achats', 23),
	('Secrétaire', 24),
	('Technicien(ne) biomédical(e)', 25)
) AS p(libelle, ordre)
WHERE NOT EXISTS (
	SELECT 1 FROM "postes" x
	WHERE x.organization_id = o.id AND lower(x.libelle) = lower(p.libelle)
)
ON CONFLICT ("organization_id", "libelle") DO NOTHING;
