import type { Chapitre } from "./regles";

/** Commerce, finance, terrain, biens, documents, sécurité, pilotage et administration. */
export const CHAPITRES_GESTION: Chapitre[] = [
  // ------------------------------------------------------------- commerce
  {
    cle: "clients",
    titre: "Clients",
    entree: "/commercial",
    resume: "Le fichier des clients, leurs contacts, leur encours et ce qu'ils doivent.",
    sections: [
      {
        ancre: "fiche",
        titre: "La fiche client",
        texte: [
          "Chaque client a sa fiche : coordonnées, N° de compte contribuable (NCC), contacts, délai de règlement et encours autorisé. Son compte auxiliaire est créé d'office en comptabilité ; le solde dû se lit dans les écritures, jamais saisi à la main.",
          "Une fiche saisie par erreur et jamais utilisée peut se supprimer ; une fiche qui a servi se met en off et garde son historique.",
        ],
      },
    ],
    quiz: [
      {
        cle: "clients-solde",
        question: "D'où vient le solde dû d'un client ?",
        choix: ["Il se saisit sur la fiche", "Il se lit dans les écritures comptables : factures et règlements", "Du tableur du commercial"],
        bonne: 1,
        explication: "Le solde se déduit des écritures : il ne peut pas diverger de la comptabilité.",
      },
    ],
  },
  {
    cle: "fournisseurs",
    titre: "Fournisseurs",
    entree: "/commercial/fournisseurs",
    resume: "Le fichier des fournisseurs et ce qu'on leur doit.",
    sections: [
      {
        ancre: "fiche",
        titre: "La fiche fournisseur",
        texte: ["Comme un client, un fournisseur a sa fiche, ses contacts et son compte auxiliaire (401). Ses commandes, factures et règlements passent par le module Achats."],
      },
    ],
    quiz: [],
  },
  {
    cle: "commerciaux",
    titre: "Commerciaux",
    entree: "/commercial/commerciaux",
    resume: "Les commerciaux, leur chiffre d'affaires et leurs commissions à paliers.",
    sections: [
      {
        ancre: "commissions",
        titre: "Commissions",
        texte: ["Une facture rattachée à un commercial compte dans son chiffre d'affaires hors taxes ; la commission se calcule par paliers, puis se valide et se paie depuis la trésorerie."],
      },
    ],
    quiz: [],
  },
  {
    cle: "factures",
    titre: "Devis et factures",
    entree: "/commercial/factures",
    resume: "Du devis à la facture, au règlement et à la relance.",
    sections: [
      {
        ancre: "devis",
        titre: "Devis et factures",
        texte: [
          "Un devis se transforme en facture sans rien ressaisir. Émettre une facture lui donne son numéro, sans trou ni doublon, et passe l'écriture comptable ; la TVA est celle de la Côte d'Ivoire (18 %).",
          "Une ligne peut en porter d'autres : la pose d'un climatiseur facturée sous l'appareil vendu, par exemple. Une facture émise ne se modifie plus : elle s'annule par un avoir.",
        ],
        capture: {
          fichier: "factures",
          page: "/commercial/factures",
          alt: "La liste des devis et factures.",
          reperes: [{ cible: "main h1 >> nth=0", texte: "Devis, factures et avoirs, avec leur état." }],
        },
      },
      {
        ancre: "reglements",
        titre: "Encaisser et relancer",
        texte: ["Un règlement se saisit sur la facture, dans la caisse ou la banque qui reçoit. Une facture échue se relance par e-mail ou WhatsApp : le client reçoit un lien vers sa pièce."],
      },
    ],
    quiz: [
      {
        cle: "factures-correction",
        question: "Une facture émise comporte une erreur. Comment la corriger ?",
        choix: ["La modifier directement", "L'annuler par un avoir, puis émettre la bonne", "Supprimer la facture"],
        bonne: 1,
        explication: "Une facture émise est numérotée et comptabilisée : elle ne se modifie pas, elle s'annule par un avoir.",
      },
      {
        cle: "factures-numero",
        question: "Quand une facture reçoit-elle son numéro ?",
        choix: ["Dès le brouillon", "À l'émission, sans trou ni doublon", "À l'encaissement"],
        bonne: 1,
        explication: "Le numéro est attribué à l'émission, dans la même opération que l'écriture.",
      },
    ],
  },
  {
    cle: "achats",
    titre: "Achats",
    entree: "/achats",
    resume: "Commander, recevoir, contrôler la facture du fournisseur, la régler.",
    sections: [
      {
        ancre: "commandes",
        titre: "Commande et réception",
        chemin: "/achats",
        texte: ["Un bon de commande part au fournisseur. À la livraison, la réception saisit ce qui est réellement arrivé : le stock monte au prix commandé, et ce qui reste à livrer se lit sur la commande."],
      },
      {
        ancre: "factures",
        titre: "Facture fournisseur et règlement",
        chemin: "/achats/factures",
        texte: [
          "La facture du fournisseur se contrôle face à la réception : on ne paie pas ce qu'on n'a pas reçu. Elle passe en comptabilité, puis se règle depuis la trésorerie.",
          "L'onglet Dettes et règlements montre ce qui reste à payer, fournisseur par fournisseur.",
        ],
      },
    ],
    quiz: [
      {
        cle: "achats-controle",
        question: "Face à quoi se contrôle une facture fournisseur ?",
        choix: ["Face au devis du fournisseur", "Face à la réception : ce qui a réellement été livré", "Face au budget de l'année"],
        bonne: 1,
        explication: "Comparer la facture à la réception évite de payer une marchandise jamais arrivée.",
      },
    ],
  },
  {
    cle: "stock",
    titre: "Stock",
    entree: "/stock",
    resume: "Articles, dépôts, mouvements, inventaire et réapprovisionnement.",
    sections: [
      {
        ancre: "articles",
        titre: "Articles",
        chemin: "/stock/articles",
        texte: ["Un article porte sa famille, son unité, son prix et un ou plusieurs codes scannables (EAN du fabricant et code interne). Un seuil d'alerte signale l'article à réapprovisionner."],
      },
      {
        ancre: "mouvements",
        titre: "Mouvements",
        chemin: "/stock/mouvements",
        texte: ["Toute entrée, sortie, transfert entre dépôts ou ajustement d'inventaire est un mouvement daté et tracé : le stock n'est jamais saisi directement, il se déduit des mouvements. Il est valorisé au coût moyen pondéré."],
      },
    ],
    quiz: [
      {
        cle: "stock-ajustement",
        question: "L'inventaire trouve 3 sacs de moins qu'à l'écran. Que faire ?",
        choix: ["Corriger le chiffre du stock", "Saisir un ajustement d'inventaire, qui reste tracé", "Ne rien faire"],
        bonne: 1,
        explication: "Le stock se déduit des mouvements : l'écart se constate par un ajustement daté.",
      },
    ],
  },

  // -------------------------------------------------------------- terrain
  {
    cle: "projets",
    titre: "Projets",
    entree: "/projets",
    resume: "Projets, budget, et dépenses justifiées de la demande au paiement.",
    sections: [
      {
        ancre: "projets",
        titre: "Projets et budget",
        chemin: "/projets",
        texte: ["Un projet a un responsable et un budget. Chaque dépense s'y rattache : on voit à tout moment l'engagé, le payé et le reste."],
      },
      {
        ancre: "depenses",
        titre: "Le circuit d'une dépense",
        chemin: "/projets/depenses",
        texte: ["Une dépense se demande, s'approuve par une autre personne que celle qui l'a demandée, puis se paie : le paiement passe l'écriture. Photos et preuve de paiement (reçu, capture mobile money) se joignent à la dépense."],
        etapes: ["Nouvelle dépense : montant, motif, pièce.", "Approbation par un responsable.", "Paiement, avec sa preuve."],
      },
    ],
    quiz: [
      {
        cle: "projets-approbation",
        question: "Peut-on approuver sa propre demande de dépense ?",
        choix: ["Oui", "Non : une autre personne l'approuve", "Oui, si le montant est faible"],
        bonne: 1,
        explication: "Demander et approuver sont deux gestes de deux personnes : c'est le contrôle.",
      },
    ],
  },
  {
    cle: "missions",
    titre: "Missions",
    entree: "/missions",
    resume: "Missions de terrain : étapes, preuves horodatées et géolocalisées, formulaires.",
    sections: [
      {
        ancre: "etapes",
        titre: "Étapes et preuves",
        texte: [
          "Une mission assignée se déroule par étapes, validées dans l'ordre. Chaque étape peut exiger une preuve prise sur l'appareil : photo, position, signature ou note, horodatées au moment même.",
          "Sans réseau, la saisie attend dans l'appareil et part dans l'ordre au retour de la connexion.",
        ],
      },
      {
        ancre: "suivi",
        titre: "Suivi terrain",
        chemin: "/missions/suivi",
        texte: ["Le suivi montre l'avancement de chaque mission en cours et ce que le terrain a fait remonter."],
      },
    ],
    quiz: [
      {
        cle: "missions-hors-ligne",
        question: "Vous validez une étape sans réseau. Que devient la saisie ?",
        choix: ["Elle est perdue", "Elle attend sur l'appareil et part au retour du réseau", "Il faut la refaire au bureau"],
        bonne: 1,
        explication: "La file hors connexion rejoue les saisies dans l'ordre dès que le réseau revient.",
      },
    ],
  },
  {
    cle: "prestataires",
    titre: "Prestataires",
    entree: "/prestataires",
    resume: "Plombiers, électriciens, photographes : annuaire, prestations, avis et paiement.",
    sections: [
      {
        ancre: "annuaire",
        titre: "Annuaire et prestations",
        texte: ["L'annuaire classe les indépendants par métier et par zone, avec leur tarif. Une prestation va de la demande au paiement ; l'avis laissé à la fin nourrit la note moyenne. Le paiement passe en comptabilité avec la retenue à la source due."],
      },
    ],
    quiz: [],
  },
  {
    cle: "enquetes",
    titre: "Enquêtes",
    entree: "/enquetes",
    resume: "Questionnaires de satisfaction, réponses de terrain ou en ligne, synthèse.",
    sections: [
      {
        ancre: "questionnaires",
        titre: "Questionnaires et réponses",
        texte: ["Un questionnaire se compose de questions (note, recommandation, choix, oui/non, texte, nombre). Il se fige à la première réponse, pour que toutes les réponses se comparent. Les réponses se recueillent sur le terrain ou par un lien envoyé ; la synthèse se lit question par question."],
      },
    ],
    quiz: [],
  },

  // ---------------------------------------------------------------- biens
  {
    cle: "parc-auto",
    titre: "Parc auto",
    entree: "/parc-auto",
    resume: "Véhicules, carburant, coût au kilomètre, assurances et visites.",
    sections: [
      {
        ancre: "carburant",
        titre: "Carburant et échéances",
        texte: ["Chaque plein se saisit avec le compteur : la consommation se calcule entre deux pleins complets, et le coût au kilomètre en découle. Assurance, visite technique, vignette et patente s'annoncent avant leur échéance."],
      },
    ],
    quiz: [
      {
        cle: "parc-auto-plein",
        question: "Entre quoi se calcule la consommation d'un véhicule ?",
        choix: ["Entre deux pleins complets", "Entre deux visites techniques", "Sur le mois civil"],
        bonne: 0,
        explication: "Seuls deux pleins complets encadrent exactement le carburant consommé.",
      },
    ],
  },
  {
    cle: "parc-informatique",
    titre: "Parc informatique",
    entree: "/parc-informatique",
    resume: "Ordinateurs et équipements, utilisateurs, pannes, garanties et licences.",
    sections: [
      {
        ancre: "equipements",
        titre: "Équipements et licences",
        texte: ["Chaque équipement a sa fiche technique et son utilisateur. Les licences logicielles se comptent par poste : un dépassement ou une expiration proche se signale."],
      },
    ],
    quiz: [],
  },
  {
    cle: "materiels",
    titre: "Matériels",
    entree: "/actifs",
    resume: "Engins et matériels : interventions, compteurs, échéances, coût d'entretien.",
    sections: [
      {
        ancre: "fiches",
        titre: "Fiches, interventions et échéances",
        texte: ["Le coût d'entretien d'un matériel est la somme de ses interventions ; son compteur, le dernier relevé. Une échéance se déclenche à une date ou à un compteur, au premier atteint."],
      },
    ],
    quiz: [],
  },
  {
    cle: "moyens-generaux",
    titre: "Moyens généraux",
    entree: "/moyens-generaux",
    resume: "Fournitures de bureau et entretien des locaux.",
    sections: [
      {
        ancre: "fournitures",
        titre: "Fournitures",
        texte: ["Les fournitures entrent avec leur coût et se remettent à un salarié ou à un service ; le stock se déduit des mouvements et une alerte signale le seuil. L'entretien des locaux se suit comme celui d'un matériel : interventions et échéances."],
      },
    ],
    quiz: [],
  },

  // -------------------------------------------------------------- finance
  {
    cle: "comptabilite",
    titre: "Comptabilité",
    entree: "/comptabilite",
    resume: "SYSCOHADA : écritures, états financiers, TVA et clôture.",
    sections: [
      {
        ancre: "ecritures",
        titre: "Écritures",
        chemin: "/comptabilite/ecritures",
        texte: ["La plupart des écritures naissent seules : une facture, une paie, un règlement passent la leur. Une écriture saisie à la main doit être équilibrée — débit égal au crédit — sinon elle est refusée."],
      },
      {
        ancre: "fiscalite",
        titre: "Fiscalité",
        chemin: "/comptabilite/fiscalite",
        texte: ["La TVA du mois se lit dans les écritures, se déclare dans l'ordre des mois, puis se paie depuis la trésorerie ; un mois déclaré est verrouillé."],
      },
    ],
    quiz: [
      {
        cle: "compta-equilibre",
        question: "Une écriture saisie à la main n'est pas équilibrée. Que se passe-t-il ?",
        choix: ["Elle est enregistrée avec un avertissement", "Elle est refusée", "La différence va au compte d'attente"],
        bonne: 1,
        explication: "Toute écriture doit porter autant au débit qu'au crédit.",
      },
    ],
  },
  {
    cle: "tresorerie",
    titre: "Trésorerie",
    entree: "/tresorerie",
    resume: "Caisses, banques et mobile money : soldes, virements, charges et prévisions.",
    sections: [
      {
        ancre: "comptes",
        titre: "Comptes et mouvements",
        chemin: "/tresorerie",
        texte: ["Chaque caisse, banque ou portefeuille mobile money a son solde, lu dans les écritures. Un virement entre deux comptes se fait en deux temps : sortie, puis arrivée. Un relevé bancaire s'importe pour rapprocher."],
      },
      {
        ancre: "previsions",
        titre: "Charges et prévisions",
        chemin: "/tresorerie/previsions",
        texte: ["Les charges récurrentes (loyer, abonnements) se déclarent une fois ; le plan de trésorerie montre les treize semaines à venir."],
      },
    ],
    quiz: [],
  },
  {
    cle: "bons",
    titre: "Bons de caisse",
    entree: "/tresorerie/caisse",
    resume: "Demander de l'argent pour une dépense, le faire approuver, le justifier.",
    sections: [
      {
        ancre: "circuit",
        titre: "Le circuit d'un bon",
        texte: [
          "Un bon se demande avec son motif et son montant. Il s'approuve par une autre personne, puis se décaisse de la caisse choisie. Une avance au personnel se justifie ensuite, ou se rembourse.",
          "Chaque étape prévient la suivante dans la cloche : qui doit approuver, qui doit payer.",
        ],
        etapes: ["Demander un bon : motif, montant.", "Approbation par un responsable.", "Décaissement, puis justificatif."],
      },
    ],
    quiz: [
      {
        cle: "bons-approbation",
        question: "Qui approuve votre bon de caisse ?",
        choix: ["Vous-même", "Une autre personne, qui en a le droit", "Le caissier qui paie"],
        bonne: 1,
        explication: "Celui qui demande n'approuve pas : la règle vaut pour toutes les dépenses.",
      },
    ],
  },

  // ------------------------------------------------- documents et archives
  {
    cle: "documents",
    titre: "Fichiers et courriers",
    entree: "/documents",
    resume: "Pièces jointes aux fiches, échéances de validité, courriers et signatures.",
    sections: [
      {
        ancre: "documents",
        titre: "Documents",
        chemin: "/documents",
        texte: ["Un document se rattache à une fiche (salarié, véhicule, client…) et peut porter une date d'expiration : il s'annonce avant d'expirer. Les fichiers ne s'ouvrent que par un lien valable quelques minutes."],
      },
      {
        ancre: "courriers",
        titre: "Courriers et signatures",
        chemin: "/documents/courriers",
        texte: ["Un courrier officiel se rédige au papier à en-tête et s'imprime. Une demande de signature suit qui a signé et qui ne l'a pas encore fait."],
      },
    ],
    quiz: [],
  },
  {
    cle: "dossiers-archives",
    titre: "Dossiers d'archives",
    entree: "/archives/dossiers",
    resume: "Les dossiers d'archives partagés.",
    sections: [
      {
        ancre: "dossiers",
        titre: "Dossiers partagés",
        texte: ["Un dossier rassemble les archives d'un même sujet. Chaque dépôt est intègre (empreinte) et chaque ouverture est tracée au journal des accès."],
      },
    ],
    quiz: [],
  },

  // -------------------------------------------------------------- sécurité
  {
    cle: "cameras",
    titre: "Caméras",
    entree: "/securite",
    resume: "Le mur d'images des sites surveillés.",
    sections: [
      {
        ancre: "mur",
        titre: "Mur d'images",
        texte: ["Les caméras de chaque site s'affichent en direct. Chaque visionnage est autorisé par Maria Suite et inscrit au journal."],
      },
    ],
    quiz: [],
  },
  {
    cle: "visiteurs",
    titre: "Accueil des visiteurs",
    entree: "/visiteurs",
    resume: "Enregistrer arrivées et sorties, photographier la pièce d'identité, imprimer le badge.",
    sections: [
      {
        ancre: "arrivee",
        titre: "Enregistrer une arrivée",
        chemin: "/visiteurs",
        texte: [
          "Chaque point d'accueil — siège, chantier, site minier — tient son registre. « Enregistrer une arrivée » demande le nom, le motif, la personne visitée et la pièce d'identité ; la caméra de la tablette ou du poste photographie le recto et le verso, et le visiteur s'il le veut bien.",
          "La personne visitée est prévenue dans la cloche. Le badge s'imprime avec un QR : à la sortie, le scan du QR ouvre la fiche, et un bouton enregistre la sortie.",
        ],
        etapes: ["Enregistrer une arrivée : identité, motif, personne visitée.", "Photographier la pièce, recto et verso.", "Imprimer le badge, le remettre au visiteur.", "À la sortie : scanner le badge, « Sortie »."],
      },
      {
        ancre: "attendus",
        titre: "Les visiteurs attendus",
        texte: ["Un rendez-vous annoncé par un collègue apparaît dans « Attendus aujourd'hui ». Le visiteur présente le QR reçu par WhatsApp : son scan ouvre sa fiche, prête pour l'arrivée ; il ne reste qu'à relever sa pièce."],
      },
      {
        ancre: "presents",
        titre: "Présents et registre",
        chemin: "/visiteurs/presents",
        texte: [
          "« Présents » liste qui est sur place, accueil par accueil, avec une case à cocher : c'est la liste d'appel en cas d'évacuation, à imprimer d'un geste.",
          "Le registre se consulte par période et se fouille par nom, numéro ou pièce. Les photos des pièces s'effacent d'elles-mêmes trois mois après la visite (loi 2013-450) ; le registre reste.",
        ],
      },
    ],
    quiz: [
      {
        cle: "visiteurs-photos",
        question: "Combien de temps les photos de la pièce d'identité d'un visiteur sont-elles conservées ?",
        choix: ["Pour toujours", "Trois mois, puis elles s'effacent d'elles-mêmes", "Jusqu'à la sortie du visiteur"],
        bonne: 1,
        explication: "Données personnelles : les photos s'effacent trois mois après la visite ; le registre (nom, heures, motif) reste.",
      },
      {
        cle: "visiteurs-evacuation",
        question: "Une alarme incendie se déclenche. Où trouver la liste des visiteurs à faire sortir ?",
        choix: ["Dans le registre du mois", "Dans « Présents », imprimable", "Dans la messagerie"],
        bonne: 1,
        explication: "« Présents » donne, à l'instant, qui est sur place, accueil par accueil.",
      },
    ],
  },
  {
    cle: "mes-visiteurs",
    titre: "Annoncer un visiteur",
    entree: "/visiteurs/rendez-vous",
    resume: "Prévenir l'accueil d'un rendez-vous et envoyer au visiteur son QR d'entrée.",
    sections: [
      {
        ancre: "annoncer",
        titre: "Annoncer un rendez-vous",
        chemin: "/visiteurs/rendez-vous",
        texte: [
          "Vous attendez quelqu'un ? « Annoncer un visiteur » : le point d'accueil, le jour, l'heure, son nom et son téléphone. L'accueil le voit dans ses attendus du jour, et le visiteur reçoit par WhatsApp un lien vers son QR d'entrée.",
          "Quand il arrive, vous êtes prévenu dans la cloche. Un rendez-vous qui ne tient plus s'annule de la liste.",
        ],
      },
    ],
    quiz: [
      {
        cle: "mes-visiteurs-qr",
        question: "Comment votre visiteur reçoit-il son QR d'entrée ?",
        choix: ["Il le demande à l'accueil", "Par WhatsApp, quand vous annoncez le rendez-vous", "Par courrier"],
        bonne: 1,
        explication: "Annoncer le rendez-vous envoie au visiteur un lien vers son QR d'entrée.",
      },
    ],
  },
  {
    cle: "marches",
    titre: "Marchés et conventions",
    entree: "/marches",
    resume: "Appels d'offres, consultations de fournisseurs et conventions.",
    sections: [
      {
        ancre: "soumissions",
        titre: "Soumissions",
        chemin: "/marches",
        texte: ["Une soumission à un appel d'offres porte son dossier administratif à cocher et sa date limite, annoncée à l'avance."],
      },
      {
        ancre: "conventions",
        titre: "Consultations et conventions",
        chemin: "/marches/conventions",
        texte: ["Une consultation de fournisseurs note les offres sur le prix et la technique avant d'attribuer. Une convention suit son préavis, sa reconduction tacite, ses avenants et sa résiliation."],
      },
    ],
    quiz: [],
  },

  // ---------------------------------------------------- pilotage, admin
  {
    cle: "rapports",
    titre: "Rapports",
    entree: "/rapports",
    resume: "Chaque module en chiffres, imprimable et exportable vers Excel.",
    sections: [
      {
        ancre: "rapports",
        titre: "Lire et exporter",
        texte: ["Les rapports ne montrent que les modules qui vous sont ouverts. Chacun s'imprime ou s'exporte en CSV pour Excel."],
      },
    ],
    quiz: [],
  },
  {
    cle: "journal",
    titre: "Journal d'activité",
    entree: "/journal",
    resume: "Qui a fait quoi, et quand.",
    sections: [
      {
        ancre: "journal",
        titre: "La trace de chaque geste",
        texte: ["Connexions, émissions, approbations, modifications : chaque geste qui compte laisse une trace, avec son auteur, l'heure, l'adresse et l'appareil."],
      },
    ],
    quiz: [],
  },
  {
    cle: "utilisateurs",
    titre: "Utilisateurs, rôles et modules",
    entree: "/membres",
    resume: "Inviter, attribuer un rôle, composer un rôle, ouvrir ou couper un module.",
    sections: [
      {
        ancre: "inviter",
        titre: "Inviter un utilisateur",
        chemin: "/membres",
        texte: ["Seules les adresses @maria-groupe.com peuvent recevoir un compte. L'invité reçoit un mot de passe provisoire, à changer à sa première connexion, et le rôle qu'on lui attribue."],
      },
      {
        ancre: "roles",
        titre: "Rôles et modules",
        chemin: "/membres/roles",
        texte: [
          "Un rôle préréglé (gérant, comptable, secrétaire…) vient de Maria Suite ; un rôle composé choisit ses droits case par case. On n'accorde que les droits que l'on détient soi-même.",
          "L'onglet Modules ouvre ou coupe un module pour toute l'entreprise : coupé, il disparaît du menu et du guide.",
        ],
      },
    ],
    quiz: [
      {
        cle: "membres-adresse",
        question: "Quelles adresses peuvent recevoir un compte Maria Suite ?",
        choix: ["Toute adresse e-mail", "Les adresses @maria-groupe.com", "Les adresses Gmail des salariés"],
        bonne: 1,
        explication: "La plateforme n'admet que le domaine de l'entreprise (et l'adresse du super administrateur).",
      },
    ],
  },
  {
    cle: "entreprise",
    titre: "Entreprise",
    entree: "/entreprise",
    resume: "Les paramètres de l'entreprise.",
    sections: [
      {
        ancre: "parametres",
        titre: "Paramètres",
        texte: ["Raison sociale, identifiants fiscaux (NCC), adresse, logo et délai de verrouillage de l'écran (5, 10 ou 15 minutes) se règlent ici."],
      },
    ],
    quiz: [],
  },
];
