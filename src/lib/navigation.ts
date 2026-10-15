import { definitionDroit, type Droit } from "@/lib/droits/catalogue";
import { REPRISE_OUVERTE } from "@/modules/reprise/calcul";

/**
 * Carte des modules, partagée par la barre du haut et l'écran d'accueil.
 *
 * Une seule liste : un module ajouté ici apparaît aux deux endroits, sous le
 * même nom et dans le même groupe. Deux listes finiraient par diverger, et
 * l'accueil annoncerait un module que la barre ne connaît pas.
 */

export const CLES_ICONE = [
  "accueil", "maison", "tableau-de-bord", "caisse",
  "boutique", "restaurant", "maquis", "hotel", "enquetes", "securite",
  "commercial", "stock", "achats", "prestataires", "marches", "reservations",
  "projets", "missions", "actifs", "parc-auto", "parc-informatique", "billetterie",
  "comptabilite", "tresorerie", "guichet",
  "personnel", "presences", "planning", "taches", "meeting", "messagerie", "boite-mail", "documents", "archives",
  "utilisateurs", "entreprise", "demarrage", "communication", "rapports", "journal",
] as const;
export type CleIcone = (typeof CLES_ICONE)[number];

export interface EntreeModule {
  href: string;
  racine: string;
  libelle: string;
  /** Une phrase, pour la tuile de l'écran d'accueil. */
  description: string;
  /** Droit sans lequel l'entrée ne s'affiche pas. */
  droit: Droit;
  /** Clé d'icône, résolue par `components/coque/icone-module` : ce fichier reste sans React. */
  icone: CleIcone;
}

export interface GroupeModules {
  /** Clé stable du domaine, pour la barre du haut. */
  cle: string;
  titre: string;
  /** Libellé de la barre du haut, en capitales sous l'icône : court, ou il déborde. */
  court: string;
  icone: CleIcone;
  modules: EntreeModule[];
}

/**
 * Les domaines, dans l'ordre de la barre du haut.
 *
 * Trois niveaux, repris de Ferme360 : le domaine en haut (Finance), ses
 * modules en onglets de section (Comptabilité, Trésorerie), les sections du
 * module en pastilles (Écritures, Balance). Un domaine reste court — au-delà
 * de six ou sept modules, la rangée d'onglets se lit mal et il faut le couper.
 *
 * Une entrée n'est pas forcément un module entier : « Clients », « Bons » ou
 * « Intervenants / manœuvres » ouvrent directement une section d'un module.
 * La barre allume l'entrée dont l'adresse correspond le plus précisément.
 *
 * Le tableau de bord n'est pas un module : la barre l'ajoute en tête du
 * Pilotage.
 */
