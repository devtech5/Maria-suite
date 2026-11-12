/**
 * États financiers SYSCOHADA, déduits des soldes de comptes.
 *
 * Rien n'est stocké ici : un solde conservé à côté des écritures qui le
 * composent finit toujours par diverger. Le compte de résultat est la
 * conséquence des lignes, donc il est vrai par construction.
 *
 * Ce fichier ne dépend ni de la base ni de React : c'est du calcul, et il se
 * teste comme tel.
 */

export interface SoldeCompte {
  /** Numéro du compte général : 701, 6031, 4431… */
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}

/**
 * Solde d'une charge : ce qu'elle a coûté.
 *
 * Un compte de charge se meut au débit ; le crédit n'y apparaît qu'en
 * annulation — un avoir fournisseur, une régularisation. La différence est
 * donc la charge réelle de la période, et non le seul cumul des débits.
 */
function soldeDebiteur(soldes: readonly SoldeCompte[], ...prefixes: string[]): number {
  return cumul(soldes, prefixes, (s) => s.debit - s.credit);
}

/** Solde d'un produit : ce qu'il a rapporté. Symétrique du précédent. */
function soldeCrediteur(soldes: readonly SoldeCompte[], ...prefixes: string[]): number {
  return cumul(soldes, prefixes, (s) => s.credit - s.debit);
}

function cumul(
  soldes: readonly SoldeCompte[],
  prefixes: readonly string[],
  sens: (solde: SoldeCompte) => number,
): number {
  let total = 0;

  for (const solde of soldes) {
    if (prefixes.some((prefixe) => solde.compte.startsWith(prefixe))) {
      total += sens(solde);
    }
  }

  return total;
}

export interface ElementsResultat {
  ventesMarchandises: number;
  ventesServices: number;
  autresProduits: number;
  achatsMarchandises: number;
  /**
   * Variation de stock de marchandises, au sens comptable : un compte 603
   * débiteur signifie que le stock a diminué, donc que la consommation
   * dépasse les achats. Il vient donc EN MOINS de la marge.
   */
  variationStocksMarchandises: number;
  achatsMatieres: number;
  servicesExterieurs: number;
  impotsEtTaxes: number;
  chargesPersonnel: number;
  autresCharges: number;
  dotations: number;
  produitsFinanciers: number;
  chargesFinancieres: number;
  produitsHao: number;
  chargesHao: number;
  participation: number;
  impotResultat: number;
}

/**
 * Range les soldes de comptes dans les postes du compte de résultat.
 *
 * La ventilation suit les classes du plan SYSCOHADA révisé. Elle est écrite
 * par préfixe et non par liste de comptes : une entreprise ouvre ses propres
 * sous-comptes — un 6021 « Emballages », un 7011 « Ventes boutique » — et ils
 * doivent tomber dans le bon poste sans qu'on ait rien à déclarer.
 */
export function elementsResultat(soldes: readonly SoldeCompte[]): ElementsResultat {
  return {
    // ------------------------------------------------------------- produits
    ventesMarchandises: soldeCrediteur(soldes, "701"),
    // 702 à 706 : produits fabriqués, travaux et services vendus.
    ventesServices: soldeCrediteur(soldes, "702", "703", "704", "705", "706"),
    // 71 subventions, 72 production immobilisée, 73 variation de stocks de
    // produits, 75 autres produits, 78 transferts de charges.
    autresProduits: soldeCrediteur(soldes, "71", "72", "73", "75", "78"),

    // -------------------------------------------------------------- charges
    achatsMarchandises: soldeDebiteur(soldes, "601"),
    variationStocksMarchandises: soldeDebiteur(soldes, "6031"),
    achatsMatieres: soldeDebiteur(soldes, "602", "604", "605", "608", "6032", "6033"),
    // 61 transports, 62 et 63 services extérieurs.
    servicesExterieurs: soldeDebiteur(soldes, "61", "62", "63"),
    impotsEtTaxes: soldeDebiteur(soldes, "64"),
    chargesPersonnel: soldeDebiteur(soldes, "66"),
    autresCharges: soldeDebiteur(soldes, "65"),
    // 68 dotations aux amortissements, 69 dotations aux provisions.
    dotations: soldeDebiteur(soldes, "68", "69"),

    // ------------------------------------------------------------ financier
    produitsFinanciers: soldeCrediteur(soldes, "77"),
    chargesFinancieres: soldeDebiteur(soldes, "67"),

    // ----------------------------------------------------------------- HAO
    // Hors activités ordinaires : cessions d'immobilisations, indemnités,
    // subventions d'équilibre. Ce qui ne se reproduira pas l'an prochain.
    produitsHao: soldeCrediteur(soldes, "82", "84", "86", "88"),
    chargesHao: soldeDebiteur(soldes, "81", "83", "85"),

    participation: soldeDebiteur(soldes, "87"),
    impotResultat: soldeDebiteur(soldes, "89"),
  };
}

/**
 * L'opposé d'un montant, sans zéro négatif.
 *
 * `-0` existe en JavaScript, pas en comptabilité : il s'affiche « -0 » sur un
 * poste vide, et il se compare mal dès qu'un export ou un test le rencontre.
 */
function oppose(montant: number): number {
  return montant === 0 ? 0 : -montant;
}

export interface SoldeGestion {
  /** Code du compte de résultat AUDCIF : XA, XB… XI. */
  code: string;
  libelle: string;
  montant: number;
  /** Un solde intermédiaire est mis en avant, un détail ne l'est pas. */
  cle?: boolean;
}

