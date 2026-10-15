/**
 * Registre des modules de Maria Suite.
 *
 * Les modules du périmètre ne sont pas autant de développements. Ils se
 * répartissent en trois couches :
 *
 *   · socle    — commun à tout métier, toujours présent
 *   · moteur   — construit une fois, servi à plusieurs métiers
 *   · metier   — préréglage posé sur un socle et des moteurs : écrans,
 *                catalogue de départ, comptes pré-affectés. Pas de code neuf.
 *
 * `key` est la valeur stockée dans `organization_modules.module_key` : ce qui y
 * est activé est ce que l'entreprise voit.
 */

export type ModuleLayer = "socle" | "moteur" | "metier";

/**
 * Avancement du module, et il commande ce que l'application montre.
 *
 *   · planifie   — les écrans existent, mais ils lisent `src/lib/fixtures`.
 *                  Des chiffres inventés dans une interface finie.
 *   · en_cours   — les écrans lisent la base. Il manque des fonctions, pas des
 *                  données.
 *   · disponible — le périmètre annoncé est couvert.
 *
 * La frontière qui compte n'est pas entre `en_cours` et `disponible` : c'est
 * entre `planifie` et le reste. Montrer à un commerçant un stock qui n'est pas
 * le sien lui coûte sa confiance en une minute, et elle ne revient pas.
 */
export type ModuleStatus = "planifie" | "en_cours" | "disponible";

export interface ModuleDefinition {
  key: string;
  name: string;
  layer: ModuleLayer;
  status: ModuleStatus;
  /** Modules dont celui-ci a besoin pour fonctionner. */
  requires: string[];
  description: string;
}

