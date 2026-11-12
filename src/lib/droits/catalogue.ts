/**
 * Catalogue des droits, et rôles préréglés.
 *
 * Le catalogue est alimenté par le CODE, jamais par l'utilisateur : une
 * permission n'existe que si une action serveur ou un écran la vérifie. La
 * table `permissions` n'en est que le reflet en base, synchronisé par
 * `pnpm db:droits`, et sert de clé étrangère aux rôles qu'une entreprise crée
 * elle-même.
 *
 * D'où la règle de résolution, volontairement asymétrique :
 *
 *   · rôle préréglé (`proprietaire`, `gerant`, `caissier`…) → droits lus ICI.
 *     Aucune requête, et un déploiement qui ajoute une permission la donne
 *     immédiatement aux rôles concernés, sans migration de données.
 *   · rôle créé par l'entreprise → droits lus dans `role_permissions`.
 *
 * Ce fichier ne dépend de rien : ni base, ni React, ni `server-only`. C'est ce
 * qui permet de le tester sans base, et de le réutiliser plus tard côté client
 * hors connexion — la caisse doit savoir qui a le droit d'annuler un ticket
 * même quand le réseau est tombé.
 */

export interface DefinitionDroit {
  cle: string;
  /** Module du registre auquel le droit se rattache — l'assiette de facturation. */
  moduleKey: string;
  libelle: string;
  description?: string;
}

/**
 * `organisation` n'est pas un module du registre : c'est le transverse — les
 * membres, les paramètres, l'abonnement. Il ne se vend pas, il ne se coupe pas.
 */
const TRANSVERSE = "organisation";

/**
 * Supprimer n'est pas gérer : c'est effacer une fiche saisie par erreur et
 * jamais utilisée (suppression logique, tracée). Une fiche qui a servi se met
 * en off et garde son historique. Droit à part, que seuls le propriétaire et
 * le gérant tiennent d'office.
 */
const SUPPRESSION =
  "Effacer une fiche saisie par erreur et jamais utilisée. Une fiche qui a servi " +
  "ne se supprime pas : elle se met en off et garde son historique.";