export const GROUPES_MODULES: GroupeModules[] = [
  {
    cle: "pilotage",
    titre: "Pilotage",
    court: "Pilotage",
    icone: "tableau-de-bord",
    modules: [
      { href: "/rapports", racine: "/rapports", icone: "rapports", libelle: "Rapports", description: "Ventes, stock, trésorerie, paie : chaque module en chiffres, imprimable et exportable vers Excel.", droit: "rapports.consulter" },
      { href: "/journal", racine: "/journal", icone: "journal", libelle: "Journal d'activité", description: "Qui a fait quoi, et quand.", droit: "organisation.journal.consulter" },
    ],
  },
  {
    cle: "equipe",
    titre: "Équipe",
    court: "Équipe",
    icone: "messagerie",
    modules: [
      { href: "/boite-mail", racine: "/boite-mail", icone: "boite-mail", libelle: "Boîte mail", description: "Vos e-mails, sans quitter Maria Suite.", droit: "boite_mail.utiliser" },
      { href: "/messagerie", racine: "/messagerie", icone: "messagerie", libelle: "Messagerie", description: "Discussions privées et groupes de l'équipe.", droit: "messagerie.utiliser" },
      { href: "/communication", racine: "/communication", icone: "communication", libelle: "Messages groupés", description: "Envois aux clients et messages groupés.", droit: "communication.consulter" },
      { href: "/archives", racine: "/archives", icone: "archives", libelle: "Archives", description: "Votre espace d'archivage personnel, intègre et tracé.", droit: "archives.consulter" },
      { href: "/meeting", racine: "/meeting", icone: "meeting", libelle: "Meeting", description: "Réunions d'équipe à distance, en vidéo.", droit: "meeting.participer" },
    ],
  },
  {
    cle: "commerce",
    titre: "Commerce",
    court: "Commerce",
    icone: "commercial",
    modules: [
      { href: "/commercial", racine: "/commercial", icone: "commercial", libelle: "Clients", description: "Clients, devis, factures et encaissements.", droit: "tiers.fiche.consulter" },
      { href: "/commercial/commerciaux", racine: "/commercial/commerciaux", icone: "commercial", libelle: "Commerciaux", description: "Commerciaux, objectifs et commissions.", droit: "commercial.commission.gerer" },
      { href: "/commercial/fournisseurs", racine: "/commercial/fournisseurs", icone: "achats", libelle: "Fournisseurs", description: "Fiches fournisseurs, leurs factures et ce qui leur est dû.", droit: "tiers.fiche.consulter" },
      { href: "/commercial/factures", racine: "/commercial/factures", icone: "commercial", libelle: "Devis et factures", description: "Devis, factures et avoirs clients.", droit: "tiers.fiche.consulter" },
      { href: "/achats", racine: "/achats", icone: "achats", libelle: "Achats", description: "Commandes et factures fournisseurs.", droit: "achats.consulter" },
      { href: "/boutique", racine: "/boutique", icone: "boutique", libelle: "Commerce", description: "Le jour en chiffres : ventes, affluence, marge et ruptures.", droit: "boutique.consulter" },
      { href: "/restaurant", racine: "/restaurant", icone: "restaurant", libelle: "Restaurant", description: "Plan de salle, commandes, cuisine et encaissement des tables.", droit: "restaurant.consulter" },
      { href: "/maquis", racine: "/maquis", icone: "maquis", libelle: "Maquis", description: "Tables et tournées, grill et bar, encaissement à la table.", droit: "maquis.consulter" },
      { href: "/hotel", racine: "/hotel", icone: "hotel", libelle: "Hôtel et résidences", description: "Chambres du jour, séjours, note de chambre et ménage.", droit: "hotellerie.consulter" },
      { href: "/reservations", racine: "/reservations", icone: "reservations", libelle: "Réservations", description: "Locations, chambres et salles : calendrier, caution, retour.", droit: "reservation.consulter" },
      { href: "/stock", racine: "/stock", icone: "stock", libelle: "Stock", description: "Articles, mouvements, inventaires et réapprovisionnement.", droit: "stock.article.consulter" },
    ],
  },
  {
    cle: "terrain",
    titre: "Terrain",
    court: "Terrain",
    icone: "projets",
    modules: [
      { href: "/projets", racine: "/projets", icone: "projets", libelle: "Projets", description: "Projets, budgets, dépenses, photos et preuves.", droit: "projet.consulter" },
      { href: "/missions", racine: "/missions", icone: "missions", libelle: "Missions", description: "Missions assignées, étapes et preuves de terrain.", droit: "missions.consulter" },
      { href: "/prestataires", racine: "/prestataires", icone: "prestataires", libelle: "Prestataires", description: "Plombiers, photographes, monteurs : annuaire et prestations.", droit: "prestataires.consulter" },
      { href: "/rh/intervenants", racine: "/rh/intervenants", icone: "personnel", libelle: "Intervenants / manœuvres", description: "Maçons, manœuvres, tâcherons : pointage et bons de paiement.", droit: "personnes.consulter" },
      { href: "/enquetes", racine: "/enquetes", icone: "enquetes", libelle: "Enquêtes", description: "Satisfaction des clients et enquêtes de terrain.", droit: "enquetes.consulter" },
      { href: "/billetterie", racine: "/billetterie", icone: "billetterie", libelle: "Billetterie", description: "Départs programmés, places, billets et contrôle.", droit: "billetterie.consulter" },
    ],
  },
  {
    cle: "biens",
    titre: "Actifs / Biens",
    court: "Actifs / Biens",
    icone: "actifs",
    modules: [
      { href: "/parc-auto", racine: "/parc-auto", icone: "parc-auto", libelle: "Parc auto", description: "Véhicules, pleins, consommation et vignettes.", droit: "parc_auto.consulter" },
      { href: "/parc-informatique", racine: "/parc-informatique", icone: "parc-informatique", libelle: "Parc informatique", description: "Ordinateurs, attributions et licences.", droit: "parc_informatique.consulter" },
      { href: "/actifs", racine: "/actifs", icone: "actifs", libelle: "Matériels", description: "Engins et matériel : interventions et échéances.", droit: "actifs.consulter" },
    ],
  },
  {
    cle: "rh",
    titre: "Ressources humaines",
    court: "RH",
    icone: "personnel",
    modules: [
      { href: "/rh", racine: "/rh", icone: "personnel", libelle: "Personnel", description: "Salariés, intervenants, dossiers et paie.", droit: "personnes.consulter" },
      { href: "/presences", racine: "/presences", icone: "presences", libelle: "Présences et congés", description: "Pointage à la connexion, retards, congés et soldes.", droit: "conges.demander" },
      { href: "/planning", racine: "/planning", icone: "planning", libelle: "Planning", description: "Qui est disponible, occupé, en mission ou sur le terrain.", droit: "planning.utiliser" },
      { href: "/taches", racine: "/taches", icone: "taches", libelle: "Tâches", description: "Ce qui est à faire, par qui et pour quand.", droit: "taches.consulter" },
    ],
  },
  {
    cle: "finance",
    titre: "Finance",
    court: "Finance",
    icone: "comptabilite",
    modules: [
      { href: "/comptabilite", racine: "/comptabilite", icone: "comptabilite", libelle: "Comptabilité", description: "Écritures SYSCOHADA, balance et déclarations.", droit: "comptabilite.ecriture.consulter" },
      { href: "/tresorerie", racine: "/tresorerie", icone: "tresorerie", libelle: "Trésorerie", description: "Caisses, banques, bons et plan de trésorerie.", droit: "tresorerie.bon.demander" },
      { href: "/tresorerie/caisse", racine: "/tresorerie/caisse", icone: "tresorerie", libelle: "Bons", description: "Bons de caisse : demande, validation et décaissement.", droit: "tresorerie.bon.demander" },
      { href: "/monnaie", racine: "/monnaie", icone: "guichet", libelle: "Point de vente", description: "Mobile money : floats, opérations et commissions.", droit: "valeur_electronique.consulter" },
    ],
  },
  {
    cle: "archives",
    titre: "Archives",
    court: "Archives",
    icone: "archives",
    modules: [
      { href: "/archives/dossiers", racine: "/archives/dossiers", icone: "archives", libelle: "Dossiers", description: "Dossiers partagés de l'entreprise.", droit: "archives.consulter" },
      { href: "/documents", racine: "/documents", icone: "documents", libelle: "Fichiers", description: "Pièces rattachées aux fiches et leurs échéances.", droit: "documents.consulter" },
    ],
  },
  {
    cle: "securite",
    titre: "Sécurité",
    court: "Sécurité",
    icone: "securite",
    modules: [
      { href: "/securite", racine: "/securite", icone: "securite", libelle: "Caméras", description: "Caméras des magasins, entrepôts et bureaux en direct.", droit: "securite.consulter" },
    ],
  },
  {
    cle: "administration",
    titre: "Administration",
    court: "Admin",
    icone: "entreprise",
    modules: [
      { href: "/entreprise", racine: "/entreprise", icone: "entreprise", libelle: "Entreprise", description: "Identité, numérotation et sécurité.", droit: "organisation.parametres.gerer" },
      { href: "/marches", racine: "/marches", icone: "marches", libelle: "Marchés et conventions", description: "Appels d'offres, consultations et conventions.", droit: "marches.consulter" },
      { href: "/contrats", racine: "/contrats", icone: "documents", libelle: "Contrats", description: "Contrats des salariés et des fournisseurs, échéances en tête.", droit: "personnes.consulter" },
      { href: "/membres", racine: "/membres", icone: "utilisateurs", libelle: "Utilisateurs", description: "Comptes, rôles et accès.", droit: "organisation.membre.gerer" },
      ...(REPRISE_OUVERTE
        ? [{ href: "/demarrage", racine: "/demarrage", icone: "demarrage", libelle: "Démarrage", description: "Reprise de l'existant : articles, tiers, soldes.", droit: "organisation.reprise.importer" } satisfies EntreeModule]
        : []),
    ],
  },
];

