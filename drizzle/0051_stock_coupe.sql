-- Catalogue & Stock coupé pour MARIA GROUP SARL, comme les modules de la
-- migration 0049. Couper n'efface rien : articles, dépôts et mouvements
-- restent en base, et le propriétaire rallume le module depuis
-- « Utilisateurs › Modules ». Même liste à l'installation
-- (MODULES_COUPES_A_LA_NAISSANCE, src/db/installation.ts).
INSERT INTO "organization_modules" ("organization_id", "module_key", "enabled")
SELECT o."id", 'stock', false
FROM "organizations" o
ON CONFLICT ("organization_id", "module_key") DO UPDATE SET "enabled" = false, "updated_at" = now();