export const DROITS = [
  // ---------------------------------------------------------------- tiers
  {
    cle: "tiers.fiche.consulter",
    moduleKey: "tiers",
    libelle: "Consulter les tiers",
    description: "Voir la liste des clients et des fournisseurs, et leurs encours.",
  },
  {
    cle: "tiers.fiche.gerer",
    moduleKey: "tiers",
    libelle: "Gérer les tiers",
    description: "Créer, modifier et archiver un client ou un fournisseur.",
  },
  {
    cle: "tiers.fiche.supprimer",
    moduleKey: "tiers",
    libelle: "Supprimer un tiers ou un commercial",
    description: SUPPRESSION,
  },

  // ---------------------------------------------------------------- stock
  {
    cle: "stock.article.consulter",
    moduleKey: "stock",
    libelle: "Consulter le catalogue et le stock",
  },
  {
    cle: "stock.article.gerer",
    moduleKey: "stock",
    libelle: "Gérer les articles",
    description: "Créer, modifier et archiver un article, fixer son prix.",
  },
  {
    cle: "stock.depot.gerer",
    moduleKey: "stock",
    libelle: "Gérer les dépôts",
    description: "Ouvrir et fermer un dépôt, un magasin, un véhicule de tournée.",
  },
  {
    cle: "stock.mouvement.saisir",
    moduleKey: "stock",
    libelle: "Saisir un mouvement de stock",
    description: "Entrée, sortie, transfert, correction d'inventaire.",
  },

  // --------------------------------------------------------- comptabilité
  {
    cle: "comptabilite.ecriture.consulter",
    moduleKey: "comptabilite",
    libelle: "Consulter la comptabilité",
  },
  {
    cle: "comptabilite.ecriture.enregistrer",
    moduleKey: "comptabilite",
    libelle: "Enregistrer une écriture",
    description: "Comptabiliser une pièce, saisir une écriture au journal.",
  },
  {
    cle: "comptabilite.fiscalite.declarer",
    moduleKey: "comptabilite",
    libelle: "Déclarer et payer la TVA",
    description:
      "Déposer la déclaration de TVA d'un mois terminé — elle passe la liquidation et " +
      "verrouille le mois — puis payer la TVA due depuis la trésorerie.",
  },
  {
    cle: "comptabilite.exercice.cloturer",
    moduleKey: "comptabilite",
    libelle: "Clôturer un exercice",
    description: "Déterminer le résultat de l'année et fermer l'exercice à toute nouvelle écriture. Irréversible.",
  },

  // ----------------------------------------------------------- personnes
  {
    cle: "personnes.consulter",
    moduleKey: "personnes",
    libelle: "Consulter le personnel",
    description: "Voir les salariés, les intervenants et ce qui leur est dû.",
  },
  {
    cle: "personnes.salarie.gerer",
    moduleKey: "personnes",
    libelle: "Gérer les salariés",
    description: "Embaucher, modifier un contrat, sortir des effectifs.",
  },
  {
    cle: "personnes.dossier.consulter",
    moduleKey: "personnes",
    libelle: "Consulter les dossiers du personnel",
    description:
      "Voir les pièces des salariés — identité, CMU, casier, RIB, CV — et en ouvrir " +
      "les fichiers. Données sensibles : chaque ouverture est tracée au journal.",
  },
  {
    cle: "personnes.dossier.gerer",
    moduleKey: "personnes",
    libelle: "Tenir les dossiers du personnel",
    description: "Compléter l'état civil, la photo et les pièces d'un salarié, en retirer une déposée par erreur.",
  },
  {
    cle: "personnes.intervenant.gerer",
    moduleKey: "personnes",
    libelle: "Gérer les intervenants",
    description: "Ouvrir la fiche d'un maçon, d'un extra, d'un chauffeur occasionnel.",
  },
  {
    cle: "personnes.fiche.supprimer",
    moduleKey: "personnes",
    libelle: "Supprimer un salarié ou un intervenant",
    description: SUPPRESSION,
  },
  {
    cle: "personnes.pointage.saisir",
    moduleKey: "personnes",
    libelle: "Pointer un intervenant",
    description:
      "Constater les journées, les tâches ou les unités d'œuvre réalisées. " +
      "Le geste du chef d'équipe, sur le chantier.",
  },
  {
    cle: "personnes.paiement.regler",
    moduleKey: "personnes",
    libelle: "Régler un intervenant",
    description:
      "Émettre un bon de paiement. Geste de décaissement : il sort de l'argent " +
      "de la caisse, il est séparé du pointage à dessein.",
  },

  {
    cle: "personnes.paie.preparer",
    moduleKey: "personnes",
    libelle: "Préparer la paie",
    description: "Calculer les bulletins du mois, saisir primes, indemnités et retenues.",
  },
  {
    cle: "personnes.paie.valider",
    moduleKey: "personnes",
    libelle: "Valider la paie et son barème",
    description:
      "Attester le barème CNPS et l'impôt sur salaire, puis valider la paie du mois : " +
      "les bulletins sont numérotés, figés et passés en comptabilité. Irréversible.",
  },
  {
    cle: "personnes.paie.payer",
    moduleKey: "personnes",
    libelle: "Payer les salaires et les déclarations",
    description: "Verser les salaires nets, les cotisations CNPS et l'impôt retenu depuis la trésorerie.",
  },

  // -------------------------------------------------------------- actifs
  {
    cle: "actifs.consulter",
    moduleKey: "actifs",
    libelle: "Consulter les actifs",
    description: "Voir le parc, son coût d'entretien et ses échéances.",
  },
  {
    cle: "actifs.fiche.gerer",
    moduleKey: "actifs",
    libelle: "Gérer les actifs",
    description:
      "Ouvrir une fiche, l'affecter à quelqu'un, changer son état de service.",
  },
  {
    cle: "actifs.fiche.supprimer",
    moduleKey: "actifs",
    libelle: "Supprimer un actif",
    description: SUPPRESSION,
  },
  {
    cle: "actifs.intervention.saisir",
    moduleKey: "actifs",
    libelle: "Saisir une intervention",
    description: "Entretien, réparation, contrôle, et le relevé de compteur qui va avec.",
  },
  {
    cle: "actifs.echeance.gerer",
    moduleKey: "actifs",
    libelle: "Gérer les échéances",
    description: "Assurance, visite technique, garantie, entretien périodique.",
  },

  // -------------------------------------------------------- communication
  {
    cle: "communication.consulter",
    moduleKey: "communication",
    libelle: "Consulter les envois",
    description: "Voir le journal des e-mails et WhatsApp partis vers les clients et le personnel, et leurs échecs.",
  },
  {
    cle: "communication.client.notifier",
    moduleKey: "communication",
    libelle: "Écrire aux clients",
    description: "Envoyer un devis ou une facture au client, relancer une facture échue, enregistrer une désinscription.",
  },
  {
    cle: "communication.campagne.gerer",
    moduleKey: "communication",
    libelle: "Envoyer des messages groupés",
    description: "Préparer et envoyer un message à tout le personnel ou à une liste de clients.",
  },

  // ------------------------------------------------------------ présences
  {
    cle: "presences.consulter",
    moduleKey: "presences",
    libelle: "Consulter les présences de l'équipe",
    description: "Voir qui est là, les retards, le registre du mois et les soldes de congés de tous.",
  },
  {
    cle: "presences.gerer",
    moduleKey: "presences",
    libelle: "Gérer les présences",
    description: "Pointer ou corriger la présence d'un salarié, régler les horaires et les jours fériés.",
  },
  {
    cle: "conges.demander",
    moduleKey: "presences",
    libelle: "Demander un congé",
    description: "Voir son pointage et son solde, demander un congé ou une absence pour soi.",
  },
  {
    cle: "conges.valider",
    moduleKey: "presences",
    libelle: "Accorder les congés",
    description: "Accorder ou refuser une demande, saisir un congé pour un salarié, ajuster un solde.",
  },

  // ------------------------------------------------------------- planning
  {
    cle: "planning.utiliser",
    moduleKey: "planning",
    libelle: "Tenir son planning",
    description: "Déclarer ses horaires habituels et son statut — occupé, en mission, en courses, sur le terrain — maintenant ou à l'avance.",
  },
  {
    cle: "planning.equipe.consulter",
    moduleKey: "planning",
    libelle: "Voir le planning de l'équipe",
    description: "Savoir qui est disponible maintenant, et le statut de chacun sur la semaine.",
  },
  {
    cle: "planning.gerer",
    moduleKey: "planning",
    libelle: "Gérer le planning de tous",
    description: "Poser, modifier ou supprimer le statut, les créneaux et les horaires de n'importe quel membre.",
  },

  // ----------------------------------------------------------- messagerie
  {
    cle: "messagerie.utiliser",
    moduleKey: "messagerie",
    libelle: "Utiliser la messagerie",
    description: "Écrire en privé aux autres utilisateurs et participer aux groupes dont on est membre.",
  },
  {
    cle: "messagerie.groupe.gerer",
    moduleKey: "messagerie",
    libelle: "Créer et animer les groupes",
    description: "Créer un groupe de discussion, y ajouter ou en retirer des membres.",
  },

  // --------------------------------------------------------- prestataires
  {
    cle: "prestataires.consulter",
    moduleKey: "prestataires",
    libelle: "Consulter les prestataires",
    description: "Voir l'annuaire des prestataires, leurs prestations et l'avis qu'on en a.",
  },
  {
    cle: "prestataires.gerer",
    moduleKey: "prestataires",
    libelle: "Gérer les prestataires",
    description: "Inscrire un prestataire, lui confier une prestation, en constater la réalisation, la noter.",
  },
  {
    cle: "prestataires.payer",
    moduleKey: "prestataires",
    libelle: "Payer les prestataires",
    description: "Régler une prestation réalisée depuis la trésorerie, retenue à la source comprise.",
  },

  // -------------------------------------------------------------- marchés
  {
    cle: "marches.consulter",
    moduleKey: "marches",
    libelle: "Consulter les marchés",
    description: "Voir les appels d'offres en cours, les consultations de fournisseurs et les conventions.",
  },
  {
    cle: "marches.soumission.gerer",
    moduleKey: "marches",
    libelle: "Répondre aux appels d'offres",
    description: "Ouvrir une soumission, tenir son dossier administratif, la déposer, en noter le résultat.",
  },
  {
    cle: "marches.consultation.gerer",
    moduleKey: "marches",
    libelle: "Consulter des fournisseurs",
    description: "Lancer une mise en concurrence, inviter des fournisseurs, saisir et comparer leurs offres, attribuer.",
  },
  {
    cle: "marches.convention.gerer",
    moduleKey: "marches",
    libelle: "Gérer les conventions",
    description: "Enregistrer une convention, ses avenants, sa résiliation, et le document signé.",
  },

  // ------------------------------------------------------------ boîte mail
  {
    cle: "boite_mail.utiliser",
    moduleKey: "boite_mail",
    libelle: "Utiliser sa boîte mail dans Maria Suite",
    description: "Connecter SA propre adresse e-mail et la consulter sans quitter Maria Suite. Personne d'autre n'y accède.",
  },

  // ----------------------------------------------------------- parc auto
  {
    cle: "parc_auto.consulter",
    moduleKey: "parc_auto",
    libelle: "Consulter le parc automobile",
    description: "Voir les véhicules, leur kilométrage, leur carburant et leurs échéances.",
  },
  {
    cle: "parc_auto.vehicule.gerer",
    moduleKey: "parc_auto",
    libelle: "Gérer les véhicules",
    description: "Ouvrir la fiche d'un véhicule, compléter sa carte grise, lui attribuer un conducteur.",
  },
  {
    cle: "parc_auto.carburant.saisir",
    moduleKey: "parc_auto",
    libelle: "Saisir les pleins de carburant",
    description: "Noter un plein : volume, montant, kilométrage. Le geste du conducteur ou du chef de parc.",
  },

  // --------------------------------------------------- parc informatique
  {
    cle: "parc_informatique.consulter",
    moduleKey: "parc_informatique",
    libelle: "Consulter le parc informatique",
    description: "Voir les équipements, leurs utilisateurs, leurs garanties et les licences.",
  },
  {
    cle: "parc_informatique.equipement.gerer",
    moduleKey: "parc_informatique",
    libelle: "Gérer les équipements informatiques",
    description: "Ouvrir la fiche d'un équipement, compléter sa fiche technique, l'attribuer à un utilisateur.",
  },
  {
    cle: "parc_informatique.licence.gerer",
    moduleKey: "parc_informatique",
    libelle: "Gérer les licences logicielles",
    description: "Enregistrer une licence, voir sa clé, l'installer sur un poste ou l'en retirer.",
  },

  // ---------------------------------------------------- moyens généraux
  {
    cle: "moyens_generaux.consulter",
    moduleKey: "moyens_generaux",
    libelle: "Consulter les moyens généraux",
    description: "Voir les fournitures de bureau, leur stock, et l'entretien des locaux.",
  },
  {
    cle: "moyens_generaux.gerer",
    moduleKey: "moyens_generaux",
    libelle: "Gérer les moyens généraux",
    description: "Ajouter une fourniture, enregistrer un achat ou une remise, ouvrir la fiche d'un local.",
  },

  // ---------------------------------------------------------- facturation
  {
    cle: "commercial.piece.consulter",
    moduleKey: "tiers",
    libelle: "Consulter les devis et factures",
    description: "Voir les pièces commerciales, leurs règlements et ce qui reste dû.",
  },
  {
    cle: "commercial.piece.gerer",
    moduleKey: "tiers",
    libelle: "Établir devis et factures",
    description:
      "Préparer un brouillon, l'émettre, convertir un devis. L'émission d'une " +
      "facture sort le stock et passe l'écriture.",
  },
  {
    cle: "commercial.piece.annuler",
    moduleKey: "tiers",
    libelle: "Annuler une facture",
    description: "Émettre l'avoir qui annule une facture. Défait une recette : à réserver.",
  },
  {
    cle: "commercial.reglement.encaisser",
    moduleKey: "tiers",
    libelle: "Encaisser un règlement client",
    description: "Enregistrer un paiement reçu sur une facture.",
  },
  {
    cle: "commercial.commission.gerer",
    moduleKey: "tiers",
    libelle: "Gérer les commerciaux et leurs commissions",
    description:
      "Créer les commerciaux, fixer leurs règles de commission (part fixe, taux, paliers), " +
      "suivre leurs réalisations et valider la commission du mois.",
  },
  {
    cle: "commercial.commission.payer",
    moduleKey: "tiers",
    libelle: "Payer les commissions",
    description: "Verser une commission validée depuis la trésorerie, ou l'ajouter au bulletin de paie d'un salarié.",
  },
  {
    cle: "commercial.prospection.planifier",
    moduleKey: "tiers",
    libelle: "Élaborer son plan de prospection",
    description:
      "Le commercial établit ses plans de prospection : zone, objectifs, prospects et leur type, " +
      "visites et appels planifiés, comptes rendus. Il ne voit que les siens.",
  },
  {
    cle: "commercial.prospection.superviser",
    moduleKey: "tiers",
    libelle: "Superviser la prospection",
    description: "Voir et suivre les plans de prospection de tous les commerciaux, en établir pour eux.",
  },

  // ------------------------------------------------------------- missions
  {
    cle: "missions.consulter",
    moduleKey: "missions",
    libelle: "Consulter les missions",
    description: "Voir les missions, leurs étapes et les preuves rapportées.",
  },
  {
    cle: "missions.mission.gerer",
    moduleKey: "missions",
    libelle: "Gérer les missions",
    description:
      "Ouvrir une mission, l'attribuer, la déclarer échouée ou l'annuler. " +
      "Séparé de la saisie terrain : celui qui planifie n'est pas celui qui rapporte.",
  },
  {
    cle: "missions.terrain.saisir",
    moduleKey: "missions",
    libelle: "Rapporter du terrain",
    description:
      "Valider une étape, joindre une photo, une position, une signature, une note, " +
      "répondre à un formulaire. Le geste du chef d'équipe ou du livreur.",
  },
  {
    cle: "missions.formulaire.gerer",
    moduleKey: "missions",
    libelle: "Composer les formulaires",
    description: "Créer un formulaire de collecte et choisir ses champs.",
  },

  // ----------------------------------------------------------- documents
  {
    cle: "documents.consulter",
    moduleKey: "documents",
    libelle: "Consulter les documents",
    description: "Voir la bibliothèque et ouvrir une pièce jointe.",
  },
  {
    cle: "documents.gerer",
    moduleKey: "documents",
    libelle: "Déposer et retirer un document",
    description:
      "Joindre une pièce à un client, un salarié, un actif. Retirer un document " +
      "efface son fichier pour de bon.",
  },
  {
    cle: "documents.signature.demander",
    moduleKey: "documents",
    libelle: "Demander une signature",
    description: "Ouvrir une demande et désigner ses signataires.",
  },
  {
    cle: "documents.signature.signer",
    moduleKey: "documents",
    libelle: "Signer",
    description:
      "Apposer sa signature sur une demande. Distinct du droit de la demander : " +
      "celui qui prépare le contrat n'est pas forcément celui qui l'engage.",
  },
  {
    cle: "documents.courrier.rediger",
    moduleKey: "documents",
    libelle: "Rédiger un courrier",
    description:
      "Rédiger, corriger et retirer un courrier officiel sur le papier à en-tête. " +
      "Le consulter et l'imprimer ne demande que l'accès aux documents.",
  },

  // ------------------------------------------------------------- archives
  {
    cle: "archives.consulter",
    moduleKey: "archives",
    libelle: "Consulter ses archives",
    description: "Voir son espace d'archivage et rouvrir ce qu'on y a déposé.",
  },
  {
    cle: "archives.deposer",
    moduleKey: "archives",
    libelle: "Archiver des données",
    description:
      "Déposer des fichiers dans son espace, et retirer une archive pendant le délai " +
      "de correction. Un retrait masque l'archive, il ne l'efface pas.",
  },
  {
    cle: "archives.dossier.gerer",
    moduleKey: "archives",
    libelle: "Gérer les dossiers d'archives",
    description:
      "Créer un dossier partagé, le renommer, décider quels membres le voient et " +
      "s'ils peuvent y déposer. Celui qui gère les dossiers les voit tous.",
  },
  {
    cle: "archives.superviser",
    moduleKey: "archives",
    libelle: "Superviser les archives",
    description:
      "Voir et ouvrir les archives de tous les membres, retirées comprises, vérifier " +
      "leur intégrité et lire le journal des accès. Propriétaire et gérant par défaut. " +
      "Chaque ouverture est tracée.",
  },

  // --------------------------------------------------------------- tâches
  {
    cle: "taches.consulter",
    moduleKey: "taches",
    libelle: "Consulter ses tâches",
    description: "Voir les tâches qu'on exécute et celles qu'on a confiées.",
  },
  {
    cle: "taches.executer",
    moduleKey: "taches",
    libelle: "Créer et exécuter ses tâches",
    description: "Se créer une tâche, la commencer, la terminer avec son compte rendu.",
  },
  {
    cle: "taches.attribuer",
    moduleKey: "taches",
    libelle: "Attribuer les tâches",
    description:
      "Confier une tâche à un autre membre, la réattribuer, voir toutes les tâches de " +
      "l'entreprise et agir sur chacune.",
  },

  // -------------------------------------------------------------- meeting
  {
    cle: "meeting.participer",
    moduleKey: "meeting",
    libelle: "Participer aux réunions",
    description: "Voir les réunions où l'on est invité, entrer dans la salle, parler, se montrer et partager son écran.",
  },
  {
    cle: "meeting.organiser",
    moduleKey: "meeting",
    libelle: "Organiser les réunions",
    description:
      "Programmer une réunion ou en ouvrir une sur-le-champ, inviter, la terminer pour tous, " +
      "l'annuler et rédiger son compte rendu — y compris celles d'un autre organisateur.",
  },

  // --------------------------------------------------- règlement intérieur
  {
    cle: "reglement.consulter",
    moduleKey: "reglement",
    libelle: "Lire le règlement intérieur",
    description:
      "Lire le règlement en vigueur et ses versions précédentes. Accordé à tous les " +
      "comptes, quel que soit le rôle : le règlement s'impose à chacun.",
  },
  {
    cle: "reglement.gerer",
    moduleKey: "reglement",
    libelle: "Publier le règlement intérieur",
    description:
      "Rédiger une nouvelle version, la publier avec sa date d'effet, voir qui l'a lue " +
      "et acceptée, relancer les retardataires.",
  },

  // --------------------------------------------------- guide d'utilisation
  {
    cle: "guide.consulter",
    moduleKey: "guide",
    libelle: "Lire le guide d'utilisation",
    description:
      "Lire le guide des modules qui vous sont ouverts, suivre son parcours et passer " +
      "le quiz. Accordé à tous les comptes, quel que soit le rôle.",
  },
  {
    cle: "guide.suivre",
    moduleKey: "guide",
    libelle: "Suivre la formation des nouveaux venus",
    description: "Voir où en est chacun dans le parcours du guide et ses résultats au quiz.",
  },

  // ------------------------------------------------------------- visiteurs
  {
    cle: "visiteurs.accueillir",
    moduleKey: "visiteurs",
    libelle: "Accueillir les visiteurs",
    description:
      "Enregistrer l'arrivée et la sortie des visiteurs, photographier leur pièce d'identité, " +
      "imprimer leur badge, dans les points d'accueil qu'on tient.",
  },
  {
    cle: "visiteurs.annoncer",
    moduleKey: "visiteurs",
    libelle: "Annoncer un visiteur",
    description: "Annoncer un rendez-vous à l'accueil et envoyer au visiteur son QR d'entrée par WhatsApp.",
  },
  {
    cle: "visiteurs.superviser",
    moduleKey: "visiteurs",
    libelle: "Superviser tous les accueils",
    description:
      "Voir le registre et les présents de tous les points d'accueil, créer les accueils " +
      "et désigner leurs agents.",
  },

  // ------------------------------------------------------ courrier et colis
  {
    cle: "courrier.consulter",
    moduleKey: "courrier",
    libelle: "Consulter le registre du courrier",
    description: "Voir tous les plis arrivés et partis, sauf l'objet et le scan des plis confidentiels qui ne vous sont pas imputés.",
  },
  {
    cle: "courrier.enregistrer",
    moduleKey: "courrier",
    libelle: "Enregistrer le courrier",
    description:
      "Enregistrer les plis arrivés et partis, joindre leur scan, imprimer l'étiquette, " +
      "noter l'expédition (transporteur, suivi) et la remise contre décharge.",
  },
  {
    cle: "courrier.imputer",
    moduleKey: "courrier",
    libelle: "Imputer le courrier",
    description: "Attribuer un courrier arrivé à une personne et à un service, avec des instructions et un délai de réponse.",
  },
  {
    cle: "courrier.recevoir",
    moduleKey: "courrier",
    libelle: "Recevoir son courrier",
    description: "Voir le courrier qui vous est imputé, en accuser réception et le traiter. Accordé à tous les comptes.",
  },

  // ---------------------------------------------------------- transmissions
  {
    cle: "transmissions.emettre",
    moduleKey: "transmissions",
    libelle: "Transmettre des pièces",
    description:
      "Établir un bordereau de transmission — à un autre service, à une entreprise, ou pour " +
      "attendre ce qu'une entreprise doit nous remettre — et suivre ceux qu'on a établis.",
  },
  {
    cle: "transmissions.superviser",
    moduleKey: "transmissions",
    libelle: "Superviser les transmissions",
    description: "Voir tous les bordereaux de l'entreprise, leurs retards et leurs retours.",
  },
  {
    cle: "transmissions.recevoir",
    moduleKey: "transmissions",
    libelle: "Recevoir des transmissions",
    description: "Voir les bordereaux qui vous sont adressés, en accuser réception et rendre votre retour. Accordé à tous les comptes.",
  },

  // ------------------------------------------------------ projets et dépenses
  {
    cle: "projet.consulter",
    moduleKey: "projet",
    libelle: "Consulter les projets et dépenses",
    description: "Voir les projets, leur budget consommé, leurs photos et le circuit de chaque dépense.",
  },
  {
    cle: "projet.gerer",
    moduleKey: "projet",
    libelle: "Gérer les projets",
    description: "Créer un projet, l'affecter à un responsable, changer son statut, ajouter photos et pièces.",
  },
  {
    cle: "projet.terrain.collecter",
    moduleKey: "projet",
    libelle: "Relever sur le terrain",
    description:
      "Voir les projets qui vous sont confiés (comme agent, superviseur ou chef de projet) et y relever ce qui est constaté, " +
      "avec photo et position GPS. Accordé à tous les comptes : seuls les projets où vous êtes en poste apparaissent.",
  },
  {
    cle: "depense.demander",
    moduleKey: "projet",
    libelle: "Demander une dépense",
    description: "Saisir un achat à faire, avec son devis, et joindre les justificatifs.",
  },
  {
    cle: "depense.approuver",
    moduleKey: "projet",
    libelle: "Approuver une dépense",
    description:
      "Accepter ou rejeter une demande. Jamais la sienne, sauf pour le propriétaire : " +
      "celui qui demande n'est pas celui qui autorise.",
  },
  {
    cle: "depense.payer",
    moduleKey: "projet",
    libelle: "Payer une dépense",
    description: "Sortir l'argent d'une dépense approuvée, joindre la preuve. Passe l'écriture.",
  },

  // -------------------------------------------------------------- sécurité
  {
    cle: "securite.consulter",
    moduleKey: "securite",
    libelle: "Consulter les sites surveillés",
    description: "Voir les sites, leurs caméras et l'état de leurs relais — pas les images.",
  },
  {
    cle: "securite.visionner",
    moduleKey: "securite",
    libelle: "Regarder les caméras",
    description: "Ouvrir le mur d'images en direct. Chaque caméra ouverte est inscrite au journal.",
  },
  {
    cle: "securite.gerer",
    moduleKey: "securite",
    libelle: "Gérer la vidéosurveillance",
    description: "Déclarer les sites et les caméras, émettre la clé d'un relais, télécharger sa configuration.",
  },
  {
    cle: "securite.fiche.supprimer",
    moduleKey: "securite",
    libelle: "Supprimer un site ou une caméra",
    description: SUPPRESSION,
  },

  // -------------------------------------------------------------- enquêtes
  {
    cle: "enquetes.consulter",
    moduleKey: "enquetes",
    libelle: "Consulter les enquêtes",
    description: "Voir les enquêtes, leurs résultats et la satisfaction mesurée.",
  },
  {
    cle: "enquetes.gerer",
    moduleKey: "enquetes",
    libelle: "Gérer les enquêtes",
    description: "Composer un questionnaire, ouvrir et clore une enquête, envoyer le lien public.",
  },
  {
    cle: "enquetes.saisir",
    moduleKey: "enquetes",
    libelle: "Recueillir des réponses",
    description: "Remplir le questionnaire sur le terrain, répondant après répondant.",
  },

  // ---------------------------------------------------------------- achats
  {
    cle: "achats.consulter",
    moduleKey: "achats",
    libelle: "Consulter les achats",
    description: "Voir les commandes fournisseurs, les réceptions, les factures et les dettes.",
  },
  {
    cle: "achats.commande.gerer",
    moduleKey: "achats",
    libelle: "Passer les commandes fournisseurs",
    description: "Préparer, envoyer et annuler un bon de commande ; préparer le réassort.",
  },
  {
    cle: "achats.reception.saisir",
    moduleKey: "achats",
    libelle: "Réceptionner la marchandise",
    description: "Constater ce qui est livré au dépôt. Fait entrer le stock au prix commandé.",
  },
  {
    cle: "achats.facture.saisir",
    moduleKey: "achats",
    libelle: "Enregistrer les factures fournisseurs",
    description: "Saisir et comptabiliser une facture fournisseur, l'annuler tant qu'elle n'est pas réglée.",
  },
  {
    cle: "achats.reglement.payer",
    moduleKey: "achats",
    libelle: "Régler les fournisseurs",
    description: "Payer une facture fournisseur depuis un compte de trésorerie. Passe l'écriture et lettre le compte.",
  },

  // ------------------------------------------------------------ trésorerie
  {
    cle: "tresorerie.consulter",
    moduleKey: "tresorerie",
    libelle: "Consulter la trésorerie",
    description: "Voir les caisses, banques et portefeuilles, leurs soldes, les virements, les avances et le plan de trésorerie.",
  },
  {
    cle: "tresorerie.compte.gerer",
    moduleKey: "tresorerie",
    libelle: "Gérer les comptes de trésorerie",
    description: "Ouvrir une caisse, une banque, un portefeuille mobile money ; fixer son seuil et son responsable.",
  },
  {
    cle: "tresorerie.compte.supprimer",
    moduleKey: "tresorerie",
    libelle: "Supprimer un compte de trésorerie",
    description: SUPPRESSION,
  },
  {
    cle: "tresorerie.virement.saisir",
    moduleKey: "tresorerie",
    libelle: "Virements internes",
    description: "Alimenter une caisse, verser en banque, transférer d'un compte à l'autre, constater l'arrivée.",
  },
  {
    cle: "tresorerie.bon.demander",
    moduleKey: "tresorerie",
    libelle: "Demander un bon de caisse",
    description: "Demander une dépense payée par la petite caisse, et suivre sa propre demande.",
  },
  {
    cle: "tresorerie.bon.approuver",
    moduleKey: "tresorerie",
    libelle: "Approuver les bons de caisse",
    description:
      "Accepter ou refuser une demande de dépense de caisse. Jamais la sienne, sauf pour le " +
      "propriétaire : celui qui demande n'est pas celui qui autorise.",
  },
  {
    cle: "tresorerie.caisse.tenir",
    moduleKey: "tresorerie",
    libelle: "Tenir la caisse de dépenses",
    description: "Décaisser les bons approuvés, remettre et régulariser les avances, arrêter une caisse. Passe les écritures.",
  },
  {
    cle: "tresorerie.rapprocher",
    moduleKey: "tresorerie",
    libelle: "Rapprochement bancaire",
    description: "Importer un relevé, pointer ses lignes face aux écritures, comptabiliser frais et intérêts bancaires.",
  },
  {
    cle: "tresorerie.mouvement.saisir",
    moduleKey: "tresorerie",
    libelle: "Saisir les mouvements de trésorerie",
    description:
      "Enregistrer une entrée ou une sortie sur une caisse, une banque ou un portefeuille : versement " +
      "d'un client, paiement d'un fournisseur ou d'un prestataire, apport, prêt, frais. Passe l'écriture " +
      "et imprime l'ordre de virement. Annuler un mouvement le contre-passe.",
  },
  {
    cle: "tresorerie.charges.gerer",
    moduleKey: "tresorerie",
    libelle: "Gérer les charges récurrentes et les budgets",
    description:
      "Déclarer loyer, électricité, abonnements ; préparer la dépense de chaque échéance ; fixer " +
      "l'enveloppe mensuelle de chaque famille de charges. La dépense préparée attend toujours " +
      "l'approbation d'un autre membre.",
  },

  // --------------------------------------------------------- organisation
  {
    cle: "organisation.membre.gerer",
    moduleKey: TRANSVERSE,
    libelle: "Gérer les membres",
    description: "Inviter quelqu'un, changer son rôle, révoquer son accès.",
  },
  {
    cle: "rapports.consulter",
    moduleKey: TRANSVERSE,
    libelle: "Ouvrir les rapports",
    description:
      "Accéder à l'espace des rapports et les exporter vers Excel. Chaque rapport exige en plus le droit " +
      "de consulter son module : un caissier qui l'aurait ne verrait pas la paie.",
  },
  {
    cle: "organisation.journal.consulter",
    moduleKey: TRANSVERSE,
    libelle: "Consulter le journal d'activité",
    description:
      "Voir qui s'est connecté, déconnecté, et qui a créé, modifié, attribué ou " +
      "supprimé quoi, quand et depuis quel appareil. Exporter le journal.",
  },
  {
    cle: "organisation.parametres.gerer",
    moduleKey: TRANSVERSE,
    libelle: "Gérer l'entreprise",
    description:
      "Identité de l'entreprise, modules souscrits, abonnement. " +
      "Ce qui engage financièrement reste au propriétaire.",
  },
  {
    cle: "organisation.reprise.importer",
    moduleKey: TRANSVERSE,
    libelle: "Reprendre l'existant",
    description:
      "Importer articles, clients, fournisseurs et stock initial, et reprendre les dettes, " +
      "créances et soldes de trésorerie antérieurs. Passe des écritures d'ouverture.",
  },
] as const satisfies readonly DefinitionDroit[];

