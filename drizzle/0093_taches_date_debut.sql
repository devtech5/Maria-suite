-- Tâches : jour de début prévu, facultatif, pour les vues Gantt et Échéancier.
-- Jamais après l'échéance quand les deux sont posés.
ALTER TABLE "taches" ADD COLUMN "date_debut" date;--> statement-breakpoint
ALTER TABLE "taches" ADD CONSTRAINT "taches_debut_avant_echeance" CHECK ("taches"."date_debut" IS NULL OR "taches"."echeance" IS NULL OR "taches"."date_debut" <= "taches"."echeance");