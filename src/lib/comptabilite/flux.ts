/**
 * Tableau des flux de trésorerie (TFT) du SYSCOHADA révisé, méthode indirecte.
 *
 * Comme le bilan et le compte de résultat, il se déduit des comptes et ne se
 * stocke pas. Il part de la capacité d'autofinancement globale (CAFG) et la
 * corrige de tout ce qui a bougé au bilan pendant l'exercice : besoin de
 * financement, investissements, capitaux propres, emprunts.
 *
 * Sa preuve est la trésorerie nette de clôture : ZH = ZA + ZG doit retomber
 * sur les comptes de la classe 5 au 31 décembre. Un mouvement qu'aucune ligne
 * ne classe — un compte hors du modèle, une dotation passée par un compte
 * inattendu — produit un écart. Il est rendu tel quel, jamais réparti sur une
 * ligne pour faire tomber le total juste.
 *
 * Ce fichier ne dépend ni de la base ni de React.
 */

import type { SoldeCompte } from "./etats";

export interface DonneesFlux {
  /** Débit et crédit de l'exercice par compte, écriture de clôture exclue. */
  mouvements: readonly SoldeCompte[];
  /** Soldes cumulés à la veille du 1er janvier : la situation d'ouverture. */
  soldesDebut: readonly SoldeCompte[];
  /** Soldes cumulés au 31 décembre. */
  soldesFin: readonly SoldeCompte[];
  /**
   * Crédits portés sur les immobilisations brutes (21 à 27) par les écritures
   * de cession de l'exercice : la valeur d'origine des biens sortis. Sans
   * elle, une cession se lirait comme une acquisition en moins.
   */
  sortiesCessions: readonly SoldeCompte[];
}

export interface LigneFlux {
  /** Référence du modèle : ZA, FA… ZH. */
  code: string;
  libelle: string;
  /** Effet sur la trésorerie : positif s'il en apporte, négatif s'il en consomme. */
  montant: number;
  /** Lettre des sous-totaux du modèle (A à H). */
  lettre?: string;
  /** Sous-total ou total, mis en avant. */
  total?: boolean;
}

export interface FluxTresorerie {
  lignes: LigneFlux[];
  /** Trésorerie nette (actif moins passif) au 1er janvier, lue dans la classe 5. */
  tresorerieDebut: number;
  /** Trésorerie nette au 31 décembre, lue dans la classe 5 : le contrôle de ZH. */
  tresorerieFin: number;
  /** Variation réelle moins variation expliquée (ZG). Zéro quand tout est classé. */
  ecart: number;
}

/** Une écriture de cession : elle sort la valeur comptable d'un bien en 81 (HAO) ou 654 (courante). */
export function estEcritureDeCession(comptes: readonly string[]): boolean {
  return comptes.some((c) => c.startsWith("81") || c.startsWith("654"));
}

const correspond = (compte: string, prefixes: readonly string[]) => prefixes.some((p) => compte.startsWith(p));

/** Somme d'un côté des comptes retenus : préfixes inclus, sauf ceux de `sauf`. */
function somme(
  soldes: readonly SoldeCompte[],
  prefixes: readonly string[],
  valeur: (s: SoldeCompte) => number,
  sauf: readonly string[] = [],
): number {
  let total = 0;
  for (const s of soldes) {
    if (correspond(s.compte, prefixes) && !correspond(s.compte, sauf)) total += valeur(s);
  }
  return total;
}

/** L'opposé d'un montant, sans zéro négatif. */
const oppose = (montant: number) => (montant === 0 ? 0 : -montant);
const propre = (montant: number) => (montant === 0 ? 0 : montant);

// --------------------------------------------------------- classement des comptes

/** Tiers rattachés aux investissements : fournisseurs d'immobilisations, créances sur cessions. */
const TIERS_INVESTISSEMENT = ["481", "482", "485"] as const;
/** Tiers rattachés aux capitaux propres : apporteurs, dividendes à payer. */
const TIERS_CAPITAUX = ["461", "465"] as const;
/** Subventions d'investissement à recevoir de l'État. */
const SUBVENTION_A_RECEVOIR = "4494";
/** Actif circulant HAO hors cessions d'immobilisations. */
const ACTIF_CIRCULANT_HAO = "488";
/** Dépréciations des comptes de tiers : elles suivent les créances qu'elles corrigent. */
const DEPRECIATIONS_TIERS = "49";
/** Comptes de tiers de l'activité : ce qui forme le besoin de financement. */
const TIERS_EXCLUS = [...TIERS_INVESTISSEMENT, ...TIERS_CAPITAUX, SUBVENTION_A_RECEVOIR, ACTIF_CIRCULANT_HAO, DEPRECIATIONS_TIERS];

