import {
  COMPTES,
  decomposerTTC,
  estEquilibree,
  type Ecriture,
  type LigneEcriture,
} from "@/lib/comptabilite/ecritures";

import type { MoyenBillet, StatutDepart } from "./schema";

/**
 * Règles de la billetterie.
 *
 * Logique pure : plan de places, remplissage, transitions, écritures. Le
 * serveur les applique, les tests les figent, l'écran les relit.
 */

/** Lettres de siège dans une rangée : A et B à gauche, C et D à droite. */
export const LETTRES_SIEGE = ["A", "B", "C", "D"] as const;

export function capacite(rangees: number): number {
  return rangees * LETTRES_SIEGE.length;
}

/** Les sièges d'un véhicule, rangée par rangée : 1A, 1B, 1C, 1D, 2A… */
export function siegesDuVehicule(rangees: number): string[] {
  const sieges: string[] = [];
  for (let rangee = 1; rangee <= rangees; rangee++) {
    for (const lettre of LETTRES_SIEGE) sieges.push(`${rangee}${lettre}`);
  }
  return sieges;
}

/**
 * Le siège existe-t-il dans ce véhicule ? « 16A » dans un car de quinze
 * rangées n'est pas une place, et un billet émis dessus n'aurait nulle part
 * où s'asseoir.
 */
export function siegeValide(siege: string, rangees: number): boolean {
  const correspondance = /^([1-9]\d?)([A-D])$/.exec(siege);
  if (!correspondance) return false;
  return Number(correspondance[1]) <= rangees;
}

/** Ordre naturel des sièges : 2A avant 10A, que l'ordre alphabétique inverse. */
export function comparerSieges(a: string, b: string): number {
  const rangee = (s: string) => Number.parseInt(s, 10);
  return rangee(a) - rangee(b) || a.localeCompare(b);
}

export function tauxRemplissage(vendus: number, rangees: number): number {
  const places = capacite(rangees);
  return places === 0 ? 0 : Math.round((vendus / places) * 100);
}

/** On vend tant que le car n'est pas parti : l'embarquement accepte un retardataire. */
export function departVendable(statut: StatutDepart): boolean {
  return statut === "ouvert" || statut === "embarquement";
}

/**
 * Transitions permises d'un départ. On ne revient jamais en arrière : un
 * départ parti a laissé ses non-présentés, un départ annulé a remboursé.
 */
const SUIVANTS: Record<StatutDepart, StatutDepart[]> = {
  ouvert: ["embarquement", "annule"],
  embarquement: ["parti", "annule"],
  parti: [],
  annule: [],
};

export function transitionPermise(de: StatutDepart, vers: StatutDepart): boolean {
  return SUIVANTS[de].includes(vers);
}

/** Durée d'un trajet en heures et minutes : 330 → « 5 h 30 ». */
export function formaterDuree(minutes: number): string {
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}

// --------------------------------------------------------------- écritures

const TRESORERIE: Record<MoyenBillet, { numero: string; libelle: string }> = {
  especes: COMPTES.caisse,
  mobile_money: COMPTES.caisseMobileMoney,
  banque: COMPTES.banque,
};

/**
 * Vente d'un billet.
 *
 *   5xx Trésorerie   débit   prix du billet
 *   706 Services     crédit  transport HT
 *   4431 TVA         crédit  taxe
 *
 * Une écriture par billet, et non par vente groupée : un passager d'une
 * famille de quatre qui annule ne doit contrepasser que sa propre place.
 */
export function ecritureBillet(billet: {
  numero: string;
  date: string;
  passager: string;
  trajet: string;
  montant: number;
  tauxTvaBp: number;
  moyen: MoyenBillet;
}): Ecriture {
  const { ht, tva } = decomposerTTC(billet.montant, billet.tauxTvaBp / 100);
  const tresorerie = TRESORERIE[billet.moyen];
  const lignes: LigneEcriture[] = [
    { compte: tresorerie.numero, libelleCompte: tresorerie.libelle, debit: billet.montant, credit: 0 },
  ];
  if (ht > 0) lignes.push({ compte: COMPTES.servicesVendus.numero, libelleCompte: COMPTES.servicesVendus.libelle, debit: 0, credit: ht });
  if (tva > 0) lignes.push({ compte: COMPTES.tvaFacturee.numero, libelleCompte: COMPTES.tvaFacturee.libelle, debit: 0, credit: tva });

  const ecriture: Ecriture = {
    journal: billet.moyen === "banque" ? "BQ" : "CA",
    date: billet.date,
    piece: billet.numero,
    libelle: `Billet ${billet.numero} — ${billet.passager}, ${billet.trajet}`,
    lignes,
  };
  if (!estEquilibree(ecriture)) throw new Error(`Écriture déséquilibrée sur ${billet.numero}.`);
  return ecriture;
}