/**
 * La cascade des soldes intermédiaires de gestion.
 *
 * Chaque solde découle du précédent, aucun n'est recopié. Le concurrent
 * affiche une valeur ajoutée strictement égale à son excédent brut
 * d'exploitation, et un résultat d'exploitation égal au résultat net : c'est
 * arithmétiquement impossible dès qu'il y a un collaborateur ou un impôt. Les cases
 * sont remplies avec la même valeur, la cascade n'est pas calculée.
 *
 * Les codes sont ceux du compte de résultat AUDCIF, pour qu'un comptable
 * retrouve ses repères et qu'une liasse puisse être rapprochée ligne à ligne.
 */
export function calculerSIG(e: ElementsResultat): SoldeGestion[] {
  const margeCommerciale =
    e.ventesMarchandises - e.achatsMarchandises - e.variationStocksMarchandises;

  const chiffreAffaires = e.ventesMarchandises + e.ventesServices;

  const valeurAjoutee =
    margeCommerciale +
    e.ventesServices +
    e.autresProduits -
    e.achatsMatieres -
    e.servicesExterieurs;

  const excedentBrut = valeurAjoutee - e.impotsEtTaxes - e.chargesPersonnel;
  const resultatExploitation = excedentBrut - e.autresCharges - e.dotations;
  const resultatFinancier = e.produitsFinanciers - e.chargesFinancieres;
  const resultatOrdinaire = resultatExploitation + resultatFinancier;
  const resultatHao = e.produitsHao - e.chargesHao;
  const resultatNet = resultatOrdinaire + resultatHao - e.participation - e.impotResultat;

  return [
    { code: "TA", libelle: "Ventes de marchandises", montant: e.ventesMarchandises },
    { code: "RA", libelle: "Achats de marchandises", montant: oppose(e.achatsMarchandises) },
    {
      code: "RB",
      libelle: "Variation de stocks de marchandises",
      montant: oppose(e.variationStocksMarchandises),
    },
    { code: "XA", libelle: "Marge commerciale", montant: margeCommerciale, cle: true },
    { code: "TB", libelle: "Travaux et services vendus", montant: e.ventesServices },
    { code: "XB", libelle: "Chiffre d'affaires", montant: chiffreAffaires, cle: true },
    { code: "TH", libelle: "Autres produits", montant: e.autresProduits },
    { code: "RC", libelle: "Achats de matières et fournitures", montant: oppose(e.achatsMatieres) },
    { code: "RD", libelle: "Services extérieurs", montant: oppose(e.servicesExterieurs) },
    { code: "XC", libelle: "Valeur ajoutée", montant: valeurAjoutee, cle: true },
    { code: "RE", libelle: "Impôts et taxes", montant: oppose(e.impotsEtTaxes) },
    { code: "RF", libelle: "Charges de personnel", montant: oppose(e.chargesPersonnel) },
    { code: "XD", libelle: "Excédent brut d'exploitation", montant: excedentBrut, cle: true },
    { code: "RG", libelle: "Autres charges", montant: oppose(e.autresCharges) },
    { code: "RH", libelle: "Dotations aux amortissements et provisions", montant: oppose(e.dotations) },
    {
      code: "XE",
      libelle: "Résultat d'exploitation",
      montant: resultatExploitation,
      cle: true,
    },
    { code: "TK", libelle: "Revenus financiers", montant: e.produitsFinanciers },
    { code: "RK", libelle: "Frais financiers", montant: oppose(e.chargesFinancieres) },
    { code: "XF", libelle: "Résultat financier", montant: resultatFinancier, cle: true },
    {
      code: "XG",
      libelle: "Résultat des activités ordinaires",
      montant: resultatOrdinaire,
      cle: true,
    },
    {
      code: "XH",
      libelle: "Résultat hors activités ordinaires",
      montant: resultatHao,
      cle: true,
    },
    { code: "RM", libelle: "Participation des travailleurs", montant: oppose(e.participation) },
    { code: "RN", libelle: "Impôt sur le résultat", montant: oppose(e.impotResultat) },
    { code: "XI", libelle: "Résultat net", montant: resultatNet, cle: true },
  ];
}

/**
 * Position de trésorerie et comptes de tiers, pour la tête d'écran.
 *
 * La trésorerie est un solde débiteur : une caisse doit plus qu'elle n'a reçu
 * n'existe pas — un solde négatif signale une erreur de saisie, pas un
 * découvert, et il faut donc l'afficher tel quel plutôt que de le masquer.
 */
export interface PositionComptable {
  tresorerie: number;
  creancesClients: number;
  dettesFournisseurs: number;
  tvaDue: number;
}

export function positionComptable(soldes: readonly SoldeCompte[]): PositionComptable {
  return {
    // 52 banques, 53 établissements financiers, 57 caisse. La classe 5 entière
    // couvrirait aussi les valeurs mobilières de placement, qui ne sont pas
    // de la trésorerie disponible.
    tresorerie: soldeDebiteur(soldes, "52", "53", "57"),
    creancesClients: soldeDebiteur(soldes, "41"),
    dettesFournisseurs: soldeCrediteur(soldes, "40"),
    // 443 TVA facturée moins 445 TVA récupérable, plus ce que les déclarations
    // ont déjà liquidé : 4441 TVA due, moins 4449 crédit à reporter.
    tvaDue: soldeCrediteur(soldes, "443", "4441") - soldeDebiteur(soldes, "445", "4449"),
  };
}
