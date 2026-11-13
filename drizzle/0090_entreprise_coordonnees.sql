-- Coordonnées de MARIA GROUP SARL, reprises du papier à en-tête et du pied de
-- page de la fiche de poste MG-SI-01 : adresse des bureaux, téléphones, e-mail,
-- RCCM, capital, siège social. Le NCC (« CC [N°] » sur le papier) n'est pas
-- renseigné : à saisir dans « Entreprise » quand il sera connu.
UPDATE "organizations"
SET "address" = 'Cocody Angré 7e tranche, cour des comptes',
    "phone" = '+225 27 22 63 98 / 07 04 61 74 74',
    "email" = 'hello@maria-groupe.com',
    "site_web" = 'www.maria-groupe.com',
    "rccm" = 'N° CI-TDI-01-2026-B12-00406',
    "capital_social" = 10000000,
    "pied_de_page" = E'Siège social : Yamoussoukro, quartier Kami CAFOP\nBureaux : Cocody Angré 7e tranche, cour des comptes',
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "slug" = 'maria-group';
