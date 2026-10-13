/**
 * Lecture du journal d'activité : ce que veut dire chaque ligne.
 *
 * Le journal stocke des verbes techniques — `facture.emettre`,
 * `membre.role`, `connexion.refusee`. Ce module les range en grandes familles
 * (connexion, création, modification, affectation, suppression, consultation)
 * et les traduit en phrases. Pur, sans base : il se teste, et l'écran comme
 * l'export CSV disent la même chose.
 */

export type Categorie =
  | "connexion"
  | "creation"
  | "modification"
  | "affectation"
  | "suppression"
  | "consultation";

export const CATEGORIES: { cle: Categorie; libelle: string }[] = [
  { cle: "connexion", libelle: "Connexions" },
  { cle: "creation", libelle: "Créations" },
  { cle: "modification", libelle: "Modifications" },
  { cle: "affectation", libelle: "Affectations" },
  { cle: "suppression", libelle: "Suppressions et annulations" },
  { cle: "consultation", libelle: "Consultations" },
];

/**
 * Libellés des gestes connus : le verbe au passé composé, son objet ensuite.
 * Un geste absent de la table reste lisible par `libelleAction`, qui retombe
 * sur le module et le verbe.
 */
const LIBELLES: Record<string, string> = {
  "connexion.reussie": "s'est connecté",
  "connexion.refusee": "connexion refusée",
  deconnexion: "s'est déconnecté",
  "session.verrouillee": "écran verrouillé après inactivité",
  "session.verrouillee_manuel": "a verrouillé son écran",
  "session.deverrouillee": "a déverrouillé son écran",
  "session.deverrouillage_refuse": "déverrouillage refusé (mot de passe incorrect)",
  "compte.inscrire": "a créé son compte",
  "compte.mot_de_passe": "a changé son mot de passe",
  "compte.reinitialisation_demandee": "a demandé un lien de nouveau mot de passe",
  "compte.mot_de_passe_reinitialise": "a choisi un nouveau mot de passe par lien e-mail",
  "entreprise.basculer": "a changé d'entreprise active",
  "entreprise.creer": "a créé l'entreprise",
  "demonstration.installer": "a installé le jeu de démonstration",

  "membre.ajouter": "a ajouté un utilisateur",
  "membre.role": "a changé le rôle d'un utilisateur",
  "membre.statut": "a changé le statut d'un utilisateur",
  "membre.acces": "a changé les accès d'un utilisateur",
  "membre.mot_de_passe": "a réinitialisé un mot de passe",
  "role.creer": "a créé un rôle",
  "role.droits": "a modifié les droits d'un rôle",
  "role.supprimer": "a supprimé un rôle",
  "module.activer": "a activé un module",
  "module.couper": "a coupé un module",

  "tiers.creer": "a créé un client ou fournisseur",
  "tiers.archiver": "a archivé un client ou fournisseur",
  "article.creer": "a créé un article",
  "article.archiver": "a archivé un article",
  "depot.creer": "a ouvert un dépôt",
  "depot.fermer": "a fermé un dépôt",
  "stock.transferer": "a transféré du stock",
  "stock.reception": "a réceptionné du stock",
  "stock.retour": "a enregistré un retour en stock",
  "stock.ajustement": "a ajusté un stock",

  "caisse.ouvrir": "a ouvert un poste de caisse",
  "caisse.ouvrir_session": "a ouvert une session de caisse",
  "caisse.cloturer_session": "a clôturé une session de caisse",
  "poste.creer": "a créé un poste de caisse",
  "poste.rattacher": "a rattaché un poste à un appareil",
  "vente.encaisser": "a encaissé un ticket",
  "vente.annuler": "a annulé un ticket",

  "table_salle.creer": "a ajouté une table",
  "table_salle.retirer": "a retiré une table du plan de salle",
  "table_salle.activer": "a remis une table sur le plan de salle",
  "commande_salle.ouvrir": "a ouvert une commande de table",
  "commande_salle.envoyer": "a envoyé en cuisine ou au bar",
  "commande_salle.encaisser": "a encaissé une table",
  "commande_salle.annuler": "a annulé une commande de table",
  "ligne_salle.prete": "a marqué prêt",
  "ligne_salle.servie": "a marqué servi",
  "ligne_salle.annuler": "a annulé une ligne de commande",

  "enquete.creer": "a créé une enquête",
  "enquete.modifier": "a modifié le questionnaire d'une enquête",
  "enquete.ouvrir": "a ouvert une enquête aux réponses",
  "enquete.fermer": "a clos une enquête",
  "enquete.lien_activer": "a rétabli le lien public d'une enquête",
  "enquete.lien_couper": "a coupé le lien public d'une enquête",

  "site_securite.creer": "a déclaré un site surveillé",
  "site_securite.cle_relais": "a émis la clé du relais d'un site",
  "camera.creer": "a ajouté une caméra",
  "camera.regler": "a réglé une caméra",
  "camera.visionner": "a regardé une caméra",

  "brouillon.creer": "a préparé un devis ou une facture",
  "brouillon.modifier": "a modifié un brouillon",
  "brouillon.supprimer": "a supprimé un brouillon",
  "devis.emettre": "a émis un devis",
  "facture.emettre": "a émis une facture",
  "avoir.emettre": "a émis un avoir",
  "devis.accepter": "a enregistré l'acceptation d'un devis",
  "devis.refuser": "a enregistré le refus d'un devis",
  "devis.convertir": "a converti un devis en facture",
  "facture.encaisser": "a encaissé un règlement",
  "facture.annuler": "a annulé une facture",

  "ecriture.passer": "a passé une écriture",
  "lettrage.lettrer": "a lettré des écritures",
  "lettrage.annuler": "a annulé un lettrage",

  "salarie.embaucher": "a embauché un salarié",
  "salarie.sortir": "a sorti un salarié des effectifs",
  "salarie.etat_civil": "a modifié l'état civil d'un salarié",
  "salarie.photo": "a changé la photo d'un salarié",
  "salarie.photo_retirer": "a retiré la photo d'un salarié",
  "salarie.dossier.consulter": "a consulté le dossier d'un salarié",
  "piece_employe.ajouter": "a ajouté une pièce au dossier d'un salarié",
  "piece_employe.retirer": "a retiré une pièce du dossier d'un salarié",
  "piece_employe.ouvrir": "a ouvert une pièce du dossier d'un salarié",
  "vehicule.modifier": "a modifié la fiche d'un véhicule",
  "plein.enregistrer": "a noté un plein de carburant",
  "plein.retirer": "a retiré un plein de carburant",
  "equipement.modifier": "a modifié la fiche d'un équipement informatique",
  "licence.creer": "a enregistré une licence logicielle",
  "licence.retirer": "a retiré une licence logicielle",
  "licence.attribuer": "a installé une licence sur un poste",
  "licence.desattribuer": "a désinstallé une licence d'un poste",
  "campagne.envoyer": "a envoyé un message groupé",
  "groupe.creer": "a créé un groupe de discussion",
  "prestataire.creer": "a inscrit un prestataire",
  "prestataire.modifier": "a modifié la fiche d'un prestataire",
  "prestation.demander": "a confié une prestation",
  "prestation.confirmer": "a confirmé une prestation",
  "prestation.realiser": "a constaté la réalisation d'une prestation",
  "prestation.annuler": "a annulé une prestation",
  "prestation.evaluer": "a noté une prestation",
  "prestation.payer": "a payé une prestation",
  "presence.pointer": "a pointé la présence d'un salarié",
  "presence.corriger": "a corrigé une présence",
  "presence.depart": "a pointé son départ",
  "presence.reglages": "a modifié les horaires et la règle des congés",
  "presence.ferie": "a modifié les jours fériés",
  "conge.demander": "a demandé un congé",
  "conge.saisir": "a saisi un congé pour un salarié",
  "conge.approuve": "a accordé un congé",
  "conge.refuse": "a refusé un congé",
  "conge.annule": "a annulé un congé",
  "conge.ajuster": "a ajusté un solde de congés",
  "soumission.creer": "a ouvert une soumission à un appel d'offres",
  "soumission.modifier": "a modifié une soumission",
  "soumission.en_preparation": "a commencé à préparer une soumission",
  "soumission.deposee": "a déposé une soumission",
  "soumission.gagnee": "a noté une soumission gagnée",
  "soumission.perdue": "a noté une soumission perdue",
  "soumission.abandonnee": "a abandonné une soumission",
  "consultation.creer": "a lancé une consultation",
  "consultation.inviter": "a invité des fournisseurs à une consultation",
  "consultation.offre": "a enregistré une offre",
  "consultation.cloturer": "a clos une consultation",
  "consultation.attribuer": "a attribué une consultation",
  "consultation.annuler": "a annulé une consultation",
  "convention.creer": "a enregistré une convention",
  "convention.joindre": "a joint le document d'une convention",
  "convention.avenant": "a ajouté un avenant",
  "convention.resilier": "a résilié une convention",
  "boite_mail.connecter": "a connecté sa boîte mail",
  "boite_mail.deconnecter": "a déconnecté sa boîte mail",
  "boite_mail.envoyer": "a envoyé un e-mail depuis sa boîte",
  "groupe.ajouter": "a ajouté des membres à un groupe",
  "groupe.retirer": "a retiré un membre d'un groupe",
  "groupe.quitter": "a quitté un groupe de discussion",
  "intervenant.creer": "a ouvert la fiche d'un intervenant",
  "intervenant.fermer": "a fermé la fiche d'un intervenant",
  "pointage.saisir": "a pointé un intervenant",
  "bon-paiement.regler": "a réglé un intervenant",

  "actif.creer": "a créé un actif",
  "actif.statut": "a changé l'état d'un actif",
  "actif.releve": "a relevé un compteur",
  "intervention.saisir": "a saisi une intervention",
  "echeance.creer": "a créé une échéance",

  "document.deposer": "a déposé un document",
  "document.supprimer": "a supprimé un document",
  "signature.demander": "a demandé une signature",
  "signature.signer": "a signé un document",

  "mission.creer": "a créé une mission",
  "mission.etape": "a validé une étape de mission",
  "mission.photo": "a joint une photo à une mission",
  "mission.echouer": "a déclaré une mission échouée",
  "mission.annuler": "a annulé une mission",
  "formulaire.creer": "a créé un formulaire",

  "ressource.creer": "a créé une ressource louable",
  "ressource.statut": "a changé l'état d'une ressource",
  "contrat.reserver": "a réservé",
  "contrat.remettre": "a remis un bien loué",
  "contrat.restituer": "a constaté une restitution",
  "contrat.annuler": "a annulé une réservation",
  "abonnement.inscrire": "a inscrit un adhérent",
  "abonnement.passage": "a enregistré une venue",

  "chambre.menage": "a changé l'état de ménage d'une chambre",
  "chambre.regler": "a réglé une chambre",
  "sejour.reserver": "a réservé un séjour",
  "sejour.dates": "a changé les dates d'un séjour",
  "sejour.voyageur": "a rempli une fiche de police",
  "sejour.arrivee": "a installé un client en chambre",
  "sejour.prestation": "a porté une consommation sur une note de chambre",
  "sejour.prestation_retirer": "a retiré une ligne d'une note de chambre",
  "sejour.acompte": "a reçu un acompte de séjour",
  "sejour.depart": "a soldé un départ",
  "sejour.annuler": "a annulé une réservation de séjour",

  "ligne.creer": "a créé une ligne de transport",
  "ligne.suspendre": "a suspendu une ligne",
  "ligne.reprendre": "a repris une ligne",
  "depart.programmer": "a programmé un départ",
  "depart.embarquement": "a ouvert l'embarquement",
  "depart.parti": "a fait partir un car",
  "depart.annule": "a annulé un départ",
  "billet.vendre": "a vendu des billets",
  "billet.embarquer": "a contrôlé un passager",
  "billet.annuler": "a annulé un billet",

  "guichet.ouvrir": "a ouvert le guichet",
  "guichet.operation": "a enregistré une opération de guichet",
  "guichet.annuler_operation": "a annulé une opération du point de vente",
  "guichet.cloturer": "a clôturé le point de vente",

  "projet.creer": "a créé un projet",
  "projet.modifier": "a modifié un projet",
  "depense.demander": "a demandé une dépense",
  "depense.approuver": "a approuvé une dépense",
  "depense.rejeter": "a rejeté une dépense",
  "depense.annuler": "a annulé une dépense",
  "depense.payer": "a payé une dépense",
  "piece.joindre": "a joint une pièce",
  "piece.retirer": "a retiré une pièce",

  "charge.creer": "a créé une charge récurrente",
  "charge.suspendre": "a suspendu une charge récurrente",
  "charge.reprendre": "a repris une charge récurrente",
  "charge.supprimer": "a supprimé une charge récurrente",
  "charge.preparer": "a préparé la dépense d'une échéance",
  "charge.ignorer": "a écarté une échéance",
  "charge.budget": "a fixé un budget de charges",

  "mouvement.enregistrer": "a enregistré un mouvement de trésorerie",
  "mouvement.annuler": "a annulé un mouvement de trésorerie",

  "archive.deposer": "a archivé un fichier",
  "archive.ouvrir": "a ouvert une archive",
  "archive.retirer": "a retiré une archive",
  "archive.verifier": "a vérifié l'intégrité d'une archive",
  "archive_dossier.creer": "a créé un dossier partagé",
  "archive_dossier.modifier": "a modifié un dossier partagé",
  "archive_dossier.supprimer": "a supprimé un dossier partagé",

  "tache.creer": "a créé une tâche",
  "tache.attribuer": "a attribué une tâche",
  "tache.modifier": "a modifié une tâche",
  "tache.demarrer": "a commencé une tâche",
  "tache.terminer": "a terminé une tâche",
  "tache.rouvrir": "a rouvert une tâche",
  "tache.annuler": "a annulé une tâche",

  "journal.exporter": "a exporté le journal d'activité",

  "compte_tresorerie.creer": "a ouvert un compte de trésorerie",
  "compte_tresorerie.modifier": "a modifié un compte de trésorerie",
  "virement.envoyer": "a envoyé un virement interne",
  "virement.recevoir": "a constaté l'arrivée d'un virement",
  "virement.annuler": "a annulé un virement interne",
  "bon_caisse.demander": "a demandé un bon de caisse",
  "bon_caisse.approuver": "a approuvé un bon de caisse",
  "bon_caisse.rejeter": "a refusé un bon de caisse",
  "bon_caisse.decaisser": "a décaissé un bon de caisse",
  "bon_caisse.annuler": "a annulé un bon de caisse",
  "avance.remettre": "a remis une avance",
  "avance.justifier": "a justifié une avance",
  "avance.rembourser": "a enregistré un remboursement d'avance",
  "arrete_caisse.passer": "a arrêté une caisse",
  "releve.importer": "a importé un relevé bancaire",
  "releve.pointer": "a pointé le relevé bancaire",
  "releve.depointer": "a retiré un pointage",
  "releve.comptabiliser": "a comptabilisé une ligne de relevé",

  "commande_achat.creer": "a préparé une commande fournisseur",
  "commande_achat.modifier": "a modifié une commande fournisseur",
  "commande_achat.envoyer": "a envoyé une commande fournisseur",
  "commande_achat.annuler": "a annulé une commande fournisseur",
  "reception_achat.recevoir": "a réceptionné une livraison",
  "facture_fournisseur.enregistrer": "a enregistré une facture fournisseur",
  "facture_fournisseur.annuler": "a annulé une facture fournisseur",
  "facture_fournisseur.regler": "a réglé un fournisseur",

  "bareme_paie.modifier": "a modifié le barème de paie",
  "paie.preparer": "a préparé la paie",
  "paie.elements": "a saisi des éléments de paie",
  "paie.retirer": "a retiré un salarié de la paie",
  "paie.valider": "a validé la paie du mois",
  "paie.payer": "a payé des salaires",
  "paie.verser_cnps": "a versé les cotisations CNPS",
  "paie.verser_impot": "a versé l'impôt sur salaires",

  "contact.enregistrer": "a enregistré un contact",
  "contact.retirer": "a retiré un contact",
  "commercial.enregistrer": "a enregistré un commercial",
  "commission.valider": "a validé une commission",
  "commission.payer": "a payé une commission",
  "commission.paie": "a reporté une commission en paie",
  "modele_article.creer": "a créé un modèle à variantes",
  "modele_article.declinaisons": "a ajouté des déclinaisons à un modèle",
  "modele_article.prix": "a modifié les prix des variantes",
  "organisation.identite": "a modifié l'identité de l'entreprise",
  "organisation.verrouillage": "a changé le délai de verrouillage des écrans",
  "reprise.articles": "a importé des articles",
  "reprise.tiers": "a repris clients, fournisseurs et soldes antérieurs",
  "reprise.stock": "a repris le stock initial",
  "reprise.tresorerie": "a repris un solde de trésorerie",
  "declaration_tva.deposer": "a déclaré la TVA du mois",
  "declaration_tva.payer": "a payé la TVA",
  "exercice.cloturer": "a clôturé l'exercice",
};