/**
 * Raccourcis personnels du menu de compte.
 *
 * Ils pointent vers des modules, et disparaissent donc avec eux : « Mes
 * documents » sur un module fermé mène à un écran d'attente, ce qui est pire
 * qu'une entrée absente.
 */
export const RACCOURCIS_COMPTE: { href: string; libelle: string; module: string }[] = [
  { href: "/taches", libelle: "Mes tâches", module: "taches" },
  { href: "/planning", libelle: "Mon planning", module: "planning" },
  { href: "/meeting", libelle: "Mes réunions", module: "meeting" },
  { href: "/documents", libelle: "Mes documents", module: "documents" },
  { href: "/archives", libelle: "Mes archives", module: "archives" },
  { href: "/rh", libelle: "Ressources humaines", module: "personnes" },
  { href: "/mot-de-passe", libelle: "Changer de mot de passe", module: "organisation" },
];

/** Les raccourcis du menu de compte dont le module est ouvert. */
export function raccourcisCompte(modulesOuverts: Iterable<string>): { href: string; libelle: string }[] {
  const ouverts = new Set([...modulesOuverts, "organisation"]);
  return RACCOURCIS_COMPTE.filter((r) => ouverts.has(r.module)).map(({ href, libelle }) => ({ href, libelle }));
}

