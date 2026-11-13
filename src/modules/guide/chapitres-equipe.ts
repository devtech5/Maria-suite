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
        ancre: "vues",
        titre: "Six façons de voir vos tâches",
        texte: [
          "Les boutons au-dessus de la liste changent l'affichage des mêmes tâches. Tableur : un tableau rangé par état, échéance, responsable ou priorité, où chaque cellule se change d'un clic (état, priorité, dates, responsable). Fiches : une galerie de cartes. Calendrier : chaque tâche à son échéance ; glissez-la sur un autre jour pour la reporter. Kanban : une colonne par état ; glissez une carte pour la commencer, la terminer ou la rouvrir. Gantt : la durée de chaque tâche, du début prévu à l'échéance. Échéancier : la charge de chacun dans le temps.",
          "Le titre d'une tâche ouvre sa fiche : tout son historique, ses gestes et le formulaire pour la modifier. « + Ajouter une tâche » en crée une d'un mot, pour vous ; le reste se règle ensuite dans les cellules.",
        ],
      },
      {
        ancre: "colonnes",
        titre: "Colonnes personnalisées",
        texte: [
          "Le « + » au bout du tableau (ou « + Colonne ») ajoute une colonne commune à toute l'équipe : Texte, Nombre entier avec son unité (additionné au pied de chaque groupe), Date, Étiquettes de couleur, Case à cocher ou Lien. Le menu de son en-tête la renomme, règle ses étiquettes, la déplace ou la retire. Composer les colonnes demande le droit d'attribuer les tâches.",
          "L'exécutant, le créateur et qui attribue remplissent les cellules d'un clic. Les colonnes apparaissent aussi sur les fiches, le Kanban et la fiche de chaque tâche, et la recherche les lit.",
        ],
      },
      {
        ancre: "panneau",
        titre: "Ouvrir une tâche : mises à jour, sous-tâches, fichiers",
        texte: [
          "Le titre d'une tâche ouvre son panneau, à droite du tableau qui reste visible. « Mises à jour » est le fil de l'équipe : la barre d'outils met en gras, en italique, souligne, barre, fait des listes, une check-list dont chacun coche les cases, un lien ou un filet ; @ mentionne un collaborateur, qui est prévenu, et le trombone joint un fichier. Le responsable, les intervenants et le créateur sont prévenus de chaque mise à jour.",
          "« Sous-tâches » découpe la tâche en étapes précises : chacune se coche, reçoit son responsable et son échéance. La flèche devant le titre, dans le tableur, les déplie sous la tâche, et l'avancement s'affiche à côté. « Fichiers » garde les pièces jointes (10 Mo au plus), « Activités » tout ce qui s'est passé, et « Détails » la fiche complète.",
        ],
        etapes: ["Cliquez le titre de la tâche.", "Écrivez une mise à jour, ou ajoutez des sous-tâches.", "Cochez chaque étape quand elle est faite."],
      },
      {
        ancre: "intervenants",
        titre: "Plusieurs intervenants sur une tâche",
        texte: [
          "Le responsable fait avancer la tâche ; les intervenants y travaillent avec lui. Cochez-les à la création, ou dans la colonne « Intervenants » : collaborateurs du Personnel comme intervenants (maçon, manœuvre, chauffeur occasionnel). Un collaborateur qui a un compte en est prévenu dans la cloche, retrouve la tâche dans « Mes tâches » et peut en remplir les colonnes.",
        ],
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
      {
        cle: "taches-kanban",
        question: "Dans la vue Kanban, comment commencer une tâche ?",
        choix: ["En la supprimant puis en la recréant", "En glissant sa carte dans la colonne « En cours »", "Le Kanban ne sert qu'à regarder"],
        bonne: 1,
        explication: "Glisser une carte d'une colonne à l'autre fait le geste : commencer, terminer avec un compte rendu, annuler avec un motif, rouvrir.",
      },
      {
        cle: "taches-colonne-nombre",
        question: "Dans une colonne « Nombre », que fait la saisie « 2,5 » ?",
        choix: ["Elle est arrondie à 3", "Elle est refusée : un nombre entier, sans virgule", "Elle est enregistrée telle quelle"],
        bonne: 1,
        explication: "Comme tout montant de Maria Suite, un nombre est entier : la somme au pied du groupe reste exacte.",
      },
      {
        cle: "taches-sous-taches",
        question: "Comment découper une tâche en étapes précises ?",
        choix: ["En créant une tâche par étape", "Avec les sous-tâches de son panneau, qui se cochent une à une", "En l'écrivant dans le titre"],
        bonne: 1,
        explication: "Les sous-tâches se cochent quand elles sont faites ; l'avancement se lit dans le tableur.",
      },
    ],
  },
  {
    cle: "pv",
    titre: "Procès-verbaux",
    entree: "/pv",
    resume: "PV de réunion, comptes rendus et rapports : rédigés, validés par la direction, diffusés avec accusé de lecture.",
    sections: [
      {
        ancre: "rediger",
        titre: "Rédiger un procès-verbal",
        chemin: "/pv",
        texte: [
          "« Nouveau procès-verbal » ouvre un brouillon : PV de réunion, compte rendu ou rapport. Tiré d'une réunion Meeting (ou du lien « Rédiger le procès-verbal » sur la réunion), il en reprend l'objet, les présents et les absents, et le compte rendu déjà écrit.",
          "Le brouillon se remplit par parties : participants (présents, excusés, absents, personnes extérieures), points traités avec leurs décisions, actions à mener (qui, quoi, pour quand), conclusion, et diffusion. « Voir la feuille » montre le PV tel qu'il s'imprimera, sur le papier à en-tête.",
        ],
        etapes: ["Ouvrez un brouillon.", "Rédigez les points, les décisions et les actions.", "Choisissez à qui le diffuser.", "Soumettez-le à la direction."],
      },
      {
        ancre: "valider",
        titre: "Validation et diffusion",
        texte: [
          "La direction relit le PV soumis : elle le renvoie avec une remarque, ou le publie. La publication lui donne son numéro (PV-2026-00012), fige son texte et le diffuse — à tout le personnel, à des services ou à des personnes. Chacun en est prévenu dans la cloche.",
          "Si l'accusé de lecture est demandé, chaque destinataire confirme « J'ai pris connaissance » ; le rédacteur et la direction voient qui l'a fait et peuvent relancer. Chaque action décidée devient une tâche d'un clic, confiée à son responsable. Pour corriger un PV publié, on en publie une nouvelle version, sous le même numéro.",
        ],
      },
    ],
    quiz: [
      {
        cle: "pv-publication",
        question: "Qui publie un procès-verbal et le diffuse au personnel ?",
        choix: ["Son rédacteur, dès qu'il a fini", "La direction, après relecture", "Personne : il part automatiquement"],
        bonne: 1,
        explication: "Le rédacteur soumet son brouillon ; la direction le renvoie avec une remarque ou le publie, ce qui le numérote, le fige et le diffuse.",
      },
      {
        cle: "pv-correction",
        question: "Un PV publié contient une erreur. Que faire ?",
        choix: ["Modifier le texte directement", "Le supprimer et en refaire un", "Publier une nouvelle version, sous le même numéro"],
        bonne: 2,
        explication: "Le texte publié est celui que chacun a lu : il ne se réécrit pas. « Corriger : nouvelle version » ouvre une version 2, qui remplace la première à sa publication.",
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
    cle: "terrain",
    titre: "Mon terrain",
    entree: "/terrain",
    resume: "Relever sur place ce qui est constaté, avec photo et position GPS, pour le superviseur et le chef de projet.",
    sections: [
      {
        ancre: "equipe",
        titre: "Confier un projet à une équipe",
        texte: [
          "Le chef de projet — le responsable du projet — ouvre la fiche du projet et choisit « Confier du personnel » : une personne INTERNE, prise dans la liste complète du personnel, ou EXTERNE, enregistrée sur place (nom, téléphone, structure). Il lui donne un rôle : agent, ou superviseur. Il n'y a qu'un superviseur par projet ; en nommer un autre fait passer l'ancien agent.",
          "Le superviseur a un compte pour examiner les relevés. Un externe n'en a pas : un agent relève à sa place, et le relevé garde les deux noms.",
        ],
      },
      {
        ancre: "releve",
        titre: "Faire un relevé",
        chemin: "/terrain",
        texte: [
          "« Mon terrain » liste les projets où vous êtes en poste. Sur un projet, « Nouveau relevé » : un titre, ce qui a été constaté ou fait, l'avancement, puis les PREUVES — une ou deux photos prises par la caméra, des captures d'écran — et la position GPS relevée par l'appareil.",
          "Sans position GPS ni photo, le relevé est refusé : c'est ce qui le rend traçable. Le superviseur et le chef de projet sont prévenus dans la cloche ; vous suivez l'état de vos relevés : à examiner, validé, ou à refaire avec le motif.",
        ],
        etapes: ["Ouvrir le projet dans « Mon terrain ».", "Nouveau relevé : titre, constat, avancement.", "Relever la position, prendre la photo.", "Enregistrer : le superviseur est prévenu."],
      },
      {
        ancre: "examen",
        titre: "Examiner les relevés",
        texte: ["Le superviseur et le chef de projet voient les relevés de toute l'équipe, avec leurs photos et leur position sur la carte. « Valider » clôt le relevé ; « À refaire » le renvoie à son auteur, avec un commentaire obligatoire."],
      },
    ],
    quiz: [
      {
        cle: "terrain-preuves",
        question: "Que faut-il pour qu'un relevé de terrain soit accepté ?",
        choix: ["Un titre suffit", "Une position GPS relevée par l'appareil et au moins une photo ou capture", "La signature du chef de projet"],
        bonne: 1,
        explication: "Position GPS et preuve photo sont exigées : sans elles, le relevé ne serait pas traçable.",
      },
      {
        cle: "terrain-externe",
        question: "Un sous-traitant externe n'a pas de compte. Comment ses relevés arrivent-ils ?",
        choix: ["Il ne peut pas en faire", "Un agent du projet relève à sa place, et les deux noms sont gardés", "Le chef de projet les ressaisit à la fin"],
        bonne: 1,
        explication: "L'auteur du relevé est l'externe ; le compte qui l'a saisi est conservé pour la traçabilité.",
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
    cle: "contacts",
    titre: "Contacts",
    entree: "/contacts",
    resume: "L'annuaire de l'entreprise : qui est qui, ses adresses e-mail professionnelles et ses numéros.",
    sections: [
      {
        ancre: "annuaire",
        titre: "Chercher un collègue",
        chemin: "/contacts",
        texte: [
          "L'annuaire liste le personnel avec son service, son poste, ses adresses e-mail professionnelles et ses numéros de téléphone. La recherche accepte un nom, un service, une adresse ou un bout de numéro ; le filtre par service restreint la liste à une équipe. « Exporter en Excel » télécharge la liste affichée, recherche et filtre compris ; « Imprimer (PDF) » la met sur le papier à en-tête de l'entreprise, rangée par service, à imprimer ou à enregistrer en PDF. « Carte de visite », sur chaque ligne, imprime la carte du collaborateur au format 85 × 55 mm, recto et verso : ses coordonnées professionnelles seulement, et au dos un QR qui l'ajoute aux contacts d'un téléphone.",
          "Chacun lit les adresses et les numéros professionnels. Les numéros personnels et l'adresse e-mail personnelle d'un collaborateur ne s'affichent que pour ceux qui tiennent l'annuaire : ce sont des données personnelles.",
        ],
      },
      {
        ancre: "adresses",
        titre: "Les adresses e-mail professionnelles",
        chemin: "/contacts/adresses",
        texte: [
          "Qui tient l'annuaire liste ici les adresses de l'entreprise (celles du domaine maria-groupe.com, aucune autre). Chaque adresse s'affecte en deux temps : d'abord à un service, puis, si elle est nominative, à une personne de ce service. Une adresse commune, comme celle d'un service, reste au service.",
          "Si un collaborateur change de service, ses adresses passent « à revoir » : affectez-les de nouveau. « Reprendre les fiches » inscrit d'un coup les adresses déjà saisies sur les dossiers du personnel.",
        ],
        etapes: ["Ajoutez l'adresse avec « Nouvelle adresse ».", "Choisissez son service.", "Choisissez, si besoin, la personne de ce service qui la détient."],
      },
    ],
    quiz: [
      {
        cle: "contacts-affectation",
        question: "Dans quel ordre affecte-t-on une adresse e-mail professionnelle ?",
        choix: ["À la personne, puis à son service", "Au service, puis à une personne de ce service", "Elle n'est jamais affectée"],
        bonne: 1,
        explication: "On choisit le service d'abord ; la personne se choisit ensuite parmi le personnel de ce service.",
      },
      {
        cle: "contacts-personnels",
        question: "Qui voit les numéros de téléphone et l'e-mail personnels des collaborateurs ?",
        choix: ["Tout le monde", "Seulement ceux qui tiennent l'annuaire", "Personne, même pas les RH"],
        bonne: 1,
        explication: "Un numéro personnel est une donnée personnelle : il ne s'affiche qu'avec le droit de tenir l'annuaire.",
      },
    ],
  },
  {
    cle: "personnel",
    titre: "Personnel",
    entree: "/rh",
    resume: "Collaborateurs, dossiers, services et postes, paie.",
    sections: [
      {
        ancre: "salaries",
        titre: "Collaborateurs et dossiers",
        chemin: "/rh",
        texte: [
          "La liste des collaborateurs ouvre chaque dossier : état civil, contrat, poste et service, pièces jointes, paiement du salaire. L'embauche se saisit dans une grande fenêtre, étape par étape.",
          "Un collaborateur a un bulletin de paie ; un maçon payé à la journée n'en a pas : c'est un intervenant, tenu à part.",
        ],
        capture: {
          fichier: "personnel",
          page: "/rh",
          alt: "La liste des collaborateurs.",
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
        texte: ["Chaque poste se range dans un service (Direction générale, Ressources humaines, Travaux…). Changer le service d'un poste met à jour les fiches des collaborateurs qui l'occupent."],
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
        choix: ["Un collaborateur avec un bulletin", "Un intervenant, payé par bon de paiement", "Un utilisateur du logiciel"],
        bonne: 1,
        explication: "Intervenants et collaborateurs sont deux natures distinctes : l'intervenant est pointé et payé par bon.",
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
    resume: "Contrats des collaborateurs et des fournisseurs, avec leurs échéances.",
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