/** Charges et produits calculés, que la CAFG écarte. */
const DOTATIONS = ["68", "69", "85"] as const;
const REPRISES = ["79", "86"] as const;
const VALEURS_CEDEES = ["654", "81"] as const;
const PRODUITS_CESSIONS = ["754", "82"] as const;

interface Categorie {
  brut: readonly string[];
  fournisseurs: readonly string[];
  fournisseursSauf?: readonly string[];
}
const INCORPORELLES: Categorie = { brut: ["21"], fournisseurs: ["4811"] };
const CORPORELLES: Categorie = { brut: ["22", "23", "24", "25"], fournisseurs: ["481", "482"], fournisseursSauf: ["4811"] };

/**
 * Capacité d'autofinancement globale de l'exercice : le résultat net, sans
 * les charges et produits calculés (dotations, reprises) ni le résultat des
 * cessions, qui relèvent de l'investissement.
 */
export function capaciteAutofinancement(mouvements: readonly SoldeCompte[]): number {
  const net = (prefixes: readonly string[]) => somme(mouvements, prefixes, (s) => s.debit - s.credit);
  return propre(oppose(net(["6", "7", "8"])) + net(DOTATIONS) + net(REPRISES) + net(VALEURS_CEDEES) + net(PRODUITS_CESSIONS));
}

/** Trésorerie nette : solde de la classe 5, actif moins passif. */
const tresorerieNette = (soldes: readonly SoldeCompte[]) => somme(soldes, ["5"], (s) => s.debit - s.credit);

/** Créances (soldes débiteurs) et dettes (soldes créditeurs) des tiers de l'activité, compte par compte. */
function tiersParSens(soldes: readonly SoldeCompte[]): { creances: number; dettes: number } {
  let creances = 0;
  let dettes = 0;
  for (const s of soldes) {
    if (!s.compte.startsWith("4") || correspond(s.compte, TIERS_EXCLUS)) continue;
    const solde = s.debit - s.credit;
    if (solde > 0) creances += solde;
    else dettes -= solde;
  }
  return { creances, dettes };
}

/**
 * Le TFT de l'exercice.
 *
 * Les signes suivent le modèle : une ligne « − Variation des stocks » vaut
 * −150 000 quand les stocks ont monté de 150 000, puisque cette hausse a
 * consommé de la trésorerie.
 */
