import type { SoldeCompte } from "@/lib/comptabilite/etats";

/**
 * Agrégation du tableau de bord.
 *
 * Le parti pris : un tableau de bord montre ce qui demande une DÉCISION, pas
 * tout ce que l'application sait. Aligner vingt chiffres dont aucun n'appelle
 * d'action, c'est garantir qu'on n'en lira aucun — et que le seul qui comptait
 * passera inaperçu.
 *
 * D'où deux blocs seulement : ce qui ne va pas, et de quoi juger la journée.
 */

export type Gravite = "critique" | "attention" | "information";

export interface Alerte {
  id: string;
  gravite: Gravite;
  /**
   * D'où vient le chiffre.
   *
   * `fixture` marque une alerte encore calculée sur un jeu d'essai. Elle ne
   * s'affiche que sur une instance d'aperçu : une alerte critique inventée sur
   * l'écran d'accueil est le pire endroit où mettre une donnée fausse — c'est
   * la première chose que l'exploitant lit le matin, et il agirait dessus.
   *
   * Le module ne suffit pas à trancher : le commercial lit la base pour ses
   * tiers et une fixture pour ses factures. La source, elle, est exacte.
   */
  source: "base" | "fixture";
  /** Module concerné, pour que l'exploitant sache où il atterrit. */
  module: string;
  titre: string;
  detail: string;
  href: string;
  /** Nombre d'éléments concernés, quand l'alerte en regroupe plusieurs. */
  nombre?: number;
}

export const ORDRE_GRAVITE: Record<Gravite, number> = {
  critique: 0,
  attention: 1,
  information: 2,
};

/**
 * État du stock, tel que la base le connaît.
 *
 * Passé en paramètre plutôt que lu ici : ce module reste
 * une fonction de mise en forme, sans accès à la base, donc lisible et
 * testable. C'est l'écran qui interroge.
 */
/**
 * Ce que le parc a d'urgent, réduit à deux nombres.
 *
 * Comme pour le stock : le tableau de bord ne lit pas la base lui-même, il
 * reçoit des faits déjà établis. C'est ce qui le garde testable sans
 * PostgreSQL, et ce qui empêche une requête de se glisser dans un module de
 * présentation.
 */
export interface EtatParc {
  /** Échéances dont le terme ou le seuil de compteur est franchi. */
  echeancesDepassees: number;
  /** Actifs en entretien ou immobilisés : indisponibles à l'exploitation. */
  indisponibles: number;
}

/** Ce que les missions ont d'urgent, réduit à deux nombres. */
export interface EtatMissions {
  /** Missions ouvertes dont l'échéance est passée. */
  enRetard: number;
  /** Missions échouées, à reprogrammer. */
  echouees: number;
}

/** Biens loués non rendus et adhérents bloqués à l'accueil. */
export interface EtatReservations {
  locationsEnRetard: number;
  abonnementsEpuises: number;
}

/** Ce que la paie a d'urgent : salaires validés non versés, déclarations en attente. */
export interface EtatPaieAlertes {
  salairesNonPayes: number;
  montantNonPaye: number;
  declarationsDues: number;
  montantDeclarations: number;
  declarationsEchues: number;
}

/** Ce que la fiscalité a d'urgent : TVA de mois terminés à déclarer, TVA déclarée à payer. */
export interface EtatFiscaliteAlertes {
  aDeclarer: number;
  declarationsEnRetard: number;
  aPayer: number;
  montantAPayer: number;
  paiementsEnRetard: number;
}

/** Ce que les achats ont d'urgent : dettes échues ou proches, livraisons en retard. */
export interface EtatAchatsAlertes {
  facturesEchues: number;
  montantEchu: number;
  aPayerSous7Jours: number;
  livraisonsEnRetard: number;
}

/** Ce que la trésorerie a d'urgent, réduit à des nombres. */
export interface EtatTresorerieAlertes {
  caissesSousSeuil: string[];
  bonsAApprouver: number;
  bonsADecaisser: number;
  avancesEchues: number;
  montantAvancesEchues: number;
  virementsEnTransit: number;
  /** Premier jour où le plan de trésorerie passe sous zéro. */
  premierDecouvert: string | null;
}

const TRESORERIE_VIDE: EtatTresorerieAlertes = {
  caissesSousSeuil: [],
  bonsAApprouver: 0,
  bonsADecaisser: 0,
  avancesEchues: 0,
  montantAvancesEchues: 0,
  virementsEnTransit: 0,
  premierDecouvert: null,
};

/**
 * Tâches dont l'échéance est passée. `equipe` ne compte que celles confiées
 * à d'autres, et n'est renseigné que pour qui attribue les tâches.
 */
