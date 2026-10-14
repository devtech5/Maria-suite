import { definitionDroit, type Droit } from "@/lib/droits/catalogue";
import { REPRISE_OUVERTE } from "@/modules/reprise/calcul";

/**
 * Carte des modules, partagée par la barre latérale et l'écran d'accueil.
 *
 * Une seule liste : un module ajouté ici apparaît aux deux endroits, sous le
 * même nom et dans le même groupe. Deux listes finiraient par diverger, et
 * l'accueil annoncerait un module que la barre ne connaît pas.
 */

export const CLES_ICONE = [
  "accueil", "tableau-de-bord", "caisse",
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
  titre: string;
  modules: EntreeModule[];
}

export const GROUPES_MODULES: GroupeModules[] = [
  {
    titre: "Commerce",
    modules: [
      { href: "/boutique", racine: "/boutique", icone: "boutique", libelle: "Commerce", description: "Le jour en chiffres : ventes, affluence, marge et ruptures.", droit: "boutique.consulter" },
      { href: "/restaurant", racine: "/restaurant", icone: "restaurant", libelle: "Restaurant", description: "Plan de salle, commandes, cuisine et encaissement des tables.", droit: "restaurant.consulter" },
      { href: "/maquis", racine: "/maquis", icone: "maquis", libelle: "Maquis", description: "Tables et tournées, grill et bar, encaissement à la table.", droit: "maquis.consulter" },
      { href: "/hotel", racine: "/hotel", icone: "hotel", libelle: "Hôtel et résidences", description: "Chambres du jour, séjours, note de chambre et ménage.", droit: "hotellerie.consulter" },
      { href: "/commercial", racine: "/commercial", icone: "commercial", libelle: "Commercial", description: "Clients, devis, factures et encaissements.", droit: "tiers.fiche.consulter" },
      { href: "/stock", racine: "/stock", icone: "stock", libelle: "Stock", description: "Articles, mouvements, inventaires et réapprovisionnement.", droit: "stock.article.consulter" },
      { href: "/achats", racine: "/achats", icone: "achats", libelle: "Achats", description: "Commandes et factures fournisseurs.", droit: "achats.consulter" },
      { href: "/prestataires", racine: "/prestataires", icone: "prestataires", libelle: "Prestataires", description: "Plombiers, photographes, monteurs : annuaire et prestations.", droit: "prestataires.consulter" },
      { href: "/reservations", racine: "/reservations", icone: "reservations", libelle: "Réservations", description: "Locations, chambres et salles : calendrier, caution, retour.", droit: "reservation.consulter" },
    ],
  },
  {
    titre: "Terrain",
    modules: [
      { href: "/projets", racine: "/projets", icone: "projets", libelle: "Projets", description: "Projets, budgets, dépenses, photos et preuves.", droit: "projet.consulter" },
      { href: "/enquetes", racine: "/enquetes", icone: "enquetes", libelle: "Enquêtes", description: "Satisfaction des clients et enquêtes de terrain.", droit: "enquetes.consulter" },
      { href: "/missions", racine: "/missions", icone: "missions", libelle: "Missions", description: "Missions assignées, étapes et preuves de terrain.", droit: "missions.consulter" },
      { href: "/actifs", racine: "/actifs", icone: "actifs", libelle: "Actifs", description: "Engins et matériel : interventions et échéances.", droit: "actifs.consulter" },
      { href: "/parc-auto", racine: "/parc-auto", icone: "parc-auto", libelle: "Parc auto", description: "Véhicules, pleins, consommation et vignettes.", droit: "parc_auto.consulter" },
      { href: "/parc-informatique", racine: "/parc-informatique", icone: "parc-informatique", libelle: "Parc informatique", description: "Ordinateurs, attributions et licences.", droit: "parc_informatique.consulter" },
      { href: "/billetterie", racine: "/billetterie", icone: "billetterie", libelle: "Billetterie", description: "Départs programmés, places, billets et contrôle.", droit: "billetterie.consulter" },
    ],
  },
  {
    titre: "Finance",
    modules: [
      { href: "/comptabilite", racine: "/comptabilite", icone: "comptabilite", libelle: "Comptabilité", description: "Écritures SYSCOHADA, balance et déclarations.", droit: "comptabilite.ecriture.consulter" },
      { href: "/tresorerie", racine: "/tresorerie", icone: "tresorerie", libelle: "Trésorerie", description: "Caisses, banques, bons et plan de trésorerie.", droit: "tresorerie.bon.demander" },
      { href: "/monnaie", racine: "/monnaie", icone: "guichet", libelle: "Point de vente", description: "Mobile money : floats, opérations et commissions.", droit: "valeur_electronique.consulter" },
    ],
  },
  {
    titre: "Ressources humaines",
    modules: [
      { href: "/rh", racine: "/rh", icone: "personnel", libelle: "Personnel", description: "Salariés, intervenants, dossiers et paie.", droit: "personnes.consulter" },
      { href: "/presences", racine: "/presences", icone: "presences", libelle: "Présences et congés", description: "Pointage à la connexion, retards, congés et soldes.", droit: "conges.demander" },
      { href: "/planning", racine: "/planning", icone: "planning", libelle: "Planning", description: "Qui est disponible, occupé, en mission ou sur le terrain.", droit: "planning.utiliser" },
      { href: "/taches", racine: "/taches", icone: "taches", libelle: "Tâches", description: "Ce qui est à faire, par qui et pour quand.", droit: "taches.consulter" },
      { href: "/meeting", racine: "/meeting", icone: "meeting", libelle: "Meeting", description: "Réunions d'équipe à distance, en vidéo.", droit: "meeting.participer" },
      { href: "/messagerie", racine: "/messagerie", icone: "messagerie", libelle: "Messagerie", description: "Discussions privées et groupes de l'équipe.", droit: "messagerie.utiliser" },
      { href: "/boite-mail", racine: "/boite-mail", icone: "boite-mail", libelle: "Boîte mail", description: "Vos e-mails, sans quitter Maria Suite.", droit: "boite_mail.utiliser" },
      { href: "/documents", racine: "/documents", icone: "documents", libelle: "Documents", description: "Pièces rattachées aux fiches et leurs échéances.", droit: "documents.consulter" },
      { href: "/archives", racine: "/archives", icone: "archives", libelle: "Archives", description: "Votre espace d'archivage personnel, intègre et tracé.", droit: "archives.consulter" },
    ],
  },
  {
    titre: "Administration",
    modules: [
      { href: "/membres", racine: "/membres", icone: "utilisateurs", libelle: "Utilisateurs", description: "Comptes, rôles et accès.", droit: "organisation.membre.gerer" },
      { href: "/entreprise", racine: "/entreprise", icone: "entreprise", libelle: "Entreprise", description: "Identité, numérotation et sécurité.", droit: "organisation.parametres.gerer" },
      ...(REPRISE_OUVERTE
        ? [{ href: "/demarrage", racine: "/demarrage", icone: "demarrage", libelle: "Démarrage", description: "Reprise de l'existant : articles, tiers, soldes.", droit: "organisation.reprise.importer" } satisfies EntreeModule]
        : []),
      { href: "/marches", racine: "/marches", icone: "marches", libelle: "Marchés et conventions", description: "Appels d'offres, consultations et conventions.", droit: "marches.consulter" },
      { href: "/securite", racine: "/securite", icone: "securite", libelle: "Sécurité", description: "Caméras des magasins, entrepôts et bureaux en direct.", droit: "securite.consulter" },
      { href: "/communication", racine: "/communication", icone: "communication", libelle: "Communication", description: "Envois aux clients et messages groupés.", droit: "communication.consulter" },
      { href: "/rapports", racine: "/rapports", icone: "rapports", libelle: "Rapports", description: "Ventes, stock, trésorerie, paie : chaque module en chiffres, imprimable et exportable vers Excel.", droit: "rapports.consulter" },
      { href: "/journal", racine: "/journal", icone: "journal", libelle: "Journal d'activité", description: "Qui a fait quoi, et quand.", droit: "organisation.journal.consulter" },
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
    titre: g.titre,
    modules: g.modules.filter((m) => accordes.has(m.droit) && ouverts.has(definitionDroit(m.droit).moduleKey)),
  })).filter((g) => g.modules.length > 0);
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