/** Gestes dont la famille ne se déduit pas du verbe seul. */
const FAMILLE_EXPLICITE: Record<string, Categorie> = {
  "connexion.reussie": "connexion",
  "connexion.refusee": "connexion",
  deconnexion: "connexion",
  "session.verrouillee": "connexion",
  "session.verrouillee_manuel": "connexion",
  "session.deverrouillee": "connexion",
  "session.deverrouillage_refuse": "connexion",
  "entreprise.basculer": "connexion",
  "compte.mot_de_passe": "modification",
  "compte.reinitialisation_demandee": "modification",
  "compte.mot_de_passe_reinitialise": "modification",
  "compte.inscrire": "creation",
  "archive.ouvrir": "consultation",
  "salarie.dossier.consulter": "consultation",
  "piece_employe.ouvrir": "consultation",
  "piece_employe.retirer": "suppression",
  "plein.retirer": "suppression",
  "licence.retirer": "suppression",
  "licence.desattribuer": "suppression",
  "licence.attribuer": "affectation",
  "archive.verifier": "consultation",
  "membre.role": "affectation",
  "membre.acces": "affectation",
  "membre.ajouter": "creation",
  "role.droits": "affectation",
  "poste.rattacher": "affectation",
  "tache.attribuer": "affectation",
  "stock.transferer": "affectation",
  "contrat.remettre": "affectation",
  "sejour.arrivee": "affectation",
  "sejour.depart": "modification",
  "sejour.voyageur": "creation",
  "sejour.prestation_retirer": "suppression",
  "module.couper": "suppression",
  "module.activer": "modification",
  "guichet.ouvrir": "creation",
  "caisse.ouvrir_session": "creation",
  "depart.annule": "suppression",
  "bon-paiement.regler": "creation",
  "journal.exporter": "consultation",
  "virement.envoyer": "affectation",
  "virement.recevoir": "affectation",
  "bon_caisse.approuver": "modification",
  "bon_caisse.decaisser": "creation",
  "avance.remettre": "creation",
  "avance.justifier": "modification",
  "avance.rembourser": "modification",
  "arrete_caisse.passer": "creation",
  "releve.pointer": "modification",
  "releve.comptabiliser": "creation",
  "commande_achat.envoyer": "modification",
  "reception_achat.recevoir": "creation",
  "facture_fournisseur.enregistrer": "creation",
  "facture_fournisseur.regler": "creation",
  "paie.preparer": "creation",
  "paie.elements": "modification",
  "paie.valider": "modification",
  "paie.payer": "creation",
  "paie.verser_cnps": "creation",
  "paie.verser_impot": "creation",
  "declaration_tva.deposer": "creation",
  "declaration_tva.payer": "creation",
  "exercice.cloturer": "modification",
  "camera.visionner": "consultation",
};

