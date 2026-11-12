-- Le pied de page s'imprime sous le filet doré : les bureaux et les contacts
-- viennent désormais des champs de l'entreprise (adresse, téléphone, e-mail,
-- site). La mention libre ne garde que le siège social. Seule la valeur posée
-- par la migration 0090 est remplacée : un pied saisi à la main reste intact.
UPDATE "organizations"
SET "pied_de_page" = 'Siège social : Yamoussoukro, quartier Kami CAFOP',
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "slug" = 'maria-group'
  AND "pied_de_page" = E'Siège social : Yamoussoukro, quartier Kami CAFOP\nBureaux : Cocody Angré 7e tranche, cour des comptes';