/**
 * Les groupes tels que la session les voit : une entrée s'affiche si le rôle
 * l'autorise ET si son module est ouvert sur l'instance. Un groupe vide
 * disparaît : un titre seul n'informe de rien.
 *
 * Du confort, pas une protection — chaque module revérifie son droit.
 */
export function groupesVisibles(droits: Iterable<Droit>, modulesOuverts: Iterable<string>): GroupeModules[] {
  const accordes = new Set(droits);
  // Le transverse (utilisateurs, mot de passe) n'est pas un module : toujours ouvert.
  const ouverts = new Set([...modulesOuverts, "organisation"]);
  return GROUPES_MODULES.map((g) => ({
    ...g,
    modules: g.modules.filter((m) => accordes.has(m.droit) && ouverts.has(definitionDroit(m.droit).moduleKey)),
  })).filter((g) => g.modules.length > 0);
}

/** Un chemin relève d'une entrée s'il est sa racine ou s'il descend d'elle — « /stockage » n'est pas « /stock ». */
export function relevDe(chemin: string, racine: string): boolean {
  if (racine === "/") return chemin === "/";
  return chemin === racine || chemin.startsWith(`${racine}/`);
}

/**
 * Le domaine de la page courante, parmi ceux que la session voit. Le tableau
 * de bord relève du Pilotage. Nul pour une page hors de toute carte : la barre
 * n'allume alors aucun domaine plutôt que d'en désigner un au hasard.
 */
export function domaineDe(chemin: string, groupes: GroupeModules[]): string | null {
  if (relevDe(chemin, "/")) return "pilotage";
  // L'entrée la plus précise l'emporte : « /commercial/fournisseurs » relève
  // du Service Achat, pas de Commercial dont il est pourtant une sous-page.
  let meilleur: { cle: string; longueur: number } | null = null;
  for (const g of groupes) {
    for (const m of g.modules) {
      if (relevDe(chemin, m.racine) && (!meilleur || m.racine.length > meilleur.longueur)) {
        meilleur = { cle: g.cle, longueur: m.racine.length };
      }
    }
  }
  return meilleur?.cle ?? null;
}

/**
 * Où aller après connexion : la page demandée avant d'être renvoyé à la
 * connexion, sinon l'accueil. Seul un chemin interne est suivi — une adresse
 * absolue ou `//hote` ferait de la connexion un tremplin vers un site tiers.
 */
export function destinationApresConnexion(suite: unknown): string {
  if (typeof suite !== "string") return "/accueil";
  if (!/^\/(?![/\\])/.test(suite) || suite.startsWith("/connexion") || suite.length > 500) return "/accueil";
  return suite;
}