const VERBES: [RegExp, Categorie][] = [
  [/(supprimer|retirer|annuler|annule|archiver|sortir|fermer|couper|rejeter|refuser|suspendre)$/, "suppression"],
  [/(attribuer|affecter|rattacher|transferer)$/, "affectation"],
  [
    /(creer|ajouter|deposer|demander|embaucher|inscrire|programmer|saisir|passer|encaisser|emettre|vendre|reserver|joindre|operation|releve|photo|passage|installer|lettrer|reception|retour|ajustement)$/,
    "creation",
  ],
];

/** Famille d'un geste. Par défaut, une modification. */
export function categorieAction(action: string): Categorie {
  const explicite = FAMILLE_EXPLICITE[action];
  if (explicite) return explicite;
  if (action.startsWith("connexion")) return "connexion";
  for (const [motif, categorie] of VERBES) if (motif.test(action)) return categorie;
  return "modification";
}

const MODULES: Record<string, string> = {
  connexion: "Accès",
  deconnexion: "Accès",
  session: "Accès",
  compte: "Accès",
  entreprise: "Entreprise",
  demonstration: "Entreprise",
  membre: "Utilisateurs",
  role: "Utilisateurs",
  module: "Modules",
  tiers: "Commercial",
  brouillon: "Facturation",
  devis: "Facturation",
  facture: "Facturation",
  avoir: "Facturation",
  article: "Stock",
  depot: "Stock",
  stock: "Stock",
  caisse: "Caisse",
  poste: "Caisse",
  vente: "Caisse",
  commande_salle: "Restauration",
  ligne_salle: "Restauration",
  table_salle: "Restauration",
  enquete: "Enquêtes",
  site_securite: "Sécurité",
  camera: "Sécurité",
  chambre: "Hôtel",
  sejour: "Hôtel",
  ecriture: "Comptabilité",
  lettrage: "Comptabilité",
  salarie: "Personnel",
  piece_employe: "Personnel",
  vehicule: "Parc auto",
  plein: "Parc auto",
  equipement: "Parc informatique",
  licence: "Parc informatique",
  campagne: "Communication",
  groupe: "Messagerie",
  prestataire: "Prestataires",
  prestation: "Prestataires",
  soumission: "Marchés",
  consultation: "Marchés",
  convention: "Marchés",
  boite_mail: "Boîte mail",
  intervenant: "Personnel",
  pointage: "Personnel",
  "bon-paiement": "Personnel",
  actif: "Actifs",
  intervention: "Actifs",
  echeance: "Actifs",
  document: "Documents",
  signature: "Documents",
  mission: "Missions",
  formulaire: "Missions",
  ressource: "Réservations",
  contrat: "Réservations",
  abonnement: "Réservations",
  ligne: "Billetterie",
  depart: "Billetterie",
  billet: "Billetterie",
  guichet: "Point de vente",
  projet: "Projets",
  depense: "Projets",
  charge: "Trésorerie",
  mouvement: "Trésorerie",
  piece: "Projets",
  archive: "Archives",
  archive_dossier: "Archives",
  tache: "Tâches",
  journal: "Journal",
  compte_tresorerie: "Trésorerie",
  virement: "Trésorerie",
  bon_caisse: "Trésorerie",
  avance: "Trésorerie",
  arrete_caisse: "Trésorerie",
  releve: "Trésorerie",
  commande_achat: "Achats",
  reception_achat: "Achats",
  facture_fournisseur: "Achats",
  paie: "Paie",
  bareme_paie: "Paie",
  declaration_tva: "Fiscalité",
  souscription: "Abonnement",
  reprise: "Démarrage",
  modele_article: "Stock",
  commercial: "Commercial",
  contact: "Commercial",
  commission: "Commercial",
  exercice: "Fiscalité",
};

