import type { Chapitre } from "./regles";

/** Équipe, ressources humaines, organisation du travail. */
export const CHAPITRES_EQUIPE: Chapitre[] = [
  {
    cle: "taches",
    titre: "Tâches",
    entree: "/taches",
    resume: "Ce qu'on vous confie, ce que vous confiez, et le compte rendu de ce qui est fait.",
    sections: [
      {
        ancre: "liste",
        titre: "Vos tâches",
        texte: [
          "La page Tâches range vos tâches en À faire, En cours, En retard et Terminées. Chaque tâche porte un numéro, une échéance et celui qui l'a confiée.",
          "Une tâche avance dans l'ordre : à faire, puis en cours, puis terminée. La terminer demande un compte rendu : ce qui a été fait, ce qui reste.",
        ],
        etapes: ["Ouvrez la tâche.", "Commencez-la quand vous vous y mettez.", "Terminez-la avec son compte rendu."],
        capture: {
          fichier: "taches",
          page: "/taches",
          alt: "La liste des tâches, rangée par état.",
          reperes: [
            { cible: "role=button[name=/Nouvelle tâche/i]", texte: "Créer une tâche pour vous, ou la confier à un collègue." },
            { cible: "text=En retard >> nth=0", texte: "Ce qui a dépassé son échéance." },
          ],
        },
      },
      {
        ancre: "confier",
        titre: "Confier une tâche",
        texte: [
          "« Nouvelle tâche » crée une tâche pour vous-même. Avec le droit d'attribuer, vous la confiez à un collègue : il en est prévenu dans la cloche, et vous suivez son avancement. Une réattribution ou une annulation reste tracée, avec son motif.",
        ],
      },
    ],
    quiz: [
      {
        cle: "taches-terminer",
        question: "Que faut-il pour terminer une tâche ?",
        choix: ["Rien, un clic suffit", "Un compte rendu de ce qui a été fait", "L'accord du gérant"],
        bonne: 1,
        explication: "Une tâche se termine avec son compte rendu : celui qui l'a confiée sait ce qui a été fait.",
      },
      {
        cle: "taches-attribuee",
        question: "Comment savez-vous qu'un collègue vous a confié une tâche ?",
        choix: ["Il faut consulter la liste chaque matin", "Une notification arrive dans la cloche", "Par e-mail uniquement"],
        bonne: 1,
        explication: "Toute tâche attribuée prévient son exécutant dans la cloche.",
      },
    ],
  },
  {
    cle: "planning",
    titre: "Planning",
    entree: "/planning",
    resume: "Dire où l'on est — au bureau, en mission, sur le terrain — et savoir qui est joignable.",
    sections: [
      {
        ancre: "mon-planning",
        titre: "Mon planning",
        chemin: "/planning",
        texte: [
          "Le calendrier du mois montre vos créneaux du 1er au dernier jour ; la vue semaine détaille les heures. Posez un statut pour maintenant (occupé, en mission, en courses, sur le terrain), ou choisissez « Du … au … » pour lui donner un début et une fin, sur plusieurs jours s'il le faut.",
          "Un arrêt maladie ou un congé de maternité se pose ainsi, pour six mois au plus ; les autres statuts, pour un mois. Un congé accordé dans Présences apparaît de lui-même.",
          "Les anniversaires des collègues y figurent aussi, d'une pastille 🎂.",
        ],
        capture: {
          fichier: "planning",
          page: "/planning",
          alt: "Le planning du mois, du premier au dernier jour.",
          reperes: [
            { cible: "role=link[name='Équipe'] >> nth=0", texte: "Qui est disponible dans l'équipe." },
            { cible: "role=link[name='Horaires habituels']", texte: "Vos horaires de chaque jour." },
          ],
        },
      },
      {
        ancre: "equipe",
        titre: "Le planning de l'équipe",
        chemin: "/planning/equipe",
        texte: ["L'onglet Équipe dit, à l'instant, qui est joignable, en dehors du bureau ou indisponible. L'accueil et le secrétariat s'en servent pour orienter un appel ; l'encadrement peut modifier le planning de chacun."],
      },
      {
        ancre: "horaires",
        titre: "Horaires habituels",
        chemin: "/planning/horaires",
        texte: ["Déclarez une fois vos horaires de chaque jour de la semaine : ils servent de référence à l'équipe et au calcul des retards."],
      },
    ],
    quiz: [
      {
        cle: "planning-mission",
        question: "Vous partez en mission pour l'après-midi. Que faites-vous dans Maria Suite ?",
        choix: ["Rien", "Je pose le statut « en mission » sur le créneau", "J'envoie un e-mail à toute l'équipe"],
        bonne: 1,
        explication: "Le statut dit à l'équipe et à l'accueil où vous êtes et si vous êtes joignable.",
      },
      {
        cle: "planning-mois",
        question: "Que montre la vue mois du planning ?",
        choix: ["Les quatre prochaines semaines à partir d'aujourd'hui", "Le mois entier, du 1er au dernier jour", "Seulement les jours ouvrés"],
        bonne: 1,
        explication: "La vue mois couvre le mois civil entier, du premier au dernier jour.",
      },
    ],
  },
  {
    cle: "presences",
    titre: "Présences et congés",
    entree: "/presences",
    resume: "Le pointage du jour, le registre, les demandes de congé et de permission, et les soldes.",
    sections: [
      {
        ancre: "aujourdhui",
        titre: "Aujourd'hui",
        chemin: "/presences",
        texte: ["Le pointage se pose tout seul à votre première activité du jour. L'écran Aujourd'hui montre qui est arrivé, à quelle heure, et les retards au regard des horaires attendus."],
      },
      {
        ancre: "conges",
        titre: "Demander un congé",
        chemin: "/presences/conges",
        texte: [
          "Une demande de congé porte ses dates, du premier au dernier jour inclus, et son motif. Elle reçoit un numéro ; celui qui accorde les congés l'accepte ou la refuse, et vous en êtes prévenu.",
          "Le décompte tient compte des jours fériés du pays. Un congé sans solde accordé est retenu sur la paie du mois.",
        ],
        etapes: ["Onglet Congés, nouvelle demande.", "Choisissez les dates et le motif.", "Attendez la décision dans la cloche."],
      },
      {
        ancre: "permissions",
        titre: "Demander une permission ou une absence",
        chemin: "/presences/permissions",
        texte: [
          "Une PERMISSION couvre quelques heures d'une journée : rendez-vous médical, démarche administrative. Vous indiquez le jour, l'heure de départ et l'heure de retour. Une ABSENCE couvre une ou plusieurs journées entières.",
          "Votre responsable accorde ou refuse, et dit comment ce temps est traité : payé, à récupérer, déduit de vos congés ou non payé. Déduite des congés, la permission est retirée de votre solde. Une permission oubliée se régularise dans les trente jours.",
        ],
        etapes: ["Onglet Permissions, « Demander une permission ».", "Choisissez permission ou absence, puis les heures ou les dates.", "Indiquez le motif, joignez un justificatif si vous l'avez.", "Attendez la décision dans la cloche."],
      },
      {
        ancre: "soldes",
        titre: "Les soldes",
        chemin: "/presences/soldes",
        texte: ["Chaque mois de service acquiert des jours de congé selon la règle du pays ; l'onglet Soldes montre l'acquis, le pris et le disponible, au centième de jour près."],
      },
    ],
    quiz: [
      {
        cle: "presences-sans-solde",
        question: "Un congé sans solde vous est accordé. Quel effet sur la paie ?",
        choix: ["Aucun", "Les jours sont retenus sur le salaire du mois", "Ils sont retirés du solde de congés payés"],
        bonne: 1,
        explication: "Le sans solde accordé est retenu au prorata des jours sur la paie du mois.",
      },
      {
        cle: "presences-feries",
        question: "Une demande de congé couvre un jour férié. Comment est-il compté ?",
        choix: ["Comme un jour de congé", "Il n'est pas décompté", "Il est compté double"],
        bonne: 1,
        explication: "Le décompte écarte les jours fériés du pays.",
      },
      {
        cle: "presences-permission",
        question: "Vous devez vous absenter de 10 h à 12 h pour un rendez-vous médical. Que demandez-vous ?",
        choix: ["Un congé payé d'une journée", "Une permission, avec l'heure de départ et l'heure de retour", "Rien, le pointage suffit"],
        bonne: 1,
        explication: "Quelques heures dans la journée, c'est une permission : elle porte l'heure de départ et l'heure de retour.",
      },
    ],
  },
  {
    cle: "messagerie",
    titre: "Messagerie",
    entree: "/messagerie",
    resume: "Discuter entre collègues, en privé ou en groupe, avec photos et fichiers.",
    sections: [
      {
        ancre: "discussions",
        titre: "Discussions et groupes",
        texte: [
          "La colonne de gauche liste vos discussions, la plus récente en tête ; un point signale ce qui n'est pas lu. « Nouvelle discussion » ouvre une conversation privée avec un collègue ; les groupes sont créés par l'administration.",
          "Joignez une photo ou un fichier par le trombone, ou glissez-le dans la discussion. Les coches disent si votre message a été lu.",
        ],
        capture: {
          fichier: "messagerie",
          page: "/messagerie",
          alt: "La messagerie : discussions à gauche, conversation à droite.",
          reperes: [{ cible: "role=button[name=/Nouvelle discussion/i] >> nth=0", texte: "Écrire à un collègue." }],
        },
      },
    ],
    quiz: [
      {
        cle: "messagerie-groupe",
        question: "Qui crée les groupes de discussion ?",
        choix: ["N'importe quel collègue", "L'administration", "Personne : ils sont créés par service automatiquement"],
        bonne: 1,
        explication: "Les discussions privées s'ouvrent librement ; les groupes, par l'administration.",
      },
    ],
  },
  {
    cle: "meeting",
    titre: "Meeting",
    entree: "/meeting",
    resume: "Réunions à distance : caméra, micro, partage d'écran, main levée et compte rendu.",
    sections: [
      {
        ancre: "reunions",
        titre: "Programmer ou ouvrir une réunion",
        texte: [
          "Une réunion se programme (titre, ordre du jour, heure, durée, invités) ou s'ouvre sur-le-champ. Les invités sont prévenus dans la cloche et retrouvent la réunion dans leur liste.",
          "L'organisateur peut désactiver le lien (plus personne n'entre), le réactiver, terminer la réunion pour tous ou la supprimer de la liste.",
        ],
        capture: {
          fichier: "meeting",
          page: "/meeting",
          alt: "La liste des réunions en cours, programmées et passées.",
          reperes: [{ cible: "main h1 >> nth=0", texte: "Vos réunions : en cours, programmées, passées." }],
        },
      },
      {
        ancre: "salle",
        titre: "Dans la salle",
        texte: [
          "Coupez ou ouvrez micro et caméra, partagez votre écran, levez la main, envoyez une réaction ou écrivez dans la discussion de la réunion. La salle ne se verrouille pas pendant que vous écoutez.",
          "La feuille de présence se tient seule : qui est venu, et combien de temps. L'organisateur rédige le compte rendu une fois la réunion terminée.",
        ],
      },
    ],
    quiz: [
      {
        cle: "meeting-lien",
        question: "L'organisateur désactive le lien d'une réunion. Que se passe-t-il ?",
        choix: ["La réunion est supprimée", "Plus personne n'entre, sauf lui ; ceux déjà présents restent", "Tout le monde est déconnecté"],
        bonne: 1,
        explication: "Désactiver le lien ferme l'entrée, pas la réunion en cours.",
      },
      {
        cle: "meeting-presence",
        question: "Comment la feuille de présence d'une réunion est-elle remplie ?",
        choix: ["L'organisateur coche les présents", "Elle se tient seule, au temps passé dans la salle", "Chacun signe à la fin"],
        bonne: 1,
        explication: "La salle signale la présence de chacun toutes les quelques secondes.",
      },
    ],
  },
  {
    cle: "boite-mail",
    titre: "Boîte mail",
    entree: "/boite-mail",
    resume: "Votre adresse @maria-groupe.com, lue et écrite sans quitter Maria Suite.",
    sections: [
      {
        ancre: "connexion",
        titre: "Brancher sa boîte",
        texte: ["La première fois, renseignez votre adresse et le mot de passe de votre boîte. Pour une adresse @maria-groupe.com, les serveurs se règlent d'eux-mêmes. Le mot de passe est chiffré ; vos messages restent chez le fournisseur de messagerie et se lisent en direct."],
      },
      {
        ancre: "messages",
        titre: "Lire, répondre, joindre",
        texte: [
          "Les messages se rangent par date ; un clic ouvre la lecture à droite. Répondez, répondez à tous ou transférez. Les pièces jointes se glissent dans le message, et une barre montre leur envoi.",
          "Par prudence, les images distantes d'un message ne s'affichent pas d'elles-mêmes.",
        ],
      },
    ],
    quiz: [
      {
        cle: "mail-images",
        question: "Pourquoi certaines images d'un e-mail ne s'affichent-elles pas ?",
        choix: ["La boîte est pleine", "Les images distantes sont bloquées par prudence", "Le message est corrompu"],
        bonne: 1,
        explication: "Une image distante peut signaler à l'expéditeur que vous avez ouvert le message : elle est bloquée d'office.",
      },
    ],
  },
  {
    cle: "messages-groupes",
    titre: "Messages groupés",
    entree: "/communication",
    resume: "Envois aux clients et au personnel, par e-mail et WhatsApp, tracés un par un.",
    sections: [
      {
        ancre: "envois",
        titre: "Envois et relances",
        chemin: "/communication",
        texte: ["Chaque pièce envoyée à un client (facture, devis, relance) l'est par un lien signé, et chaque envoi est tracé : à qui, par quel canal, quand."],
      },
      {
        ancre: "campagnes",
        titre: "Messages groupés",
        chemin: "/communication/campagnes",
        texte: ["Un message groupé part au personnel ou aux clients choisis. Un client qui se désinscrit ne reçoit plus de message groupé ; la liste des désinscriptions est tenue à part."],
      },
    ],
    quiz: [
      {
        cle: "comm-desinscription",
        question: "Un client s'est désinscrit. Que reçoit-il encore ?",
        choix: ["Tous les messages groupés", "Plus aucun message groupé", "Uniquement les messages WhatsApp"],
        bonne: 1,
        explication: "La désinscription arrête les messages groupés vers ce client.",
      },
    ],
  },
  {
    cle: "archives",
    titre: "Archives",
    entree: "/archives",
    resume: "Votre espace d'archivage personnel : intègre, tracé, consultable par l'administrateur légal.",
    sections: [
      {
        ancre: "deposer",
        titre: "Archiver un fichier",
        chemin: "/archives",
        texte: [
          "Déposez vos fichiers dans Mes archives (10 Mo par envoi). Chaque fichier reçoit une empreinte au dépôt : on peut prouver plus tard qu'il n'a pas changé.",
          "Retirer une archive la masque pendant 24 heures — le temps de revenir sur une erreur — puis la scelle : elle reste conservée, et l'administrateur légal peut toujours la consulter.",
        ],
      },
      {
        ancre: "dossiers",
        titre: "Dossiers partagés",
        chemin: "/archives/dossiers",
        texte: ["Un dossier partagé rassemble les archives d'un sujet commun à plusieurs personnes. Chaque ouverture est inscrite au journal des accès."],
      },
    ],
    quiz: [
      {
        cle: "archives-retrait",
        question: "Vous retirez une archive par erreur. Que se passe-t-il ?",
        choix: ["Elle est effacée sur-le-champ", "Elle est masquée 24 heures, puis scellée et conservée", "Elle passe dans la messagerie"],
        bonne: 1,
        explication: "Une archive ne disparaît jamais : retirée, elle est masquée puis scellée.",
      },
    ],
  },
  {
    cle: "anniversaires",
    titre: "Anniversaires",
    entree: "/anniversaires",
    resume: "Les anniversaires des collègues, du jour et à venir.",
    sections: [
      {
        ancre: "annonces",
        titre: "Être prévenu",
        texte: ["Chacun est prévenu dans la cloche dans la semaine qui précède l'anniversaire d'un collègue, puis le jour même ; la personne reçoit les vœux de l'entreprise. Pour ne pas annoncer le vôtre, demandez aux ressources humaines de décocher la case sur votre dossier."],
      },
    ],
    quiz: [
      {
        cle: "anniv-discret",
        question: "Vous ne souhaitez pas que votre anniversaire soit annoncé à l'équipe. Que faire ?",
        choix: ["Retirer sa date de naissance soi-même", "Demander aux RH de décocher l'annonce sur votre dossier", "Rien n'est possible"],
        bonne: 1,
        explication: "La case d'annonce se trouve sur l'état civil du dossier, tenu par les RH.",
      },
    ],
  },
  {
    cle: "personnel",
    titre: "Personnel",
    entree: "/rh",
    resume: "Salariés, dossiers, services et postes, paie.",
    sections: [
      {
        ancre: "salaries",
        titre: "Salariés et dossiers",
        chemin: "/rh",
        texte: [
          "La liste des salariés ouvre chaque dossier : état civil, contrat, poste et service, pièces jointes, paiement du salaire. L'embauche se saisit dans une grande fenêtre, étape par étape.",
          "Un salarié a un bulletin de paie ; un maçon payé à la journée n'en a pas : c'est un intervenant, tenu à part.",
        ],
        capture: {
          fichier: "personnel",
          page: "/rh",
          alt: "La liste des salariés.",
          reperes: [
            { cible: "role=link[name='Services']", texte: "Les services de l'entreprise." },
            { cible: "role=link[name='Paie']", texte: "La paie du mois." },
          ],
        },
      },
      {
        ancre: "services",
        titre: "Services et postes",
        chemin: "/rh/services",
        texte: ["Chaque poste se range dans un service (Direction générale, Ressources humaines, Travaux…). Changer le service d'un poste met à jour les fiches des salariés qui l'occupent."],
      },
      {
        ancre: "paie",
        titre: "La paie",
        chemin: "/rh/paie",
        texte: [
          "La paie du mois se prépare, se valide, puis se paie depuis la trésorerie. Un bulletin validé est numéroté et figé. Le bulletin tient compte des absences et des congés saisis dans Présences.",
          "Le barème (CNPS, ITS) est celui de l'entreprise en Côte d'Ivoire, à faire attester avant la première paie.",
        ],
      },
    ],
    quiz: [
      {
        cle: "rh-intervenant",
        question: "Un manœuvre payé à la journée sur un chantier, c'est :",
        choix: ["Un salarié avec un bulletin", "Un intervenant, payé par bon de paiement", "Un utilisateur du logiciel"],
        bonne: 1,
        explication: "Intervenants et salariés sont deux natures distinctes : l'intervenant est pointé et payé par bon.",
      },
      {
        cle: "rh-bulletin",
        question: "Peut-on modifier un bulletin de paie validé ?",
        choix: ["Oui, à tout moment", "Non : il est numéroté et figé ; on corrige le mois suivant", "Oui, avec le mot de passe du gérant"],
        bonne: 1,
        explication: "Un bulletin validé est figé ; un rappel ou une reprise se fait sur un bulletin suivant.",
      },
    ],
  },
  {
    cle: "intervenants",
    titre: "Intervenants et manœuvres",
    entree: "/rh/intervenants",
    resume: "Maçons, manœuvres, tâcherons : pointage, taux et bons de paiement.",
    sections: [
      {
        ancre: "pointage",
        titre: "Pointer et payer",
        texte: [
          "Un intervenant n'ouvre jamais le logiciel. On le pointe à la journée, à la tâche ou à l'unité d'œuvre, à son taux ; le bon de paiement additionne les pointages de la période.",
          "Le versement passe en comptabilité d'office (compte 637) et sort de la trésorerie choisie.",
        ],
      },
    ],
    quiz: [
      {
        cle: "intervenant-compte",
        question: "Un intervenant a-t-il un compte pour ouvrir Maria Suite ?",
        choix: ["Oui, comme tout le monde", "Non, il est pointé et payé, sans compte", "Seulement s'il est chef d'équipe"],
        bonne: 1,
        explication: "Un utilisateur n'est pas une personne : l'intervenant n'a ni compte ni bulletin.",
      },
    ],
  },
  {
    cle: "contrats",
    titre: "Contrats",
    entree: "/contrats",
    resume: "Contrats des salariés et des fournisseurs, avec leurs échéances.",
    sections: [
      {
        ancre: "contrats",
        titre: "Suivre les contrats",
        texte: ["Les contrats de travail et de fournisseurs se retrouvent ici, chacun avec sa pièce et ses dates. Une échéance proche se signale, pour renouveler ou résilier à temps."],
      },
    ],
    quiz: [],
  },
];
