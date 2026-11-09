ALTER TABLE "employees" ADD COLUMN "civilite" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "paiement_salaire" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "coordonnees_paiement" text;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_civilite" CHECK ("employees"."civilite" IS NULL OR "employees"."civilite" IN ('M', 'Mme', 'Mlle'));--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_paiement_salaire" CHECK ("employees"."paiement_salaire" IS NULL OR "employees"."paiement_salaire" IN ('virement', 'mobile_money', 'especes', 'cheque'));