export const MODULES: ModuleDefinition[] = [
  // ---------------------------------------------------------------- socle
  {
    key: "tiers",
    name: "Tiers & Commercial",
    layer: "socle",
    // Fichier tiers en base, avec contacts, comptes auxiliaires et soldes
    // déduits des écritures. Devis, factures, avoirs et règlements en base :
    // l'émission numérote, sort le stock et passe l'écriture dans une
    // transaction. Commerciaux et commissions à paliers. Les achats
    // fournisseurs ont leur module. Reste l'avoir partiel : une facture ne
    // s'annule aujourd'hui que par un avoir total.
    status: "en_cours",
    requires: [],
    description:
      "Clients, fournisseurs, devis, factures, achats, encours. Absorbe le CRM.",
  },
  {
    key: "stock",
    name: "Catalogue & Stock",
    layer: "socle",
    // En base : articles, familles, unités, modèles et variantes, codes
    // scannables, dépôts, mouvements typés dont l'ajustement d'inventaire,
    // valorisation au coût moyen pondéré, réapprovisionnement. Restent
    // l'inventaire tournant, les lots et les dates de péremption.
    status: "en_cours",
    requires: [],
    description:
      "Articles, dépôts, mouvements typés, inventaires, valorisation, lots.",
  },
  {
    key: "pos",
    name: "Ventes & Encaissement",
    layer: "socle",
    // En base : postes de caisse, tickets, lignes avec prestation rattachée,
    // règlements multiples. Un encaissement sort son stock et pose son écriture
    // dans la même transaction, et la file locale encaisse sans réseau.
    // Session de caisse : ouverture avec fond, comptage par moyen de paiement,
    // écart passé en écriture. Un ticket s'annule par un avoir qui remet le
    // stock et contrepasse l'écriture. Reste le retour partiel d'un ticket.
    status: "en_cours",
    requires: ["stock"],
    description:
      "Caisse : sessions, caissiers, paiements, tickets. Fonctionne hors connexion.",
  },
  {
    key: "comptabilite",
    name: "Comptabilité",
    layer: "socle",
    // En base : plan de comptes SYSCOHADA, journaux, écritures équilibrées et
    // états financiers déduits du grand livre. Fiscalité : TVA mensuelle lue
    // dans les écritures, déclarée dans l'ordre (liquidation 4441/4449, mois
    // verrouillé), payée depuis la trésorerie ; clôture d'exercice (131/139),
    // exercice fermé aux écritures. Restent les à-nouveaux, la réouverture
    // d'un exercice, la DSF et les acomptes d'impôt sur les bénéfices.
    status: "en_cours",
    requires: ["tiers"],
    description:
      "SYSCOHADA, journaux, états financiers, fiscalité. Consomme les écritures des autres modules.",
  },
  {
    key: "personnes",
    name: "Personnes & Rémunération",
    layer: "socle",
    // En base : salariés et contrats, intervenants, pointages et bons de
    // paiement — le versement à un intervenant pose son écriture en 637.
    // Dossier du salarié avec ses pièces. Paie émise : barème par entreprise
    // attesté vérifié, bulletins numérotés et figés, écriture de paie,
    // salaires payés depuis la trésorerie, versements CNPS et impôt, état
    // mensuel des cotisations. Le bulletin se cale sur Présences : entrée ou
    // sortie dans le mois, congé sans solde et absences saisies retenus au
    // prorata des jours, congés payés pris et solde imprimés. Restent
    // l'allocation de congés payés, la DISA annuelle et les rappels de
    // salaire.
    status: "en_cours",
    requires: [],
    description:
      "Deux régimes : salariés (contrat, bulletin, CNPS, ITS) et intervenants " +
      "(maçon, manœuvre, tâcheron, extra) payés à la journée, à la tâche ou à l'unité d'œuvre.",
  },
  {
    key: "documents",
    name: "Documents & Signature",
    layer: "socle",
    // En base : bibliothèque, rattachement polymorphe, échéances de validité,
    // demandes de signature et signataires. Le fichier vit dans un dépôt privé,
    // lu par URL signée. Le module SUIT une signature, il ne la CERTIFIE pas :
    // restent la page publique de signature pour les tiers extérieurs, le code
    // à six chiffres réellement transmis, et tout ce qui ferait une signature
    // qualifiée au sens réglementaire.
    status: "en_cours",
    requires: [],
    description:
      "Pièces rattachées aux entités métier, permissions, signature électronique.",
  },

  {
    key: "archives",
    name: "Archives numériques",
    layer: "socle",
    // En base : espace d'archivage par personne, empreinte SHA-256 au dépôt,
    // retrait masquant pendant 24 h puis scellement, supervision par
    // l'administrateur légal avec vérification d'intégrité et journal des
    // accès. Restent la durée de conservation légale par nature de pièce et
    // l'export horodaté d'un dossier complet.
    status: "en_cours",
    requires: [],
    description:
      "Espace d'archivage de chaque utilisateur, intègre et tracé, consultable par l'administrateur légal.",
  },

  {
    key: "presences",
    name: "Présences et congés",
    layer: "socle",
    // En base : pointage automatique à la première activité du jour (compte
    // et fiche salarié), pointage et correction à la main, horaires et
    // retards, jours fériés du pays, demandes de congé numérotées et
    // décidées, soldes en centièmes de jour avec reprise et majorations.
    // Le sans solde accordé est retenu sur la paie du mois. Reste le badge QR.
    status: "en_cours",
    requires: ["personnes"],
    description: "Pointage automatique à la connexion, registre des présences, retards, congés et soldes.",
  },

  {
    key: "taches",
    name: "Tâches",
    layer: "socle",
    // En base : tâches numérotées, créées pour soi ou attribuées, exécutées
    // à faire → en cours → terminée avec compte rendu, annulation motivée,
    // réattribution journalisée. Restent les tâches récurrentes, les
    // sous-tâches et le rattachement à un projet ou à un client.
    status: "en_cours",
    requires: [],
    description: "Liste de tâches de chacun, attribution à un membre, exécution suivie et tracée.",
  },

  {
    key: "planning",
    name: "Planning",
    layer: "socle",
    // En base : horaires habituels par jour, créneaux de statut (occupé, en
    // mission, en courses, sur le terrain…) sans chevauchement, statut posé
    // « maintenant » pour une durée, vue de l'équipe et gestion par
    // l'encadrement. Restent les créneaux récurrents et le statut affiché
    // dans la messagerie.
    status: "en_cours",
    requires: [],
    description: "Disponibilités et statut de chacun — occupé, en mission, en courses, sur le terrain — et vue de l'équipe.",
  },

  {
    key: "achats",
    name: "Achats & Fournisseurs",
    layer: "socle",
    // En base : bons de commande, réceptions qui font entrer le stock au prix
    // commandé, factures fournisseurs comptabilisées (6xx/4451/401) avec
    // contrôle face à la réception, règlements depuis la trésorerie et
    // lettrage du 401, réassort préparé en brouillon. Restent l'avoir
    // fournisseur et le retour de marchandise.
    status: "en_cours",
    requires: ["tiers", "stock", "comptabilite", "tresorerie"],
    description: "Commandes fournisseurs, réceptions, factures d'achat, dettes et règlements.",
  },
  {
    key: "tresorerie",
    name: "Trésorerie",
    layer: "socle",
    // En base : caisses, banques et portefeuilles adossés à un compte de
    // classe 5, soldes lus dans les écritures ; virements internes en deux
    // temps par le 585 ; bons de caisse approuvés puis décaissés ; avances au
    // personnel (4251) justifiées ou remboursées ; arrêtés de caisse ;
    // mouvements libres (apport, emprunt, virement sans facture) ; charges
    // lues dans la classe 6, charges récurrentes ; rapprochement bancaire par
    // import CSV ; plan de trésorerie à 13 semaines. Restent l'import OFX et
    // les relevés mobile money.
    status: "en_cours",
    requires: ["comptabilite"],
    description: "Caisses, banques, mobile money, virements internes, petite caisse, avances, rapprochement bancaire, prévisions.",
  },

  {
    key: "communication",
    name: "Communication",
    layer: "socle",
    // En base : notifications internes (cloche), envois e-mail et WhatsApp
    // tracés un par un, pièces envoyées aux clients par lien signé, relances,
    // désinscriptions, messages groupés au personnel et aux clients.
    status: "en_cours",
    requires: [],
    description: "Notifications internes, envois aux clients par e-mail et WhatsApp, relances, messages groupés.",
  },
  {
    key: "messagerie",
    name: "Messagerie interne",
    layer: "socle",
    // En base : conversations privées et groupes, messages, pièces jointes,
    // accusés de lecture. Le rafraîchissement se fait par interrogation
    // régulière, pas de LISTEN/NOTIFY derrière le pooler en mode transaction.
    status: "en_cours",
    requires: [],
    description: "Discussions privées entre utilisateurs et groupes créés par l'administration.",
  },

  {
    key: "meeting",
    name: "Meeting",
    layer: "socle",
    // En base : réunions numérotées, programmées ou ouvertes sur-le-champ,
    // invités, feuille de présence au signal près, compte rendu. Images et
    // son en WebRTC par le serveur vidéo du module Sécurité (chacun publie un
    // flux en WHIP, lit les autres en WHEP), chaque flux autorisé par Maria
    // Suite. Restent l'enregistrement, la discussion écrite dans la salle et
    // la réunion récurrente.
    status: "en_cours",
    requires: [],
    description: "Réunions d'équipe à distance : caméra, micro, partage d'écran, présence et compte rendu.",
  },

  {
    key: "prestataires",
    name: "Prestataires externes",
    layer: "socle",
    // En base : annuaire des indépendants (métiers, zone, tarif, déclaré ou
    // non) adossé à une fiche tiers, prestations de la demande au paiement,
    // avis et note moyenne, paiement comptabilisé avec retenue à la source.
    status: "en_cours",
    requires: ["tiers", "tresorerie"],
    description: "Plombiers, électriciens, photographes, monteurs vidéo : annuaire, prestations, avis et paiement.",
  },

  {
    key: "marches",
    name: "Appels d'offres et conventions",
    layer: "socle",
    // En base : soumissions aux appels d'offres avec dossier administratif à
    // cocher et alerte de date limite ; consultations lancées aux
    // fournisseurs, offres notées prix/technique, attribution ; conventions
    // avec préavis, reconduction tacite, avenants et résiliation.
    status: "en_cours",
    requires: ["tiers"],
    description: "Répondre aux appels d'offres, consulter des fournisseurs, suivre les conventions et leurs avenants.",
  },

  {
    key: "boite_mail",
    name: "Boîte mail",
    layer: "socle",
    // En base : la connexion IMAP/SMTP de chaque utilisateur, mot de passe
    // d'application chiffré. Les messages restent chez le fournisseur et se
    // lisent en direct ; affichage isolé, images distantes bloquées. Les
    // adresses @maria-groupe.com prennent d'elles-mêmes les serveurs Hostinger.
    status: "en_cours",
    requires: [],
    description: "Consulter et envoyer ses e-mails @maria-groupe.com (Hostinger) sans quitter Maria Suite.",
  },

  {
    key: "securite",
    name: "Sécurité",
    layer: "socle",
    // En base : sites surveillés (magasins, entrepôts, bureaux) avec leur
    // enregistreur Hikvision ou Dahua, caméras par canal, relais du site
    // (clé dont seule l'empreinte est gardée, configuration go2rtc sans
    // secret). Images : relais → serveur vidéo MediaMTX → navigateur en
    // WebRTC, chaque publication et chaque lecture autorisées par Maria Suite,
    // chaque visionnage journalisé. Restent la main courante, les rondes des
    // gardiens, le registre des visiteurs et la relecture des enregistrements.
    status: "en_cours",
    requires: [],
    description: "Caméras des magasins, entrepôts et bureaux en direct, sur un mur d'images, avec le journal de qui regarde.",
  },

  // --------------------------------------------------------------- moteurs
  {
    key: "actifs",
    name: "Actifs & Maintenance",
    layer: "moteur",
    // En base : fiches d'actifs, interventions, relevés de compteur et
    // échéances à double déclencheur. Le coût d'entretien est la somme des
    // interventions, le compteur le dernier relevé. Restent l'amortissement,
    // la facturation des interventions sur actif de client et la récurrence
    // automatique des échéances honorées.
    status: "en_cours",
    requires: ["personnes"],
    description:
      "Fiche actif, affectation, interventions, échéances, coût de revient. " +
      "Porte parc informatique, parc automobile, flotte, garage et patrimoine.",
  },
  {
    key: "reservation",
    name: "Réservation de ressource",
    layer: "moteur",
    // En base : ressources et grille de tarifs, contrats avec contrôle de
    // disponibilité verrouillé, remise (location + caution en 165) et
    // restitution (retenue en 758), abonnements et passages. Restent la
    // facturation des locations longues et le paiement fractionné.
    status: "en_cours",
    requires: ["tiers"],
    description:
      "Ressource, calendrier anti-surréservation, tarif par durée, caution, contrat, retour. " +
      "Porte location, hôtellerie, fitness et salons.",
  },
  {
    key: "missions",
    name: "Missions & Terrain",
    layer: "moteur",
    // En base : missions, étapes validées dans l'ordre, preuves horodatées sur
    // l'appareil (photo, position, signature, note), formulaires de collecte,
    // file hors connexion de l'appareil rejouée dans l'ordre. Restent le
    // téléversement des photos hors réseau et la facturation des missions.
    status: "en_cours",
    requires: ["personnes"],
    description:
      "Mission assignée, étapes, preuves horodatées et géolocalisées, formulaires. " +
      "Porte projet, collecte terrain, livraison, BTP et agriculture.",
  },
  {
    key: "billetterie",
    name: "Billetterie",
    layer: "moteur",
    // En base : lignes, départs à tarif figé, plan de places protégé par un
    // index unique, billets nominatifs avec écriture, contrôle à la montée,
    // non-présentés au départ, annulation contrepassée. Restent la vente en
    // ligne (le canal est prévu en base, aucune page ne vend encore) et le
    // billet imprimé avec son code.
    status: "en_cours",
    requires: [],
    description:
      "Départ programmé, plan de places, billet, contrôle, vente en ligne. " +
      "À ne pas confondre avec la livraison : une place sur un départ, pas un objet suivi.",
  },
  {
    key: "valeur_electronique",
    name: "Valeur électronique",
    layer: "moteur",
    // Écrans « Point de vente ». En base : sessions, floats par réseau,
    // opérations contrôlées contre les deux réserves, commission saisie à
    // l'opération, clôture avec rapprochement et écriture. Restent les
    // barèmes de commission par opérateur et le reçu imprimé.
    status: "en_cours",
    requires: [],
    description:
      "Float par réseau, opérations, barèmes de commission, rapprochement float/espèces. " +
      "Porte le transfert d'argent mobile money et la cabine téléphonique. " +
      "Ne dépend d'aucun autre module.",
  },

  // -------------------------------------------------------------- métiers
  {
    key: "boutique",
    name: "Commerce",
    layer: "metier",
    // Pas de table propre : un tableau de bord posé sur la caisse et le stock
    // — chiffre du jour, affluence, meilleures ventes, marge, ruptures — et un
    // catalogue de départ. Restent les étiquettes de rayon et la fidélité.
    status: "en_cours",
    requires: ["pos", "stock"],
    description: "Commerce de détail : le jour en chiffres, l'affluence, les meilleures ventes et les ruptures.",
  },
  {
    key: "restaurant",
    name: "Restaurant",
    layer: "metier",
    // En base, sur le moteur de restauration partagé avec le maquis : tables,
    // commandes numérotées, lignes envoyées en cuisine ou au bar, bons de
    // production, encaissement de la table en une transaction par un poste
    // numéroté par le serveur. Restent les fiches techniques (un plat qui
    // consomme ses ingrédients), le transfert de table et l'addition partagée.
    status: "en_cours",
    requires: ["pos", "stock"],
    description: "Plan de salle, commandes par table, envoi en cuisine et au bar, encaissement de la table.",
  },
  {
    key: "maquis",
    name: "Maquis",
    layer: "metier",
    // Même moteur que le restaurant, sans couverts ; le grill tient lieu de
    // cuisine. Restent la consigne des bouteilles et des casiers.
    status: "en_cours",
    requires: ["pos", "stock"],
    description: "Tables et tournées, grill et bar, encaissement à la table.",
  },
  { key: "kiosque", name: "Kiosque mobile money", layer: "metier", status: "planifie", requires: ["valeur_electronique"], description: "Agent de transfert et vente de crédit." },
  { key: "garage", name: "Garage", layer: "metier", status: "planifie", requires: ["actifs", "tiers"], description: "Interventions sur des actifs appartenant au client, donc facturables." },
  { key: "btp", name: "BTP", layer: "metier", status: "planifie", requires: ["missions", "stock", "personnes"], description: "Chantiers, matériaux, main-d'œuvre à la tâche." },
  {
    key: "hotellerie",
    name: "Hôtellerie / Résidence",
    layer: "metier",
    // En base, sur le moteur de réservation : la chambre est une ressource, le
    // séjour un contrat piloté par l'hôtel (nuits, arrivée sans paiement, note
    // de chambre, acomptes en 4191, solde au départ en une écriture, caution
    // des résidences), ménage, fiche de police et registre. Restent le report
    // des additions du restaurant sur la chambre, le changement de chambre en
    // cours de séjour et la taxe de séjour.
    status: "en_cours",
    requires: ["reservation"],
    description: "Chambres du jour, séjours, note de chambre, ménage et registre des voyageurs.",
  },
  { key: "location", name: "Location", layer: "metier", status: "planifie", requires: ["reservation"], description: "Matériel, engins, biens immobiliers, matériel événementiel." },
  { key: "transport", name: "Transport", layer: "metier", status: "planifie", requires: ["billetterie"], description: "Gares routières, lignes, billets." },
  { key: "livraison", name: "Livraison", layer: "metier", status: "planifie", requires: ["missions"], description: "Colis, déménagement, transfert." },
  {
    key: "parc_auto",
    name: "Parc automobile",
    layer: "metier",
    // En base : fiche véhicule (immatriculation, carte grise, énergie) posée
    // sur l'actif, carnet de carburant qui alimente le compteur, consommation
    // entre pleins complets, coût au kilomètre, échéances assurance, visite,
    // vignette et patente. Restent les sinistres et amendes.
    status: "en_cours",
    requires: ["actifs"],
    description: "Véhicules, conducteurs, carburant, kilométrage, entretiens, assurance, visite technique, vignette.",
  },
  {
    key: "parc_informatique",
    name: "Parc informatique",
    layer: "metier",
    // En base : fiche technique (série, système, réseau) posée sur l'actif,
    // utilisateur attribué, pannes et garanties par le moteur, licences
    // logicielles comptées par poste avec alerte de dépassement et d'expiration.
    status: "en_cours",
    requires: ["actifs"],
    description: "Ordinateurs, imprimantes, réseau, téléphones : utilisateur, garantie, pannes, licences logicielles.",
  },
  { key: "fitness", name: "Fitness", layer: "metier", status: "planifie", requires: ["reservation", "pos"], description: "Adhérents, formules, contrôle d'accès." },
  {
    key: "projet",
    name: "Projets et dépenses",
    layer: "metier",
    // En base : projets affectés à un responsable, budget suivi, dépenses en
    // circuit (demande, approbation par un autre, paiement avec écriture),
    // photos et preuves de paiement jointes. Restent les tâches et le planning.
    status: "en_cours",
    requires: [],
    description: "Projets, affectation, budget, dépenses tracées de la demande au paiement, photos et preuves.",
  },
  {
    key: "enquetes",
    name: "Enquêtes et satisfaction",
    layer: "metier",
    // En base : questionnaires composés par l'entreprise (notes, recommandation,
    // choix, oui/non, texte, nombre), rattachés à un projet, figés à la
    // première réponse ; réponses de terrain localisées, ou en ligne par un
    // lien public signé ; synthèse question par question et indice de
    // satisfaction. Restent la saisie hors connexion et l'envoi groupé du lien.
    status: "en_cours",
    requires: ["projet"],
    description: "Satisfaction des clients et enquêtes de terrain, rattachées aux projets : par un enquêteur ou par un lien public.",
  },
  { key: "collecte", name: "Collecte de données terrain", layer: "metier", status: "planifie", requires: ["missions"], description: "Formulaires hors connexion. Le cas qui exige le plus la synchronisation différée." },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDefinition | undefined {
  return BY_KEY.get(key);
}

export function modulesByLayer(layer: ModuleLayer): ModuleDefinition[] {
  return MODULES.filter((m) => m.layer === layer);
}

/**
 * Vrai quand les écrans du module lisent la base et non un jeu d'essai.
 *
 * C'est la seule question que pose l'application avant d'ouvrir un module à un
 * client. Un module inconnu du registre est fermé : mieux vaut une entrée
 * manquante qu'une entrée qui ment.
 */
export function estLivre(key: string): boolean {
  const definition = BY_KEY.get(key);
  return definition !== undefined && definition.status !== "planifie";
}

/** Les clés des modules livrés, dans l'ordre du registre. */
export const MODULES_LIVRES: string[] = MODULES.filter((m) =>
  estLivre(m.key),
).map((m) => m.key);

/**
 * Développe la liste des modules à activer en y ajoutant leurs dépendances.
 * Activer « garage » entraîne « actifs », « tiers » et « personnes ».
 */
export function resolveDependencies(keys: string[]): string[] {
  const resolved = new Set<string>();

  // Nommé `definition` et non `module` : ce dernier est réservé par CommonJS,
  // et Next refuse qu'on lui assigne quoi que ce soit.
  const visit = (key: string) => {
    if (resolved.has(key)) return;
    const definition = BY_KEY.get(key);
    if (!definition) throw new Error(`Module inconnu : ${key}`);
    resolved.add(key);
    definition.requires.forEach(visit);
  };

  keys.forEach(visit);
  return [...resolved];
}
