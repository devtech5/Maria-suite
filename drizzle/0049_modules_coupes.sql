-- Modules coupés pour MARIA GROUP SARL : commerce de détail, restaurant,
-- maquis, hôtel et résidences, réservation de ressource, enquêtes,
-- billetterie et point de vente (valeur électronique).
--
-- Couper n'efface rien : les données restent en base, et le propriétaire
-- rallume un module depuis « Utilisateurs › Modules ». La même liste est
-- posée à l'installation (MODULES_COUPES_A_LA_NAISSANCE, src/db/installation.ts)
-- pour une base neuve, où cette migration ne trouve encore aucune entreprise.
INSERT INTO "organization_modules" ("organization_id", "module_key", "enabled")
SELECT o."id", m."cle", false
FROM "organizations" o
CROSS JOIN (VALUES
	('boutique'),
	('restaurant'),
	('maquis'),
	('hotellerie'),
	('reservation'),
	('enquetes'),
	('billetterie'),
	('valeur_electronique')
) AS m("cle")
ON CONFLICT ("organization_id", "module_key") DO UPDATE SET "enabled" = false, "updated_at" = now();