export type Droit = (typeof DROITS)[number]["cle"];

export const TOUS_LES_DROITS: readonly Droit[] = DROITS.map((d) => d.cle);

const CLES = new Set<string>(TOUS_LES_DROITS);

/**
 * Droits de tout compte rattaché, quel que soit son rôle — préréglé ou
 * composé par l'entreprise. Lire le règlement intérieur ne se retire à
 * personne : il s'impose à chacun, et chacun doit pouvoir le relire. Le
 * guide d'utilisation non plus : il n'explique que ce qu'on peut ouvrir.
 * Recevoir le courrier qu'on vous impute non plus : la direction impute à
 * qui elle veut.
 *
 * Ajoutés par la garde des droits (`droitsActifs`) avant les restrictions :
 * un module coupé pour l'entreprise les retire comme les autres. Ils ne se
 * proposent pas à la composition d'un rôle, où une case sans effet tromperait.
 */
export const DROITS_DE_TOUS: readonly Droit[] = ["reglement.consulter", "guide.consulter", "courrier.recevoir", "transmissions.recevoir", "projet.terrain.collecter"];

/** Les droits d'un rôle, augmentés de ceux de tout compte. */
export function avecDroitsDeTous(droits: ReadonlySet<Droit>): Set<Droit> {
  return new Set([...droits, ...DROITS_DE_TOUS]);
}