export function calculerFluxTresorerie(d: DonneesFlux): FluxTresorerie {
  const m = d.mouvements;
  /** Mouvement net débiteur de l'exercice. */
  const net = (prefixes: readonly string[], sauf: readonly string[] = []) => somme(m, prefixes, (s) => s.debit - s.credit, sauf);
  const debits = (prefixes: readonly string[]) => somme(m, prefixes, (s) => s.debit);
  const credits = (prefixes: readonly string[]) => somme(m, prefixes, (s) => s.credit);
  const sorties = (prefixes: readonly string[]) => somme(d.sortiesCessions, prefixes, (s) => s.credit);

  // ------------------------------------------------- activités opérationnelles
  const cafg = capaciteAutofinancement(m);
  const actifHao = oppose(net([ACTIF_CIRCULANT_HAO]));
  const stocks = oppose(net(["3"]));
  const debut = tiersParSens(d.soldesDebut);
  const fin = tiersParSens(d.soldesFin);
  const creances = oppose(fin.creances - debut.creances + net([DEPRECIATIONS_TIERS]));
  const passifCirculant = fin.dettes - debut.dettes;
  const operationnel = cafg + actifHao + stocks + creances + passifCirculant;

  // --------------------------------------------------- activités d'investissement
  // Acquisition = variation du brut + valeur d'origine des biens sortis ; la
  // part restant due au fournisseur d'immobilisations n'est pas décaissée.
  const acquises = (c: Categorie) => net(c.brut) + sorties(c.brut) + net(c.fournisseurs, c.fournisseursSauf);
  const incorporelles = oppose(acquises(INCORPORELLES));
  const corporelles = oppose(acquises(CORPORELLES));
  // Un prêt accordé (27) se rembourse : tout crédit qui n'est pas une cession est un encaissement.
  const financieres = oppose(net(["26"]) + sorties(["26"]) + debits(["27"]));
  const cessionsCorporelles = oppose(net(["754", "821", "822"]) + net(["485"]));
  const cessionsFinancieres = oppose(net(["826"])) + credits(["27"]) - sorties(["27"]);
  const investissement = incorporelles + corporelles + financieres + cessionsCorporelles + cessionsFinancieres;

  // ------------------------------------------------------ capitaux propres
  // Capital, réserves, report et résultat ne bougent entre eux qu'à l'affectation,
  // sans trésorerie ; ce qui en sort vers les associés passe par 465.
  const capitalNet = oppose(net(["10", "11", "12", "13", "461"])) + credits(["465"]);
  const apports = Math.max(capitalNet, 0);
  const prelevements = Math.min(capitalNet, 0);
  const subventions = oppose(net(["14", SUBVENTION_A_RECEVOIR, "799"]));
  const dividendes = oppose(debits(["465"]));
  const capitauxPropres = apports + subventions + prelevements + dividendes;

  // ---------------------------------------------------- capitaux étrangers
  const emprunts = credits(["16"]);
  const autresDettes = credits(["17", "18"]);
  const remboursements = oppose(debits(["16", "17", "18"]));
  const capitauxEtrangers = emprunts + autresDettes + remboursements;

  const financement = capitauxPropres + capitauxEtrangers;
  const variation = operationnel + investissement + financement;
  const tresorerieDebut = tresorerieNette(d.soldesDebut);
  const tresorerieFin = tresorerieNette(d.soldesFin);

  const lignes: LigneFlux[] = [
    { code: "ZA", lettre: "A", libelle: "Trésorerie nette au 1er janvier (trésorerie actif N-1 − trésorerie passif N-1)", montant: tresorerieDebut, total: true },
    { code: "FA", libelle: "Capacité d'autofinancement globale (CAFG)", montant: cafg },
    { code: "FB", libelle: "− Actif circulant HAO", montant: actifHao },
    { code: "FC", libelle: "− Variation des stocks", montant: stocks },
    { code: "FD", libelle: "− Variation des créances", montant: creances },
    { code: "FE", libelle: "+ Variation du passif circulant", montant: passifCirculant },
    { code: "ZB", lettre: "B", libelle: "Flux de trésorerie provenant des activités opérationnelles (somme FA à FE)", montant: operationnel, total: true },
    { code: "FF", libelle: "− Décaissements liés aux acquisitions d'immobilisations incorporelles", montant: incorporelles },
    { code: "FG", libelle: "− Décaissements liés aux acquisitions d'immobilisations corporelles", montant: corporelles },
    { code: "FH", libelle: "− Décaissements liés aux acquisitions d'immobilisations financières", montant: financieres },
    { code: "FI", libelle: "+ Encaissements liés aux cessions d'immobilisations incorporelles et corporelles", montant: cessionsCorporelles },
    { code: "FJ", libelle: "+ Encaissements liés aux cessions d'immobilisations financières", montant: cessionsFinancieres },
    { code: "ZC", lettre: "C", libelle: "Flux de trésorerie provenant des activités d'investissement (somme FF à FJ)", montant: investissement, total: true },
    { code: "FK", libelle: "+ Augmentations de capital par apports nouveaux", montant: apports },
    { code: "FL", libelle: "+ Subventions d'investissement reçues", montant: subventions },
    { code: "FM", libelle: "− Prélèvements sur le capital", montant: prelevements },
    { code: "FN", libelle: "− Dividendes versés", montant: dividendes },
    { code: "ZD", lettre: "D", libelle: "Flux de trésorerie provenant des capitaux propres (somme FK à FN)", montant: capitauxPropres, total: true },
    { code: "FO", libelle: "+ Emprunts", montant: emprunts },
    { code: "FP", libelle: "+ Autres dettes financières", montant: autresDettes },
    { code: "FQ", libelle: "− Remboursements des emprunts et autres dettes financières", montant: remboursements },
    { code: "ZE", lettre: "E", libelle: "Flux de trésorerie provenant des capitaux étrangers (somme FO à FQ)", montant: capitauxEtrangers, total: true },
    { code: "ZF", lettre: "F", libelle: "Flux de trésorerie provenant des activités de financement (D + E)", montant: financement, total: true },
    { code: "ZG", lettre: "G", libelle: "Variation de la trésorerie nette de la période (B + C + F)", montant: variation, total: true },
    { code: "ZH", lettre: "H", libelle: "Trésorerie nette au 31 décembre (G + A)", montant: variation + tresorerieDebut, total: true },
  ];

  return {
    lignes: lignes.map((l) => ({ ...l, montant: propre(l.montant) })),
    tresorerieDebut,
    tresorerieFin,
    ecart: propre(tresorerieFin - tresorerieDebut - variation),
  };
}
