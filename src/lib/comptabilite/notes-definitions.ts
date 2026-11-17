/**
 * Contenu des notes annexes du lot 1 : quels comptes chaque note détaille.
 *
 * Écrit par préfixe, comme le compte de résultat : les sous-comptes qu'ouvre
 * l'entreprise tombent dans la bonne rubrique sans rien déclarer. Le côté
 * (`cote`) reprend le classement du bilan : un compte de tiers ou de
 * trésorerie ne figure dans une note d'actif que débiteur, dans une note de
 * passif que créditeur — c'est ce qui fait retomber chaque note sur son poste.
 */

export type Sens = "debit" | "credit";

export interface Rubrique {
  libelle: string;
  prefixes: readonly string[];
  sauf?: readonly string[];
  /** Sens de lecture, s'il diffère de celui de la note (charges et produits d'une même note). */
  sens?: Sens;
  /** Ne retient un compte que si son solde est de ce côté. */
  cote?: Sens;
}

export type DefinitionNote =
  | { genre: "soldes"; numero: string; titre: string; source: "bilan" | "resultat"; sens: Sens; rubriques: readonly Rubrique[]; libelleTotal?: string }
  | { genre: "mouvements"; numero: string; titre: string; sens: Sens; rubriques: readonly Rubrique[]; augmentations?: string; diminutions?: string }
  | { genre: "cessions"; numero: "3D" }
  | { genre: "synthese"; numero: "34" };

const actif = (numero: string, titre: string, rubriques: Rubrique[]): DefinitionNote => ({ genre: "soldes", numero, titre, source: "bilan", sens: "debit", rubriques });
const passif = (numero: string, titre: string, rubriques: Rubrique[]): DefinitionNote => ({ genre: "soldes", numero, titre, source: "bilan", sens: "credit", rubriques });
const charges = (numero: string, titre: string, rubriques: Rubrique[]): DefinitionNote => ({ genre: "soldes", numero, titre, source: "resultat", sens: "debit", rubriques });

