import type { Chapitre } from "./regles";

/**
 * Chapitres de tous : ils sont au parcours de chaque nouveau venu, quel que
 * soit son rôle.
 */
export const CHAPITRES_TOUS: Chapitre[] = [
  {
    cle: "premiers-pas",
    titre: "Premiers pas",
    entree: null,
    resume: "Se connecter, retrouver ses modules, être prévenu, chercher, et protéger sa session.",
    sections: [
      {
        ancre: "connexion",
        titre: "Se connecter",
        texte: [
          "Maria Suite s'ouvre avec votre adresse professionnelle @maria-groupe.com et votre mot de passe. Le mot de passe reçu à l'invitation est provisoire : le logiciel demande de le remplacer à la première connexion.",
          "Mot de passe oublié ? Le lien « Mot de passe oublié » de l'écran de connexion envoie un code à votre adresse.",
        ],
      },
      {
        ancre: "accueil",
        titre: "L'accueil et le menu",
        chemin: "/accueil",
        texte: [
          "Après la connexion, l'accueil présente une tuile par module que votre rôle vous ouvre, rangées comme dans le menu. Ce que vous ne voyez pas ne vous est pas ouvert : adressez-vous à l'administrateur si un module vous manque.",
          "Dans un module, le menu de gauche reste à l'écran ; le logo en haut ramène à l'accueil. Sur téléphone, le menu s'ouvre par le bouton ☰.",
        ],
        capture: {
          fichier: "accueil",
          page: "/accueil",
          alt: "L'écran d'accueil de Maria Suite, avec une tuile par module.",
          reperes: [
            { cible: "main ul > li:nth-child(1) a > span:first-child", texte: "Le tableau de bord ouvre toujours la grille." },
            { cible: "main ul > li:nth-child(5) a > span:first-child", texte: "Une tuile par module ouvert à votre rôle." },
            { cible: "button[aria-label*='otification' i]", texte: "La cloche : vos notifications." },
          ],
        },
      },
      {
        ancre: "cloche",
        titre: "La cloche et la recherche",
        texte: [
          "La cloche, en haut à droite, rassemble ce qui vous concerne : une tâche attribuée, un bon à approuver, une réunion, un anniversaire, une nouvelle version du règlement. Un clic sur une notification ouvre l'écran concerné.",
          "La barre de recherche (Ctrl K) trouve un client, une facture, un salarié ou un module sans passer par le menu.",
        ],
      },
      {
        ancre: "verrou",
        titre: "Verrouillage et déconnexion",
        texte: [
          "Sans activité pendant quelques minutes (15 par défaut), l'écran se voile : votre mot de passe le rouvre, et la saisie en cours est conservée. Après 30 minutes sans activité, la session se ferme.",
          "Vous quittez votre poste ? Verrouillez l'écran ou déconnectez-vous depuis le menu de votre compte, en haut à droite.",
        ],
      },
      {
        ancre: "presence",
        titre: "Votre présence est pointée",
        texte: [
          "Ouvrir Maria Suite dans la journée vous pointe présent : la première activité pose l'heure d'arrivée, les suivantes la dernière activité. Il n'y a rien d'autre à faire.",
        ],
      },
    ],
    quiz: [
      {
        cle: "pp-verrou",
        question: "Votre écran s'est voilé pendant que vous rédigiez une facture. Que se passe-t-il ?",
        choix: ["La facture est perdue, il faut tout ressaisir", "Votre mot de passe rouvre l'écran et la saisie est conservée", "Il faut redemander un compte à l'administrateur"],
        bonne: 1,
        explication: "Le voile protège la session après quelques minutes sans activité ; la page reste ouverte dessous.",
      },
      {
        cle: "pp-module-absent",
        question: "Un module dont vous avez besoin n'apparaît pas à l'accueil. Que faire ?",
        choix: ["Le chercher dans la barre de recherche", "Demander à l'administrateur de vous l'ouvrir", "Se reconnecter"],
        bonne: 1,
        explication: "L'accueil ne montre que les modules ouverts à votre rôle : c'est l'administrateur qui les attribue.",
      },
      {
        cle: "pp-pointage",
        question: "Comment votre présence du jour est-elle enregistrée ?",
        choix: ["Je dois pointer à la main chaque matin", "Ma première activité dans Maria Suite la pose d'elle-même", "Le responsable la saisit le soir"],
        bonne: 1,
        explication: "Le pointage est automatique : la première activité du jour pose l'arrivée.",
      },
    ],
  },
  {
    cle: "reglement-interieur",
    titre: "Règlement intérieur",
    entree: null,
    resume: "Le lire, l'accepter, le relire à tout moment.",
    sections: [
      {
        ancre: "accepter",
        titre: "L'accepter à chaque nouvelle version",
        chemin: "/reglement",
        texte: [
          "À votre première connexion, puis à chaque nouvelle version publiée par les ressources humaines, Maria Suite ouvre d'abord le règlement intérieur. La case « J'ai lu et j'accepte » se coche une fois le texte parcouru jusqu'au dernier article ; votre acceptation est enregistrée avec la date et l'heure.",
          "Une version publiée à l'avance peut se lire et s'accepter avant sa date d'effet : vous n'aurez pas à le faire le jour venu.",
        ],
      },
      {
        ancre: "relire",
        titre: "Le relire",
        texte: ["Le règlement se relit à tout moment dans le menu Équipe › Règlement intérieur, avec son sommaire et ses versions précédentes. Il s'imprime ou s'enregistre en PDF."],
      },
    ],
    quiz: [
      {
        cle: "ri-nouvelle-version",
        question: "Les RH publient une nouvelle version du règlement intérieur. Que se passe-t-il pour vous ?",
        choix: ["Rien, l'ancienne acceptation suffit", "À sa date d'effet, il faut la lire et l'accepter avant d'utiliser le logiciel", "Il faut signer un papier aux RH"],
        bonne: 1,
        explication: "Chaque version s'accepte une fois : l'acceptation d'une version ne vaut pas pour la suivante.",
      },
    ],
  },
];
