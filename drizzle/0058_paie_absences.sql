ALTER TABLE "bulletins_paie" ADD COLUMN "jours_mois" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD COLUMN "jours_hors_contrat" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD COLUMN "jours_sans_solde" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD COLUMN "jours_absence_saisis" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD COLUMN "retenue_absence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD COLUMN "conges_pris" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD COLUMN "solde_conges" integer;--> statement-breakpoint
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_absences" CHECK ("bulletins_paie"."jours_mois" >= 0 AND "bulletins_paie"."jours_hors_contrat" >= 0 AND "bulletins_paie"."jours_sans_solde" >= 0 AND "bulletins_paie"."jours_absence_saisis" >= 0 AND "bulletins_paie"."conges_pris" >= 0 AND "bulletins_paie"."retenue_absence" BETWEEN 0 AND "bulletins_paie"."salaire_base");