export const DEFINITIONS_NOTES: readonly DefinitionNote[] = [
  {
    genre: "mouvements",
    numero: "3A",
    titre: "Immobilisations brutes",
    sens: "debit",
    rubriques: [
      { libelle: "Immobilisations incorporelles", prefixes: ["21"] },
      { libelle: "Immobilisations corporelles", prefixes: ["22", "23", "24", "25"] },
      { libelle: "Immobilisations financières", prefixes: ["26", "27"] },
    ],
  },
  {
    genre: "mouvements",
    numero: "3C",
    titre: "Amortissements",
    sens: "credit",
    augmentations: "Dotations",
    diminutions: "Sorties",
    rubriques: [
      { libelle: "Amortissements des immobilisations incorporelles", prefixes: ["281"] },
      { libelle: "Amortissements des immobilisations corporelles", prefixes: ["282", "283", "284"] },
    ],
  },
  { genre: "cessions", numero: "3D" },
  actif("4", "Immobilisations financières", [
    { libelle: "Titres de participation", prefixes: ["26"] },
    { libelle: "Autres immobilisations financières", prefixes: ["27"] },
    { libelle: "Dépréciations", prefixes: ["296", "297"] },
  ]),
  actif("5", "Actif circulant HAO", [
    { libelle: "Créances sur cessions d'immobilisations", prefixes: ["485"], cote: "debit" },
    { libelle: "Autres créances HAO", prefixes: ["488"], cote: "debit" },
    { libelle: "Dépréciations", prefixes: ["498"] },
  ]),
  actif("6", "Stocks et encours", [
    { libelle: "Marchandises", prefixes: ["31"] },
    { libelle: "Matières premières et fournitures liées", prefixes: ["32"] },
    { libelle: "Autres approvisionnements", prefixes: ["33"] },
    { libelle: "Produits en cours", prefixes: ["34"] },
    { libelle: "Services en cours", prefixes: ["35"] },
    { libelle: "Produits finis", prefixes: ["36"] },
    { libelle: "Produits intermédiaires et résiduels", prefixes: ["37"] },
    { libelle: "Stocks en cours de route, en consignation ou en dépôt", prefixes: ["38"] },
    { libelle: "Dépréciations des stocks", prefixes: ["39"] },
  ]),
  actif("7", "Clients", [
    { libelle: "Clients", prefixes: ["41"], cote: "debit" },
    { libelle: "Dépréciations des comptes clients", prefixes: ["491"] },
  ]),
  actif("8", "Autres créances", [
    { libelle: "Fournisseurs débiteurs, avances et acomptes versés", prefixes: ["40"], cote: "debit" },
    { libelle: "Personnel", prefixes: ["42"], cote: "debit" },
    { libelle: "Organismes sociaux", prefixes: ["43"], cote: "debit" },
    { libelle: "État et collectivités publiques", prefixes: ["44"], cote: "debit" },
    { libelle: "Autres débiteurs et comptes de régularisation", prefixes: ["45", "46", "47", "48"], sauf: ["478", "485", "488"], cote: "debit" },
    { libelle: "Dépréciations", prefixes: ["490", "492", "493", "494", "495", "496", "497"] },
  ]),
  actif("9", "Titres de placement", [
    { libelle: "Titres de placement", prefixes: ["50"], cote: "debit" },
    { libelle: "Dépréciations", prefixes: ["590"] },
  ]),
  actif("10", "Valeurs à encaisser", [
    { libelle: "Valeurs à encaisser", prefixes: ["51"], cote: "debit" },
    { libelle: "Dépréciations", prefixes: ["591"] },
  ]),
  actif("11", "Disponibilités", [
    { libelle: "Banques, chèques postaux, établissements financiers", prefixes: ["52", "53", "54", "55", "56"], cote: "debit" },
    { libelle: "Caisse", prefixes: ["57"], cote: "debit" },
    { libelle: "Régies d'avances, accréditifs et virements internes", prefixes: ["58"], cote: "debit" },
    { libelle: "Dépréciations", prefixes: ["592", "593", "594", "595", "596", "597", "598", "599"] },
  ]),
  {
    genre: "soldes",
    numero: "12",
    titre: "Écarts de conversion",
    source: "bilan",
    sens: "debit",
    libelleTotal: "Écart net (actif − passif)",
    rubriques: [
      { libelle: "Écarts de conversion actif", prefixes: ["478"] },
      { libelle: "Écarts de conversion passif", prefixes: ["479"], sens: "credit" },
    ],
  },
  passif("14", "Primes et réserves", [
    { libelle: "Primes liées au capital", prefixes: ["105"] },
    { libelle: "Écarts de réévaluation", prefixes: ["106"] },
    { libelle: "Réserves", prefixes: ["11"] },
  ]),
  passif("15A", "Subventions d'investissement et provisions réglementées", [
    { libelle: "Subventions d'investissement", prefixes: ["14"] },
    { libelle: "Provisions réglementées et fonds assimilés", prefixes: ["15"] },
  ]),
  passif("16A", "Dettes financières et ressources assimilées", [
    { libelle: "Emprunts et dettes assimilées", prefixes: ["16"] },
    { libelle: "Dettes de location-acquisition", prefixes: ["17"] },
    { libelle: "Dettes liées à des participations et comptes de liaison", prefixes: ["18"] },
    { libelle: "Provisions pour risques et charges", prefixes: ["19"] },
  ]),
  passif("17", "Fournisseurs d'exploitation", [{ libelle: "Fournisseurs d'exploitation", prefixes: ["40"], cote: "credit" }]),
  passif("18", "Dettes fiscales et sociales", [
    { libelle: "Personnel", prefixes: ["42"], cote: "credit" },
    { libelle: "Organismes sociaux", prefixes: ["43"], cote: "credit" },
    { libelle: "État et collectivités publiques", prefixes: ["44"], cote: "credit" },
  ]),
  passif("19", "Autres dettes et provisions pour risques à court terme", [
    { libelle: "Clients, avances reçues", prefixes: ["41"], cote: "credit" },
    { libelle: "Autres créditeurs et comptes de régularisation", prefixes: ["45", "46", "47"], sauf: ["479"], cote: "credit" },
    { libelle: "Dettes circulantes HAO", prefixes: ["48"], cote: "credit" },
    { libelle: "Provisions pour risques à court terme", prefixes: ["499"], cote: "credit" },
  ]),
  passif("20", "Banques, crédits d'escompte et de trésorerie", [
    { libelle: "Banques, crédits d'escompte et de trésorerie", prefixes: ["5"], sauf: ["59"], cote: "credit" },
  ]),
  {
    genre: "soldes",
    numero: "21",
    titre: "Chiffre d'affaires et autres produits",
    source: "resultat",
    sens: "credit",
    rubriques: [
      { libelle: "Ventes de marchandises", prefixes: ["701"] },
      { libelle: "Ventes de produits fabriqués", prefixes: ["702", "703", "704"] },
      { libelle: "Travaux et services vendus", prefixes: ["705", "706"] },
      { libelle: "Produits accessoires", prefixes: ["707"] },
      { libelle: "Subventions d'exploitation", prefixes: ["71"] },
      { libelle: "Autres produits", prefixes: ["75"] },
    ],
  },
  charges("22", "Achats", [
    { libelle: "Achats de marchandises", prefixes: ["601"] },
    { libelle: "Achats de matières premières et fournitures liées", prefixes: ["602"] },
    { libelle: "Autres achats", prefixes: ["604", "605", "608"] },
    { libelle: "Variations de stocks", prefixes: ["603"] },
  ]),
  charges("23", "Transports", [{ libelle: "Transports", prefixes: ["61"] }]),
  charges("24", "Services extérieurs", [
    { libelle: "Services extérieurs", prefixes: ["62"] },
    { libelle: "Autres services extérieurs", prefixes: ["63"] },
  ]),
  charges("25", "Impôts et taxes", [{ libelle: "Impôts et taxes", prefixes: ["64"] }]),
  charges("26", "Autres charges", [{ libelle: "Autres charges", prefixes: ["65"] }]),
  charges("27A", "Charges de personnel", [{ libelle: "Charges de personnel", prefixes: ["66"] }]),
  {
    genre: "mouvements",
    numero: "28",
    titre: "Provisions et dépréciations inscrites au bilan",
    sens: "credit",
    augmentations: "Dotations",
    diminutions: "Reprises",
    rubriques: [
      { libelle: "Provisions réglementées", prefixes: ["15"] },
      { libelle: "Provisions pour risques et charges", prefixes: ["19"] },
      { libelle: "Dépréciations des immobilisations", prefixes: ["29"] },
      { libelle: "Dépréciations des stocks", prefixes: ["39"] },
      { libelle: "Dépréciations et provisions des comptes de tiers", prefixes: ["49"] },
      { libelle: "Dépréciations des titres de placement et de la trésorerie", prefixes: ["59"] },
    ],
  },
  {
    genre: "soldes",
    numero: "29",
    titre: "Charges et revenus financiers",
    source: "resultat",
    sens: "credit",
    libelleTotal: "Résultat financier",
    rubriques: [
      { libelle: "Revenus financiers", prefixes: ["77"] },
      { libelle: "Frais financiers", prefixes: ["67"], sens: "debit" },
    ],
  },
  {
    genre: "soldes",
    numero: "30",
    titre: "Autres charges et produits HAO",
    source: "resultat",
    sens: "credit",
    libelleTotal: "Solde HAO hors cessions",
    rubriques: [
      { libelle: "Produits HAO", prefixes: ["84", "86", "88"] },
      { libelle: "Charges HAO", prefixes: ["83", "85"], sens: "debit" },
    ],
  },
  { genre: "synthese", numero: "34" },
];