export function droitConnu(cle: string): cle is Droit {
  return CLES.has(cle);
}

export function definitionDroit(cle: Droit): DefinitionDroit {
  // Le catalogue est figé à la compilation : une clé typée y est toujours.
  return DROITS.find((d) => d.cle === cle) as DefinitionDroit;
}

/**
 * Une entrée du catalogue, sa clé resserrée sur les droits qui existent.
 *
 * `DefinitionDroit` sert à déclarer le catalogue et accepte n'importe quelle
 * chaîne ; ce type-ci sert à le lire, et ne laisse passer qu'un droit connu.
 */
export interface EntreeCatalogue extends Omit<DefinitionDroit, "cle"> {
  cle: Droit;
}

export interface GroupeCatalogue {
  moduleKey: string;
  droits: EntreeCatalogue[];
}

/**
 * Le catalogue groupé par module, dans l'ordre de déclaration.
 *
 * Sert à composer un rôle : une liste plate de vingt-trois cases à cocher ne
 * se lit pas, alors que « Stock : consulter, gérer les articles, gérer les
 * dépôts, saisir un mouvement » se décide d'un coup d'œil. Le libellé du
 * module est résolu par l'appelant, dans le registre — ce fichier ne dépend
 * de rien.
 */
export function droitsParModule(): GroupeCatalogue[] {
  const groupes: GroupeCatalogue[] = [];

  for (const droit of DROITS) {
    const groupe = groupes.find((g) => g.moduleKey === droit.moduleKey);
    if (groupe) groupe.droits.push(droit);
    else groupes.push({ moduleKey: droit.moduleKey, droits: [droit] });
  }

  return groupes;
}

