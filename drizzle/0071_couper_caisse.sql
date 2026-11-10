-- Caisse (Ventes & Encaissement) coupée pour MARIA GROUP SARL, qui ne vend
-- aucun produit au comptoir. Comme les migrations 0049 et 0051, couper
-- n'efface rien : postes de caisse, tickets et sessions restent en base, et
-- le propriétaire rallume le module depuis « Utilisateurs › Modules ». Même
-- liste à l'installation (MODULES_COUPES_A_LA_NAISSANCE, src/db/installation.ts).
INSERT INTO "organization_modules" ("organization_id", "module_key", "enabled")
SELECT o."id", 'pos', false
FROM "organizations" o
ON CONFLICT ("organization_id", "module_key") DO UPDATE SET "enabled" = false, "updated_at" = now();
--> statement-breakpoint
-- Les rôles préréglés des métiers coupés — caissier, serveur, cuisinier,
-- réceptionniste, agent de ménage, magasinier — quittent la liste des rôles
-- quand personne ne les porte. Un rôle encore attribué reste : le retirer
-- fermerait la porte à la personne qui le porte. Ses accords et ses accès
-- par module partent avec lui (cascade).
DELETE FROM "roles" r
WHERE r.is_system
	AND r.key IN ('caissier', 'serveur', 'cuisinier', 'receptionniste', 'agent_menage', 'magasinier')
	AND NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m.role_id = r.id);