/** Module d'un geste, d'après son préfixe. */
export function moduleAction(action: string): string {
  const prefixe = action.split(".")[0];
  return MODULES[prefixe] ?? prefixe.charAt(0).toUpperCase() + prefixe.slice(1).replace(/_/g, " ");
}

/** Phrase d'un geste : « a émis une facture ». */
export function libelleAction(action: string): string {
  if (LIBELLES[action]) return LIBELLES[action];
  const [objet, verbe] = action.split(".");
  return verbe ? `${verbe.replace(/_/g, " ")} — ${objet.replace(/_/g, " ")}` : action.replace(/_/g, " ");
}

/** Clés techniques qu'on ne montre pas dans le détail : des identifiants, illisibles. */
const CLES_MASQUEES = /^(id|.*Id|.*_id|empreinte|tokenHash)$/;

/**
 * Le détail d'un geste en une ligne : « numero : FAC-2026-00012 · montant : 50 000 ».
 *
 * Un identifiant de personne (`assigneeUserId`) se lit par son nom quand
 * l'appelant fournit l'annuaire : « assignee : Awa Koné ».
 */
export function resumeDetail(detail: unknown, noms?: ReadonlyMap<string, string>): string {
  if (!detail || typeof detail !== "object") return "";
  return Object.entries(detail as Record<string, unknown>)
    .map(([cle, valeur]): [string, unknown] =>
      /UserId$/.test(cle) && typeof valeur === "string"
        ? [cle.replace(/UserId$/, ""), noms?.get(valeur) ?? "membre inconnu"]
        : [cle, valeur],
    )
    .filter(([cle, valeur]) => !CLES_MASQUEES.test(cle) && valeur !== null && valeur !== undefined && valeur !== "")
    .map(([cle, valeur]) => {
      const texte = Array.isArray(valeur)
        ? `${valeur.length}`
        : typeof valeur === "object"
          ? JSON.stringify(valeur)
          : typeof valeur === "number"
            ? new Intl.NumberFormat("fr-FR").format(valeur)
            : typeof valeur === "boolean"
              ? valeur
                ? "oui"
                : "non"
              : String(valeur);
      return `${cle} : ${texte.length > 60 ? `${texte.slice(0, 57)}…` : texte}`;
    })
    .join(" · ");
}

/** Navigateur et système, lus grossièrement dans l'agent : de quoi reconnaître un appareil. */
export function appareil(userAgent: string | null): string {
  if (!userAgent) return "—";
  const systeme = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  const navigateur = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "";
  return [navigateur, systeme].filter(Boolean).join(" · ") || "Autre";
}
