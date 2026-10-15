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

  // ------------------------------------------------------------------ pos
  {
    cle: "pos.vente.encaisser",
    moduleKey: "pos",
    libelle: "Encaisser",
    description: "Ouvrir la caisse et encaisser un ticket.",
  },
  {
    cle: "pos.vente.consulter",
    moduleKey: "pos",
    libelle: "Consulter les ventes",
  },
  {
    cle: "pos.vente.annuler",
    moduleKey: "pos",
    libelle: "Annuler un ticket",
    description:
      "Geste de contrôle : il défait une recette encaissée, remet la marchandise " +
      "en stock et contre-passe l'écriture. Séparé de l'encaissement à dessein.",
  },
  {
    cle: "pos.poste.gerer",
    moduleKey: "pos",
    libelle: "Gérer les postes de caisse",
    description: "Créer un poste, le rattacher à un appareil, changer son dépôt.",
  },
  {
    cle: "pos.session.ouvrir",
    moduleKey: "pos",
    libelle: "Ouvrir une session de caisse",
    description: "Déclarer le fond de caisse et prendre le tiroir.",
  },
  {
    cle: "pos.session.cloturer",
    moduleKey: "pos",
    libelle: "Clôturer une session de caisse",
    description: "Compter le tiroir et constater l'écart.",
  },

  // ------------------------------------------------------------- commerce
  {
    cle: "boutique.consulter",
    moduleKey: "boutique",
    libelle: "Consulter le tableau de bord du commerce",
    description: "Chiffre du jour, affluence, meilleures ventes, marge et ruptures.",
  },

  // ----------------------------------------------------------- restaurant
  // Le restaurant et le maquis partagent un moteur ; leurs droits restent
  // séparés parce que les modules se vendent séparément.
  {
    cle: "restaurant.consulter",
    moduleKey: "restaurant",
    libelle: "Consulter le restaurant",
    description: "Voir le plan de salle, les commandes et les bons de cuisine.",
  },
  {
    cle: "restaurant.commande.prendre",
    moduleKey: "restaurant",
    libelle: "Prendre les commandes",
    description: "Ouvrir une table, envoyer en cuisine et au bar, annuler une ligne, marquer servi.",
  },
  {
    cle: "restaurant.commande.encaisser",
    moduleKey: "restaurant",
    libelle: "Encaisser une table",
    description: "Transformer la commande en ticket, avec son stock et son écriture.",
  },
  {
    cle: "restaurant.commande.annuler",
    moduleKey: "restaurant",
    libelle: "Annuler une commande entière",
    description: "Geste de contrôle : la table repart sans rien devoir.",
  },
  {
    cle: "restaurant.cuisine.preparer",
    moduleKey: "restaurant",
    libelle: "Tenir la cuisine et le bar",
    description: "Voir les bons à préparer et marquer les plats prêts.",
  },
  {
    cle: "restaurant.salle.gerer",
    moduleKey: "restaurant",
    libelle: "Gérer la salle",
    description: "Créer et retirer les tables, ouvrir le poste d'encaissement de salle.",
  },

  // --------------------------------------------------------------- maquis
  {
    cle: "maquis.consulter",
    moduleKey: "maquis",
    libelle: "Consulter le maquis",
    description: "Voir le plan de salle, les commandes et les bons du grill et du bar.",
  },
  {
    cle: "maquis.commande.prendre",
    moduleKey: "maquis",
    libelle: "Prendre les commandes",
    description: "Ouvrir une table, envoyer au grill et au bar, annuler une ligne, marquer servi.",
  },
  {
    cle: "maquis.commande.encaisser",
    moduleKey: "maquis",
    libelle: "Encaisser une table",
    description: "Transformer la commande en ticket, avec son stock et son écriture.",
  },
  {
    cle: "maquis.commande.annuler",
    moduleKey: "maquis",
    libelle: "Annuler une commande entière",
    description: "Geste de contrôle : la table repart sans rien devoir.",
  },
  {
    cle: "maquis.cuisine.preparer",
    moduleKey: "maquis",
    libelle: "Tenir le grill et le bar",
    description: "Voir les bons à préparer et marquer prêt.",
  },
  {
    cle: "maquis.salle.gerer",
    moduleKey: "maquis",
    libelle: "Gérer la salle",
    description: "Créer et retirer les tables, ouvrir le poste d'encaissement de salle.",
  },

  // ------------------------------------------------------------ hôtellerie
  {
    cle: "hotellerie.consulter",
    moduleKey: "hotellerie",
    libelle: "Consulter l'hôtel",
    description: "Voir les chambres du jour, les séjours, les notes et le registre des voyageurs.",
  },
  {
    cle: "hotellerie.sejour.gerer",
    moduleKey: "hotellerie",
    libelle: "Tenir la réception",
    description:
      "Réserver, remplir la fiche de police, installer le client, porter ses consommations " +
      "sur la note, recevoir un acompte, solder le départ, annuler.",
  },
  {
    cle: "hotellerie.menage",
    moduleKey: "hotellerie",
    libelle: "Tenir le ménage",
    description: "Marquer une chambre faite ou à refaire.",
  },
  {
    cle: "hotellerie.chambre.gerer",
    moduleKey: "hotellerie",
    libelle: "Gérer les chambres",
    description: "Ajouter une chambre, fixer ses tarifs, son étage et sa capacité, la mettre hors service.",
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
    description:
      "Constater l'impôt sur les bénéfices, déterminer le résultat de l'année et fermer l'exercice, affecter le résultat. " +
      "Rouvrir un exercice clos, motif à l'appui : la clôture est contrepassée, jamais effacée.",
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

  // ---------------------------------------------------------- réservations
  {
    cle: "reservation.consulter",
    moduleKey: "reservation",
    libelle: "Consulter les réservations",
    description: "Voir le parc louable, le planning, les contrats et les adhérents.",
  },
  {
    cle: "reservation.ressource.gerer",
    moduleKey: "reservation",
    libelle: "Gérer les ressources louables",
    description: "Ajouter un bien, fixer sa grille de tarifs et sa caution, le mettre en maintenance.",
  },
  {
    cle: "reservation.contrat.gerer",
    moduleKey: "reservation",
    libelle: "Établir les contrats",
    description:
      "Réserver, remettre le bien (encaissement et caution), constater la restitution, annuler.",
  },
  {
    cle: "reservation.abonnement.gerer",
    moduleKey: "reservation",
    libelle: "Gérer les adhérents",
    description: "Inscrire un adhérent, encaisser sa formule, enregistrer ses venues.",
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

  // ---------------------------------------------------------- billetterie
  {
    cle: "billetterie.consulter",
    moduleKey: "billetterie",
    libelle: "Consulter la billetterie",
    description: "Voir les lignes, les départs, leur remplissage et les billets émis.",
  },
  {
    cle: "billetterie.depart.gerer",
    moduleKey: "billetterie",
    libelle: "Programmer les départs",
    description: "Ouvrir une ligne, fixer son tarif, programmer un départ, ouvrir l'embarquement, faire partir le car.",
  },
  {
    cle: "billetterie.billet.vendre",
    moduleKey: "billetterie",
    libelle: "Vendre et contrôler les billets",
    description: "Émettre un billet au plan de places, encaisser, contrôler le passager à la montée.",
  },
  {
    cle: "billetterie.billet.annuler",
    moduleKey: "billetterie",
    libelle: "Annuler et rembourser",
    description: "Annuler un billet ou un départ entier. Contrepasse la recette : à réserver.",
  },

  // ------------------------------------------------- valeur électronique
  {
    cle: "valeur_electronique.consulter",
    moduleKey: "valeur_electronique",
    libelle: "Consulter le point de vente",
    description: "Voir les floats, le journal des opérations et les clôtures.",
  },
  {
    cle: "valeur_electronique.operation.saisir",
    moduleKey: "valeur_electronique",
    libelle: "Tenir le point de vente",
    description: "Ouvrir la session, enregistrer dépôts, retraits, ventes de crédit et approvisionnements.",
  },
  {
    cle: "valeur_electronique.operation.annuler",
    moduleKey: "valeur_electronique",
    libelle: "Annuler une opération",
    description: "Retirer du journal une opération saisie par erreur, motif à l'appui.",
  },
  {
    cle: "valeur_electronique.session.cloturer",
    moduleKey: "valeur_electronique",
    libelle: "Clôturer le point de vente",
    description: "Compter le tiroir, relever les soldes opérateur et passer l'écriture de la journée.",
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
  "pos.vente.consulter",
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
    cle: "caissier",
    nom: "Caissier",
    description:
      "Encaisse et tient son tiroir. N'annule pas : une annulation défait une " +
      "recette, elle appartient à celui qui répond de la caisse.",
    droits: [
      "pos.vente.encaisser",
      "pos.vente.consulter",
      "pos.session.ouvrir",
      "pos.session.cloturer",
      "stock.article.consulter",
      "tiers.fiche.consulter",
      "tresorerie.bon.demander",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
  {
    cle: "serveur",
    nom: "Serveur",
    description:
      "Tient ses tables au restaurant et au maquis : ouvre, envoie en cuisine et " +
      "au bar, sert et encaisse. N'annule pas une commande entière.",
    droits: [
      "restaurant.consulter",
      "restaurant.commande.prendre",
      "restaurant.commande.encaisser",
      "maquis.consulter",
      "maquis.commande.prendre",
      "maquis.commande.encaisser",
      "stock.article.consulter",
      "tiers.fiche.consulter",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
  {
    cle: "cuisinier",
    nom: "Cuisinier",
    description: "Tient la cuisine, le grill ou le bar : voit les bons et marque ce qui est prêt.",
    droits: [
      "restaurant.consulter",
      "restaurant.cuisine.preparer",
      "maquis.consulter",
      "maquis.cuisine.preparer",
      "stock.article.consulter",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
  {
    cle: "receptionniste",
    nom: "Réceptionniste",
    description:
      "Tient la réception de l'hôtel : réservations, fiches de police, arrivées, " +
      "notes de chambre, acomptes et départs.",
    droits: [
      "hotellerie.consulter",
      "hotellerie.sejour.gerer",
      "hotellerie.menage",
      "tiers.fiche.consulter",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
  {
    cle: "agent_menage",
    nom: "Agent de ménage",
    description: "Voit l'état des chambres et marque celles qui sont faites.",
    droits: [
      "hotellerie.consulter",
      "hotellerie.menage",
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
    ],
  },
  {
    cle: "magasinier",
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
      "en mission, en courses ou sur le terrain. Consulte le planning de l'équipe sans le modifier.",
    droits: [
      "planning.equipe.consulter",
      "tiers.fiche.consulter",
      "documents.consulter",
      "boite_mail.utiliser",
      ...ARCHIVAGE_PERSONNEL,
      ...TACHES_PERSONNELLES,
      ...PLANNING_PERSONNEL,
      "messagerie.utiliser",
      "meeting.participer",
      "meeting.organiser",
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