/**
 * Ce qu'un rôle peut recevoir, compte tenu de qui le compose.
 *
 * On n'accorde que ce que l'on détient soi-même. Sans cette règle, un gérant
 * composerait un rôle portant des droits qu'il n'a pas — l'abonnement, par
 * exemple — et le confierait à quelqu'un d'autre : le plafond de ses propres
 * droits deviendrait contournable en deux gestes.
 *
 * Les clés inconnues tombent au passage : le catalogue est la seule autorité
 * sur ce qui existe.
 */
export function droitsAccordables(
  detenus: ReadonlySet<Droit>,
  demandes: readonly string[],
): Droit[] {
  const retenus: Droit[] = [];

  for (const demande of demandes) {
    if (droitConnu(demande) && detenus.has(demande) && !retenus.includes(demande)) {
      retenus.push(demande);
    }
  }

  return retenus;
}

// --------------------------------------------------------------------- rôles

/**
 * Rôles préréglés, fournis par Maria Suite.
 *
 * Ils correspondent aux fonctions qu'on rencontre réellement dans une boutique
 * ou un maquis d'Abidjan, pas à une hiérarchie théorique. Une entreprise qui
 * n'y trouve pas son compte crée son propre rôle : celui-là tire ses droits de
 * la base.
 */
export interface PresetRole {
  cle: string;
  nom: string;
  description: string;
  droits: readonly Droit[];
  /**
   * Modules sans lesquels le rôle n'a pas d'objet : un serveur sans
   * restaurant ni maquis, un caissier sans caisse. Quand ils sont tous coupés
   * pour l'entreprise, le rôle n'est ni créé à l'installation ni proposé.
   * Absent pour un rôle transverse.
   */
  modules?: readonly string[];
}