export interface EtatTaches {
  miennesEnRetard: number;
  equipeEnRetard: number;
}

/** Factures émises, échues et pas entièrement payées. */
export interface EtatFacturation {
  enRetard: number;
  montantEnRetard: number;
}

export interface EtatStock {
  ruptures: number;
  /** Articles dont l'autonomie tombe sous le délai de réaction habituel. */
  aCommanderVite: number;
  /** Valeur au coût moyen pondéré, en francs entiers. */
  valeur: number;
}

/**
 * Ce qui demande une décision aujourd'hui.
 *
 * Classé par gravité, pas par module : quelqu'un qui ouvre son application le
 * matin veut savoir ce qui brûle, pas parcourir un sommaire.
 *
 * Facturation, stock, parc, missions, réservations et guichet viennent de la base — les autres
 * sources sont encore des fixtures, en attendant leurs modules.
 */
export function alertes(
  facturation: EtatFacturation,
  stock: EtatStock,
  parc: EtatParc,
  missions: EtatMissions,
  reservations: EtatReservations,
  /** Réseaux dont le float est bas au guichet ouvert, déjà nommés. */
  floatsBas: string[] = [],
  depenses: { aApprouver: number; montantAApprouver: number; sansPreuve: number } = { aApprouver: 0, montantAApprouver: 0, sansPreuve: 0 },
  taches: EtatTaches = { miennesEnRetard: 0, equipeEnRetard: 0 },
  tresorerie: EtatTresorerieAlertes = TRESORERIE_VIDE,
  achats: EtatAchatsAlertes = { facturesEchues: 0, montantEchu: 0, aPayerSous7Jours: 0, livraisonsEnRetard: 0 },
  paie: EtatPaieAlertes = { salairesNonPayes: 0, montantNonPaye: 0, declarationsDues: 0, montantDeclarations: 0, declarationsEchues: 0 },
  fiscalite: EtatFiscaliteAlertes = { aDeclarer: 0, declarationsEnRetard: 0, aPayer: 0, montantAPayer: 0, paiementsEnRetard: 0 },
): Alerte[] {
  const liste: Alerte[] = [];

  // ---------------------------------------------------------- fiscalité
  if (fiscalite.aDeclarer > 0) {
    liste.push({
      id: "tva-a-declarer",
      gravite: fiscalite.declarationsEnRetard > 0 ? "critique" : "attention",
      source: "base",
      module: "Fiscalité",
      titre: fiscalite.declarationsEnRetard > 0 ? "Déclaration de TVA en retard" : "TVA du mois écoulé à déclarer",
      detail: `${fiscalite.aDeclarer} mois terminé${fiscalite.aDeclarer > 1 ? "s" : ""} sans déclaration`,
      href: "/comptabilite/fiscalite",
      nombre: fiscalite.aDeclarer,
    });
  }
  if (fiscalite.aPayer > 0) {
    liste.push({
      id: "tva-a-payer",
      gravite: fiscalite.paiementsEnRetard > 0 ? "critique" : "attention",
      source: "base",
      module: "Fiscalité",
      titre: fiscalite.paiementsEnRetard > 0 ? "Paiement de TVA en retard" : "TVA déclarée à payer",
      detail: `${fiscalite.montantAPayer.toLocaleString("fr-FR")} FCFA dus à la DGI`,
      href: "/comptabilite/fiscalite",
      nombre: fiscalite.aPayer,
    });
  }

  // --------------------------------------------------------------- paie
  if (paie.salairesNonPayes > 0) {
    liste.push({
      id: "salaires-non-payes",
      gravite: "critique",
      source: "base",
      module: "Paie",
      titre: "Salaires validés non payés",
      detail: `${paie.montantNonPaye.toLocaleString("fr-FR")} FCFA de nets à verser`,
      href: "/rh/paie",
      nombre: paie.salairesNonPayes,
    });
  }
  if (paie.declarationsDues > 0) {
    liste.push({
      id: "declarations-paie",
      gravite: paie.declarationsEchues > 0 ? "critique" : "attention",
      source: "base",
      module: "Paie",
      titre: paie.declarationsEchues > 0 ? "Versements CNPS ou impôt en retard" : "Versements CNPS et impôt à faire",
      detail: `${paie.montantDeclarations.toLocaleString("fr-FR")} FCFA dus aux organismes`,
      href: "/rh/paie",
      nombre: paie.declarationsDues,
    });
  }

  // ------------------------------------------------------------- achats
  if (achats.facturesEchues > 0) {
    liste.push({
      id: "fournisseurs-echus",
      gravite: "critique",
      source: "base",
      module: "Achats",
      titre: "Factures fournisseurs échues",
      detail: `${achats.montantEchu.toLocaleString("fr-FR")} FCFA dus et non payés`,
      href: "/achats/dettes",
      nombre: achats.facturesEchues,
    });
  }
  if (achats.aPayerSous7Jours > 0) {
    liste.push({
      id: "fournisseurs-semaine",
      gravite: "attention",
      source: "base",
      module: "Achats",
      titre: "Fournisseurs à payer cette semaine",
      detail: "Échéance dans les sept jours",
      href: "/achats/dettes",
      nombre: achats.aPayerSous7Jours,
    });
  }
  if (achats.livraisonsEnRetard > 0) {
    liste.push({
      id: "livraisons-retard",
      gravite: "attention",
      source: "base",
      module: "Achats",
      titre: "Livraisons fournisseurs en retard",
      detail: "Commandes envoyées, date de livraison dépassée",
      href: "/achats",
      nombre: achats.livraisonsEnRetard,
    });
  }

  // ------------------------------------------------------------ tâches
  // Celles de la personne d'abord : c'est à elle d'agir, sans attendre personne.
  if (taches.miennesEnRetard > 0) {
    liste.push({
      id: "taches-miennes-retard",
      gravite: "critique",
      source: "base",
      module: "Tâches",
      titre: "Vos tâches en retard",
      detail: "Échéance dépassée : terminez-les ou faites reporter l'échéance",
      href: "/taches",
      nombre: taches.miennesEnRetard,
    });
  }
  if (taches.equipeEnRetard > 0) {
    liste.push({
      id: "taches-equipe-retard",
      gravite: "attention",
      source: "base",
      module: "Tâches",
      titre: "Tâches de l'équipe en retard",
      detail: "Confiées à d'autres membres, échéance dépassée",
      href: "/taches?vue=toutes",
      nombre: taches.equipeEnRetard,
    });
  }

  // ------------------------------------------------------------- ventes
  // Plus d'alerte « pièces sans écriture » : une facture passe son écriture à
  // l'émission, dans la même transaction. L'écart ne peut plus exister.
  if (facturation.enRetard > 0) {
    liste.push({
      id: "factures-retard",
      gravite: "critique",
      source: "base",
      module: "Commercial",
      titre: "Factures impayées",
      detail: `${facturation.montantEnRetard.toLocaleString("fr-FR")} FCFA en souffrance`,
      href: "/commercial/factures",
      nombre: facturation.enRetard,
    });
  }

  // -------------------------------------------------------------- stock
  if (stock.ruptures > 0) {
    liste.push({
      id: "ruptures",
      gravite: "critique",
      source: "base",
      module: "Stock",
      titre: "Articles en rupture",
      // Un stock négatif compte ici aussi : il signale une sortie enregistrée
      // avant son entrée, et la vente suivante partira sur une quantité fausse.
      detail: "Aucune vente possible sur ces références",
      href: "/stock",
      nombre: stock.ruptures,
    });
  }

  if (stock.aCommanderVite > 0) {
    liste.push({
      id: "reappro",
      gravite: "attention",
      source: "base",
      module: "Stock",
      titre: "À commander sous trois jours",
      detail: "Le délai fournisseur ne sera pas tenu au-delà",
      href: "/stock/reapprovisionnement",
      nombre: stock.aCommanderVite,
    });
  }

  // ----------------------------------------------------------- dépenses
  if (depenses.aApprouver > 0) {
    liste.push({
      id: "depenses-a-approuver",
      gravite: "attention",
      source: "base",
      module: "Projets",
      titre: "Dépenses à approuver",
      detail: `${depenses.montantAApprouver.toLocaleString("fr-FR")} FCFA en attente de décision`,
      href: "/projets/depenses",
      nombre: depenses.aApprouver,
    });
  }
  if (depenses.sansPreuve > 0) {
    liste.push({
      id: "depenses-sans-preuve",
      gravite: "attention",
      source: "base",
      module: "Projets",
      titre: "Dépenses payées sans preuve",
      detail: "Joignez le reçu ou la capture du transfert",
      href: "/projets/depenses",
      nombre: depenses.sansPreuve,
    });
  }

  // ----------------------------------------------------------- guichet
  if (floatsBas.length > 0) {
    liste.push({
      id: "float-bas",
      gravite: "critique",
      source: "base",
      module: "Point de vente",
      titre: "Float insuffisant",
      detail: floatsBas.join(", "),
      href: "/monnaie",
      nombre: floatsBas.length,
    });
  }

  // ---------------------------------------------------------- trésorerie
  if (tresorerie.premierDecouvert) {
    liste.push({
      id: "tresorerie-decouvert",
      gravite: "critique",
      source: "base",
      module: "Trésorerie",
      titre: "Trésorerie à découvert",
      detail: `Le plan prévoit un solde négatif à partir du ${new Date(`${tresorerie.premierDecouvert}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`,
      href: "/tresorerie/previsions",
    });
  }
  if (tresorerie.caissesSousSeuil.length > 0) {
    liste.push({
      id: "caisse-basse",
      gravite: "attention",
      source: "base",
      module: "Trésorerie",
      titre: "Caisse à réalimenter",
      detail: tresorerie.caissesSousSeuil.join(", "),
      href: "/tresorerie",
      nombre: tresorerie.caissesSousSeuil.length,
    });
  }
  if (tresorerie.bonsAApprouver > 0) {
    liste.push({
      id: "bons-attente",
      gravite: "attention",
      source: "base",
      module: "Trésorerie",
      titre: "Bons de caisse à approuver",
      detail: "Quelqu'un attend une décision pour être payé",
      href: "/tresorerie/caisse",
      nombre: tresorerie.bonsAApprouver,
    });
  }
  if (tresorerie.bonsADecaisser > 0) {
    liste.push({
      id: "bons-a-decaisser",
      gravite: "information",
      source: "base",
      module: "Trésorerie",
      titre: "Bons approuvés à décaisser",
      detail: "Approuvés, l'argent n'est pas encore sorti",
      href: "/tresorerie/caisse",
      nombre: tresorerie.bonsADecaisser,
    });
  }
  if (tresorerie.avancesEchues > 0) {
    liste.push({
      id: "avances",
      gravite: "attention",
      source: "base",
      module: "Trésorerie",
      titre: "Avances non soldées",
      detail: `${tresorerie.montantAvancesEchues.toLocaleString("fr-FR")} FCFA à récupérer ou justifier`,
      href: "/tresorerie/caisse",
      nombre: tresorerie.avancesEchues,
    });
  }
  if (tresorerie.virementsEnTransit > 0) {
    liste.push({
      id: "virements-transit",
      gravite: "attention",
      source: "base",
      module: "Trésorerie",
      titre: "Virements en route depuis plus de 3 jours",
      detail: "Vérifiez que le compte destinataire a bien été crédité",
      href: "/tresorerie/virements",
      nombre: tresorerie.virementsEnTransit,
    });
  }

  // -------------------------------------------------------------- actifs
  if (parc.echeancesDepassees > 0) {
    liste.push({
      id: "echeances",
      gravite: "critique",
      source: "base",
      module: "Actifs / Biens",
      titre: "Échéances dépassées",
      // Rouler sans assurance ou sans visite valide n'est pas un retard
      // administratif : c'est une immobilisation au premier contrôle.
      detail: "Assurance, visite technique ou entretien au compteur",
      href: "/actifs/echeances",
      nombre: parc.echeancesDepassees,
    });
  }

  if (parc.indisponibles > 0) {
    liste.push({
      id: "actifs-indisponibles",
      gravite: "information",
      source: "base",
      module: "Actifs / Biens",
      titre: "Actifs indisponibles",
      detail: "En entretien ou immobilisés",
      href: "/actifs",
      nombre: parc.indisponibles,
    });
  }

  // ----------------------------------------------------------- locations
  if (reservations.locationsEnRetard > 0) {
    liste.push({
      id: "locations-retard",
      gravite: "critique",
      source: "base",
      module: "Réservations",
      titre: "Matériel non restitué",
      detail: "Immobilisé chez un client, non louable",
      href: "/reservations",
      nombre: reservations.locationsEnRetard,
    });
  }

  if (reservations.abonnementsEpuises > 0) {
    liste.push({
      id: "abonnements",
      gravite: "information",
      source: "base",
      module: "Réservations",
      titre: "Abonnements épuisés",
      detail: "Accès refusé à l'accueil, à renouveler",
      href: "/reservations/abonnements",
      nombre: reservations.abonnementsEpuises,
    });
  }

  // ------------------------------------------------------------ missions
  if (missions.echouees > 0) {
    liste.push({
      id: "missions-echouees",
      gravite: "attention",
      source: "base",
      module: "Missions",
      titre: "Missions échouées",
      detail: "À reprogrammer",
      href: "/missions",
      nombre: missions.echouees,
    });
  }

  if (missions.enRetard > 0) {
    liste.push({
      id: "missions-retard",
      gravite: "attention",
      source: "base",
      module: "Missions",
      titre: "Missions en retard",
      detail: "Échéance dépassée, preuves du terrain attendues",
      href: "/missions",
      nombre: missions.enRetard,
    });
  }

  return liste.sort((a, b) => ORDRE_GRAVITE[a.gravite] - ORDRE_GRAVITE[b.gravite]);
}

export interface Tresorerie {
  libelle: string;
  montant: number;
  detail: string;
}

/**
 * Où se trouve l'argent, à l'instant.
 *
 * Déduit du grand livre et non d'un solde tenu à part : la trésorerie est la
 * conséquence des écritures, donc elle est vraie par construction. Un montant
 * stocké à côté finit toujours par diverger — il suffit d'un règlement saisi
 * en comptabilité sans repasser par l'écran qui entretenait le chiffre.
 *
 * Les trois lignes couvrent exactement les comptes que `positionComptable`
 * additionne — 52, 53, 57. Le total du tableau de bord et celui de l'écran de
 * comptabilité doivent tomber sur le même franc : deux chiffres différents pour
 * le même argent, et plus personne ne croit ni l'un ni l'autre.
 *
 * Le float du guichet et les caisses de dépenses reviendront ici quand leurs
 * modules liront la base. D'ici là, ce qui n'est pas comptabilisé ne s'affiche
 * pas — c'est écrit sous les cartes, parce qu'un exploitant qui compte son
 * tiroir doit savoir pourquoi l'écran annonce autre chose.
 */
export function tresorerie(soldes: SoldeCompte[]): Tresorerie[] {
  // Solde débiteur : une caisse qui doit plus qu'elle n'a reçu n'existe pas.
  // Un négatif signale une erreur de saisie, et s'affiche tel quel plutôt que
  // d'être ramené à zéro — le masquer laisserait l'erreur courir.
  const cumul = (prefixe: string) =>
    soldes
      .filter((s) => s.compte.startsWith(prefixe))
      .reduce((somme, s) => somme + s.debit - s.credit, 0);

  // La caisse et le mobile money encaissés au comptoir ou sur facture passent
  // au 5711 « Caisse Mobile Money » : c'est de l'argent électronique, pas des
  // billets dans le tiroir. Le compter en caisse ferait chercher au caissier,
  // le soir, des espèces qui n'ont jamais existé.
  // Le float du guichet de transfert (5712) est lui aussi de la monnaie
  // électronique, détenue chez les opérateurs.
  const mobile = cumul("5711") + cumul("5712");
  // Le 585 porte l'argent parti d'un compte et pas encore arrivé sur l'autre :
  // il existe toujours, il est en route. L'oublier ferait croire à une perte
  // le temps qu'un versement soit crédité.
  const enRoute = cumul("585");

  return [
    { libelle: "Banque", montant: cumul("52") + cumul("53"), detail: "Comptes 52 et 53" },
    {
      libelle: "Mobile money",
      montant: cumul("55") + mobile,
      detail: "Comptes 55, 5711 et 5712",
    },
    { libelle: "Caisse", montant: cumul("57") - mobile, detail: "Comptes 57, hors 5711 et 5712" },
    ...(enRoute !== 0 ? [{ libelle: "En route", montant: enRoute, detail: "Virements internes non arrivés (585)" }] : []),
  ];
}

/**
 * Chiffres du jour, pour juger l'activité sans ouvrir un module.
 *
 * La valeur du stock arrive du dehors : elle se lit en base, au coût moyen
 * pondéré. Elle était auparavant estimée au prix de VENTE — ce qui affichait la
 * marge future comme si elle était déjà acquise, et gonflait le patrimoine de
 * l'entreprise d'un tiers.
 */
export interface ActiviteDuJour {
  /** Encaissé en caisse depuis l'ouverture de la journée. */
  encaisse: number;
  /** Nombre de tickets, pour situer le montant. */
  tickets: number;
  /** Créances clients ouvertes : lignes 41 non lettrées. */
  creances: number;
  /** Valeur du stock au coût moyen pondéré. */
  valeurStock: number;
}

/**
 * De quoi juger la journée.
 *
 * Les quatre chiffres viennent de la base — caisse, grand livre, stock. Aucun
 * n'est une projection ni une moyenne : ce sont des sommes d'écritures, à
 * l'unité près, comme l'exige la règle de l'argent entier.
 */
export function activiteDuJour(
  caisse: { chiffreAffaires: number; tickets: number },
  creances: number,
  valeurStock: number,
): ActiviteDuJour {
  return {
    encaisse: caisse.chiffreAffaires,
    tickets: caisse.tickets,
    creances,
    valeurStock,
  };
}
