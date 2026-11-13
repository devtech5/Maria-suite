-- Police et taille du texte d'un courrier : six polices proposées (Montserrat de
-- la charte par défaut), taille du corps en centièmes de point (865 = 8,65 pt).
-- Les courriers existants gardent leur rendu : Montserrat, 8,65 pt.
ALTER TABLE "courriers" ADD COLUMN "police" text DEFAULT 'montserrat' NOT NULL;--> statement-breakpoint
ALTER TABLE "courriers" ADD COLUMN "taille_police" integer DEFAULT 865 NOT NULL;--> statement-breakpoint
ALTER TABLE "courriers" ADD CONSTRAINT "courriers_police" CHECK ("courriers"."police" IN ('montserrat', 'arial', 'calibri', 'times', 'georgia', 'garamond'));--> statement-breakpoint
ALTER TABLE "courriers" ADD CONSTRAINT "courriers_taille_police" CHECK ("courriers"."taille_police" BETWEEN 700 AND 1400);