/**
 * Prestataires externes : règles pures, sans dépendance.
 *
 * Un prestataire n'est ni un salarié ni un intervenant. L'intervenant est de
 * la main-d'œuvre que l'on pointe et paie à la journée ; le prestataire est un
 * indépendant ou une petite entreprise qui annonce un prix, réalise une
 * prestation et se fait payer pour elle : plombier, électricien, photographe,
 * monteur vidéo, graphiste, consultant.
 */

import type { Ecriture, LigneEcriture } from "@/lib/comptabilite/ecritures";

export const METIERS_COURANTS = [
  "Plombier",
  "Électricien",
  "Maçon",
  "Menuisier",
  "Peintre",
  "Climatisation / froid",
  "Informaticien",
  "Photographe",
  "Monteur vidéo",
  "Graphiste",
  "Imprimeur",
  "Transporteur",
  "Agent d'entretien",
  "Consultant",
  "Juriste / avocat",
  "Comptable",
] as const;

export const UNITES_TARIF = {
  heure: "de l'heure",
  jour: "la journée",
  prestation: "la prestation",
  forfait: "au forfait",
  metre_carre: "le m²",
} as const;

export type UniteTarif = keyof typeof UNITES_TARIF;

/**
 * Comptes de charge proposés, du référentiel SYSCOHADA. Une réparation de
 * plomberie et un reportage photo ne vont pas sur le même compte, et le
 * compte de résultat doit pouvoir les distinguer.
 */
export const COMPTES_CHARGE = {
  "624": "Entretien, réparations et maintenance",
  "621": "Sous-traitance générale",
  "6324": "Honoraires",
  "627": "Publicité, publications, relations publiques",
  "618": "Autres frais de transport",
  "6328": "Divers frais (intermédiaires et conseils)",
} as const;

export type CompteCharge = keyof typeof COMPTES_CHARGE;

/** Compte proposé d'après le métier. Le comptable peut toujours en choisir un autre. */
export function compteParDefaut(metier: string | null | undefined): CompteCharge {
  const m = (metier ?? "").toLowerCase();
  if (/photo|vid[ée]o|graphi|imprim|communic/.test(m)) return "627";
  if (/consult|avocat|juri|comptab|conseil/.test(m)) return "6324";
  if (/transport|livr/.test(m)) return "618";
  if (/plomb|[ée]lectri|ma[çc]on|menuis|peint|clim|froid|informat|entretien|r[ée]par/.test(m)) return "624";
  return "621";
}

export const STATUTS_PRESTATION = {
  demandee: "Demandée",
  confirmee: "Confirmée",
  realisee: "Réalisée",
  payee: "Payée",
  annulee: "Annulée",
} as const;

export type StatutPrestation = keyof typeof STATUTS_PRESTATION;

/** Ce qui peut suivre chaque état. Payée et annulée sont des fins. */
export const SUITES: Record<StatutPrestation, StatutPrestation[]> = {
  demandee: ["confirmee", "realisee", "annulee"],
  confirmee: ["realisee", "annulee"],
  realisee: ["payee"],
  payee: [],
  annulee: [],
};

export function transitionPermise(de: StatutPrestation, vers: StatutPrestation): boolean {
  return SUITES[de].includes(vers);
}

/**
 * Note moyenne en dixièmes (42 = 4,2 / 5), ou nulle sans avis. Entière,
 * comme tout ce que Maria Suite calcule.
 */
export function noteMoyenne(notes: readonly (number | null)[]): number | null {
  const valides = notes.filter((n): n is number => n !== null && n >= 1 && n <= 5);
  if (valides.length === 0) return null;
  return Math.round((valides.reduce((s, n) => s + n, 0) * 10) / valides.length);
}

export function formaterNote(dixiemes: number | null): string {
  if (dixiemes === null) return "Pas encore noté";
  return `${Math.floor(dixiemes / 10)},${dixiemes % 10} / 5`;
}

/** Retenue à la source, en francs, d'un taux en points de base (750 = 7,5 %). */
export function retenue(montant: number, tauxBp: number): number {
  return Math.round((montant * tauxBp) / 10_000);
}

/**
 * Écriture du paiement d'une prestation.
 *
 *   D  compte de charge          montant
 *   C  trésorerie                montant − retenue
 *   C  447 État, impôts retenus  retenue (s'il y en a une)
 *
 * La retenue reste due à l'État : elle se reverse avec les autres impôts
 * retenus. Son taux dépend du régime fiscal du prestataire — Maria Suite ne le
 * devine pas, il se saisit.
 */
export function ecriturePrestation(p: {
  numero: string;
  date: string;
  objet: string;
  prestataire: string;
  montant: number;
  retenue: number;
  compteCharge: CompteCharge;
  tresorerie: { numero: string; libelle: string; journal: "BQ" | "CA" };
}): Ecriture {
  if (p.montant <= 0) throw new Error("Le montant payé doit être positif.");
  if (p.retenue < 0 || p.retenue >= p.montant) throw new Error("La retenue doit être inférieure au montant.");
  const lignes: LigneEcriture[] = [
    { compte: p.compteCharge, libelleCompte: COMPTES_CHARGE[p.compteCharge], debit: p.montant, credit: 0 },
    { compte: p.tresorerie.numero, libelleCompte: p.tresorerie.libelle, debit: 0, credit: p.montant - p.retenue },
  ];
  if (p.retenue > 0) lignes.push({ compte: "447", libelleCompte: "État, impôts retenus à la source", debit: 0, credit: p.retenue });
  return { journal: p.tresorerie.journal, date: p.date, piece: p.numero, libelle: `${p.objet} — ${p.prestataire}`, lignes };
}