/** Chacun archive ce qui le concerne ; l'administration — propriétaire et gérant — voit tout. */
const ARCHIVAGE_PERSONNEL = ["archives.consulter", "archives.deposer"] as const satisfies readonly Droit[];

/** Le comptable tient la trésorerie ; il n'en approuve pas les dépenses. */
const TRESORERIE_COMPTABLE = [
  "tresorerie.consulter",
  "tresorerie.virement.saisir",
  "tresorerie.bon.demander",
  "tresorerie.caisse.tenir",
  "tresorerie.rapprocher",
  "tresorerie.mouvement.saisir",
  "tresorerie.charges.gerer",
] as const satisfies readonly Droit[];

/** Chacun tient sa liste de tâches ; attribuer aux autres reste à l'encadrement. */
const TACHES_PERSONNELLES = ["taches.consulter", "taches.executer", "conges.demander"] as const satisfies readonly Droit[];

/** Chacun dit où il est ; voir et modifier le planning des autres reste à l'encadrement. */
const PLANNING_PERSONNEL = ["planning.utiliser"] as const satisfies readonly Droit[];

const CONSULTATION_COMMERCE = [
  "tiers.fiche.consulter",
  "stock.article.consulter",
  "commercial.piece.consulter",
] as const satisfies readonly Droit[];

