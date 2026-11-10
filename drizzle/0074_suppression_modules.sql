-- Suppression définitive des modules retirés de la plateforme (décision de
-- la direction, FEUILLE-DE-ROUTE.md) : Commerce, Restaurant, Maquis, Hôtel,
-- Réservations, Billetterie, Point de vente mobile money et Caisse. Stock,
-- catalogue et tables de ventes restent : Achats et Devis/factures en ont
-- besoin.
--
-- Garde-fou : un groupe de tables n'est supprimé que s'il est ENTIÈREMENT
-- vide. S'il contient la moindre ligne, il est gardé tel quel et signalé dans
-- le journal du serveur (NOTICE) : aucune donnée ne peut se perdre ici.
CREATE OR REPLACE FUNCTION pg_temp.supprimer_si_vide(groupe text, tables text[], types text[]) RETURNS void AS $$
DECLARE
	t text;
	lignes bigint;
BEGIN
	FOREACH t IN ARRAY tables LOOP
		IF to_regclass('public.' || t) IS NOT NULL THEN
			EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM public.%I LIMIT 1) x', t) INTO lignes;
			IF lignes > 0 THEN
				RAISE NOTICE 'Module « % » : la table % contient des données, le groupe est gardé.', groupe, t;
				RETURN;
			END IF;
		END IF;
	END LOOP;
	FOREACH t IN ARRAY tables LOOP
		EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
	END LOOP;
	FOREACH t IN ARRAY types LOOP
		EXECUTE format('DROP TYPE IF EXISTS public.%I', t);
	END LOOP;
	RAISE NOTICE 'Module « % » : tables vides supprimées.', groupe;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
SELECT pg_temp.supprimer_si_vide('Restaurant et maquis',
	ARRAY['lignes_commande_salle', 'commandes_salle', 'tables_salle'],
	ARRAY['espace_restauration', 'etat_preparation', 'poste_production', 'statut_commande_salle']);
--> statement-breakpoint
-- L'hôtel repose sur les réservations (un séjour est un contrat de location) :
-- les deux se suppriment ensemble, ou pas du tout.
SELECT pg_temp.supprimer_si_vide('Hôtel et réservations',
	ARRAY['voyageurs_sejour', 'prestations_sejour', 'acomptes_sejour', 'sejours_hotel', 'chambres_hotel',
	      'passages_abonnement', 'abonnements', 'contrats_location', 'ressources'],
	ARRAY['menage_chambre', 'nature_prestation_sejour', 'etat_restitution', 'moyen_location', 'statut_contrat', 'statut_ressource', 'type_ressource']);
--> statement-breakpoint
SELECT pg_temp.supprimer_si_vide('Billetterie',
	ARRAY['billets', 'departs', 'lignes_transport'],
	ARRAY['canal_billet', 'moyen_billet', 'statut_billet', 'statut_depart']);
--> statement-breakpoint
SELECT pg_temp.supprimer_si_vide('Point de vente mobile money',
	ARRAY['operations_guichet', 'floats_session', 'sessions_guichet'],
	ARRAY['reseau_monnaie', 'statut_session_guichet', 'type_operation_guichet']);
--> statement-breakpoint
-- Un rôle préréglé de ces métiers encore attribué devient un rôle de
-- l'entreprise (is_system = false), avec les droits qui lui restent : la
-- personne qui le porte garde ses tâches, son planning, sa messagerie.
UPDATE "roles" r SET "is_system" = false, "updated_at" = now()
WHERE r.is_system
	AND r.key IN ('caissier', 'serveur', 'cuisinier', 'receptionniste', 'agent_menage')
	AND EXISTS (SELECT 1 FROM "memberships" m WHERE m.role_id = r.id);
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, d.cle
FROM "roles" r
JOIN (VALUES
	('caissier', 'stock.article.consulter'), ('caissier', 'tiers.fiche.consulter'), ('caissier', 'tresorerie.bon.demander'),
	('serveur', 'stock.article.consulter'), ('serveur', 'tiers.fiche.consulter'),
	('cuisinier', 'stock.article.consulter'),
	('receptionniste', 'tiers.fiche.consulter'),
	('caissier', 'archives.consulter'), ('caissier', 'archives.deposer'),
	('serveur', 'archives.consulter'), ('serveur', 'archives.deposer'),
	('cuisinier', 'archives.consulter'), ('cuisinier', 'archives.deposer'),
	('receptionniste', 'archives.consulter'), ('receptionniste', 'archives.deposer'),
	('caissier', 'taches.consulter'), ('caissier', 'taches.executer'), ('caissier', 'conges.demander'),
	('serveur', 'taches.consulter'), ('serveur', 'taches.executer'), ('serveur', 'conges.demander'),
	('cuisinier', 'taches.consulter'), ('cuisinier', 'taches.executer'), ('cuisinier', 'conges.demander'),
	('receptionniste', 'taches.consulter'), ('receptionniste', 'taches.executer'), ('receptionniste', 'conges.demander'),
	('agent_menage', 'taches.consulter'), ('agent_menage', 'taches.executer'), ('agent_menage', 'conges.demander'),
	('caissier', 'planning.utiliser'), ('serveur', 'planning.utiliser'), ('cuisinier', 'planning.utiliser'),
	('receptionniste', 'planning.utiliser'), ('agent_menage', 'planning.utiliser'),
	('caissier', 'messagerie.utiliser'), ('serveur', 'messagerie.utiliser'), ('cuisinier', 'messagerie.utiliser'),
	('receptionniste', 'messagerie.utiliser'), ('agent_menage', 'messagerie.utiliser'),
	('caissier', 'meeting.participer'), ('serveur', 'meeting.participer'), ('cuisinier', 'meeting.participer'),
	('receptionniste', 'meeting.participer'), ('agent_menage', 'meeting.participer')
) AS d(role, cle) ON d.role = r.key
WHERE NOT r.is_system
	AND r.key IN ('caissier', 'serveur', 'cuisinier', 'receptionniste', 'agent_menage')
	AND EXISTS (SELECT 1 FROM "permissions" p WHERE p.key = d.cle)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Ceux que personne ne porte quittent la liste des rôles.
DELETE FROM "roles" r
WHERE r.key IN ('caissier', 'serveur', 'cuisinier', 'receptionniste', 'agent_menage')
	AND NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m.role_id = r.id);
--> statement-breakpoint
-- Les droits de ces modules quittent le catalogue ; leurs accords partent avec
-- eux (role_permissions, cascade).
DELETE FROM "permissions"
WHERE "module_key" IN ('pos', 'boutique', 'restaurant', 'maquis', 'hotellerie', 'reservation', 'billetterie', 'valeur_electronique', 'kiosque', 'fitness', 'location', 'transport');
--> statement-breakpoint
DELETE FROM "organization_modules"
WHERE "module_key" IN ('pos', 'boutique', 'restaurant', 'maquis', 'hotellerie', 'reservation', 'billetterie', 'valeur_electronique', 'kiosque', 'fitness', 'location', 'transport');
--> statement-breakpoint
DELETE FROM "acces_modules"
WHERE "module_key" IN ('pos', 'boutique', 'restaurant', 'maquis', 'hotellerie', 'reservation', 'billetterie', 'valeur_electronique', 'kiosque', 'fitness', 'location', 'transport');
--> statement-breakpoint
DELETE FROM "acces_modules_roles"
WHERE "module_key" IN ('pos', 'boutique', 'restaurant', 'maquis', 'hotellerie', 'reservation', 'billetterie', 'valeur_electronique', 'kiosque', 'fitness', 'location', 'transport');