export const PRESETS_ROLES = [
  {
    cle: "proprietaire",
    nom: "Propriétaire",
    description: "Tous les droits, y compris l'abonnement.",
    droits: TOUS_LES_DROITS,
  },
  {
    cle: "gerant",
    nom: "Gérant",
    description:
      "Tient l'exploitation au quotidien. Tout sauf ce qui engage " +
      "financièrement l'entreprise.",
    droits: TOUS_LES_DROITS.filter((cle) => cle !== "organisation.parametres.gerer"),
  },
  {
    cle: "magasinier",
    modules: ["stock"],
    nom: "Magasinier",
    description: "Tient le stock : réceptions, sorties, transferts, inventaire.",
    droits: [
      "stock.article.consulter",
      "stock.article.gerer",
      "stock.depot.gerer",
      "stock.mouvement.saisir",
      "tiers.fiche.consulter",
      "achats.consulter",
      "achats.reception.saisir",
      "tresorerie.bon.demander",
      "visiteurs.annoncer",
      "transmissions.emettre",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
  {
    cle: "secretaire",
    nom: "Secrétaire",
    description:
      "Accueille, oriente et répond au téléphone : voit à tout moment qui est disponible, " +
      "en mission, en courses ou sur le terrain. Consulte le planning de l'équipe sans le modifier. " +
      "Rédige les courriers officiels.",
    droits: [
      "planning.equipe.consulter",
      "tiers.fiche.consulter",
      "documents.consulter",
      "documents.courrier.rediger",
      "boite_mail.utiliser",
      "visiteurs.accueillir",
      "visiteurs.annoncer",
      "courrier.consulter",
      "courrier.enregistrer",
      "transmissions.emettre",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
      "meeting.organiser",
    ],
  },
  {
    cle: "commercial",
    nom: "Commercial",
    description:
      "Prospecte et suit ses clients : élabore son plan de prospection, enregistre les clients " +
      "et leur type, prépare devis et factures. N'encaisse pas.",
    droits: [
      "tiers.fiche.consulter",
      "tiers.fiche.gerer",
      "commercial.piece.consulter",
      "commercial.piece.gerer",
      "commercial.prospection.planifier",
      "stock.article.consulter",
      "communication.consulter",
      "boite_mail.utiliser",
      "visiteurs.annoncer",
      "transmissions.emettre",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
  {
    cle: "comptable",
    nom: "Comptable",
    description:
      "Voit tout ce qui produit une écriture, et n'écrit qu'au journal. " +
      "Souvent externe au commerce : il ne touche ni au stock ni à la caisse.",
    droits: [
      ...CONSULTATION_COMMERCE,
      "tiers.fiche.gerer",
      "comptabilite.ecriture.consulter",
      "rapports.consulter",
      "comptabilite.ecriture.enregistrer",
      "comptabilite.fiscalite.declarer",
      "achats.consulter",
      "achats.facture.saisir",
      "achats.reglement.payer",
      "personnes.consulter",
      "personnes.paie.preparer",
      "personnes.paie.payer",
      "communication.consulter",
      "communication.client.notifier",
      "boite_mail.utiliser",
      "visiteurs.annoncer",
      "transmissions.emettre",
      ...TRESORERIE_COMPTABLE,
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
] as const satisfies readonly PresetRole[];

const PRESET_PAR_CLE = new Map<string, PresetRole>(
  PRESETS_ROLES.map((preset) => [preset.cle, preset]),
);

/**
 * Vrai si le rôle préréglé a un objet quand ces modules sont coupés : un
 * rôle transverse toujours, un rôle de métier tant qu'un de ses modules
 * reste ouvert.
 */
export function presetEnService(preset: PresetRole, coupes: ReadonlySet<string> | readonly string[]): boolean {
  const ensemble = coupes instanceof Set ? coupes : new Set(coupes as readonly string[]);
  return !preset.modules || preset.modules.some((m) => !ensemble.has(m));
}

export function presetRole(cle: string | null | undefined): PresetRole | undefined {
  return cle ? PRESET_PAR_CLE.get(cle) : undefined;
}

// ----------------------------------------------------------------- résolution

export interface ContexteDroits {
  /** Clé du rôle porté par le rattachement — `null` si le rôle a été supprimé. */
  cleRole: string | null;
  /** Créateur de l'entreprise. Ne peut jamais se retrouver enfermé dehors. */
  estProprietaire: boolean;
  /**
   * Accords lus dans `role_permissions`. Ne servent qu'aux rôles créés par
   * l'entreprise : un rôle préréglé tire les siens du code.
   */
  accords?: readonly string[];
}

/**
 * Droits effectifs d'un rattachement.
 *
 * Le propriétaire a tout, sans condition : l'entreprise lui appartient, et une
 * configuration malheureuse ne doit pas pouvoir lui fermer sa propre porte.
 *
 * Tout le reste échoue fermé — rôle inconnu, rôle sans accord, clé inventée :
 * l'ensemble est vide, et chaque vérification refuse.
 */
export function resoudreDroits(contexte: ContexteDroits): Set<Droit> {
  if (contexte.estProprietaire) return new Set(TOUS_LES_DROITS);

  const preset = presetRole(contexte.cleRole);
  if (preset) return new Set(preset.droits);

  const effectifs = new Set<Droit>();
  for (const accord of contexte.accords ?? []) {
    // Une clé disparue du catalogue — droit renommé, module retiré — ne donne
    // plus rien. La ligne reste en base, elle ne décide plus.
    if (droitConnu(accord)) effectifs.add(accord);
  }
  return effectifs;
}
