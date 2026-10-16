import {
  COMPTES,
  decomposerTTC,
  estEquilibree,
  type Ecriture,
  type LigneEcriture,
} from "@/lib/comptabilite/ecritures";
import { ajouterJours, joursEntre, prixPeriode, type BaseTarif, type Grille } from "@/modules/reservations/calcul";
import type { MoyenLocation, StatutRessource } from "@/modules/reservations/schema";

import type { MenageChambre, NaturePrestation } from "./schema";

/**
 * Règles de l'hôtel : nuits, état des chambres, note et écritures.
 *
 * Logique pure, sans base : le serveur l'applique, les tests la figent.
 */

// -------------------------------------------------------------------- nuits

/** Nuits entre l'arrivée et le départ : du 20 au 22, deux nuits. */
export function nuitsEntre(arrivee: string, depart: string): number {
  return joursEntre(arrivee, depart) - 1;
}

/**
 * Période du contrat pour un séjour. Le moteur compte des jours INCLUSIFS ;
 * une nuit occupe le jour d'arrivée, pas celui du départ. Le contrat va donc
 * de l'arrivée à la veille du départ, et la chambre se revend le jour même.
 */
export function periodeContrat(arrivee: string, depart: string): { debut: string; fin: string } {
  if (depart <= arrivee) throw new Error("Le départ doit suivre l'arrivée d'au moins une nuit.");
  return { debut: arrivee, fin: ajouterJours(depart, -1) };
}

/** Jour du départ prévu, relu depuis le contrat. */
export function departDe(finContrat: string): string {
  return ajouterJours(finContrat, 1);
}

/**
 * Dernière nuit facturée quand le client part `jourDepart`. Un départ le jour
 * même de l'arrivée paie sa nuit : la chambre a été prise et doit être refaite.
 */
export function derniereNuit(arrivee: string, jourDepart: string): string {
  const veille = ajouterJours(jourDepart, -1);
  return veille < arrivee ? arrivee : veille;
}

export type BaseSejour = BaseTarif | "negocie";

/**
 * Prix de l'hébergement. Un tarif négocié s'applique à la nuit, sans forfait :
 * c'est déjà une remise. Sinon la grille de la chambre — une résidence au mois
 * paie son mois, pas trente nuits.
 */
export function prixSejour(
  grille: Grille,
  prixNuit: number | null,
  nuits: number,
): { montant: number; base: BaseSejour } | null {
  if (nuits <= 0) return null;
  if (prixNuit !== null) return { montant: prixNuit * nuits, base: "negocie" };
  return prixPeriode(grille, nuits);
}

// ------------------------------------------------------------ état du jour

export type EtatChambre = "hors_service" | "occupee" | "depart" | "arrivee" | "a_nettoyer" | "libre";

export const LIBELLE_ETAT: Record<EtatChambre, string> = {
  hors_service: "Hors service",
  occupee: "Occupée",
  depart: "Départ",
  arrivee: "Arrivée",
  a_nettoyer: "À nettoyer",
  libre: "Libre",
};

/**
 * État d'une chambre pour la réception, un jour donné.
 *
 * Un client présent dont le départ est aujourd'hui (ou dépassé) est un départ,
 * pas une occupation ordinaire : c'est la liste de la réception du matin. Une
 * chambre libre mais sale ne se donne pas ; une arrivée attendue passe avant,
 * pour que le ménage sache par où commencer.
 */
export function etatChambre(chambre: {
  statut: StatutRessource;
  menage: MenageChambre;
  /** Séjour en cours dans la chambre : jour du départ prévu. */
  departPrevu: string | null;
  /** Réservation dont l'arrivée est attendue aujourd'hui ou avant. */
  arriveeAttendue: boolean;
}, aujourdHui: string): EtatChambre {
  if (chambre.departPrevu) return chambre.departPrevu <= aujourdHui ? "depart" : "occupee";
  if (chambre.statut !== "active") return "hors_service";
  if (chambre.arriveeAttendue) return "arrivee";
  return chambre.menage === "a_faire" ? "a_nettoyer" : "libre";
}

/** Taux d'occupation en pourcentage entier, sur les chambres en service. */
export function tauxOccupation(occupees: number, enService: number): number {
  if (enService <= 0) return 0;
  return Math.round((occupees * 100) / enService);
}

// -------------------------------------------------------------------- note

export interface LigneNote {
  libelle: string;
  /** Montant TTC. */
  montant: number;
  tauxTvaBp: number;
  nature: NaturePrestation;
}

/** Hébergement, prestations, acomptes : ce que le client doit encore. Négatif, on lui rend. */
export function soldeNote(hebergement: number, prestations: { montant: number }[], acomptes: { montant: number }[]) {
  const consomme = prestations.reduce((s, p) => s + p.montant, 0);
  const total = hebergement + consomme;
  const verse = acomptes.reduce((s, a) => s + a.montant, 0);
  return { total, verse, reste: total - verse };
}

/**
 * Récapitulatif de TVA de la note, par taux, pour la facture remise au
 * client. La taxe s'extrait par compte et par taux, comme dans l'écriture du
 * départ, puis s'additionne : la facture et la comptabilité disent le même
 * montant au franc près.
 */
export function recapTva(lignes: { montant: number; tauxTvaBp: number; nature: NaturePrestation }[]): { tauxTvaBp: number; ttc: number; ht: number; tva: number }[] {
  const groupes = new Map<string, { tauxTvaBp: number; ttc: number }>();
  for (const l of lignes) {
    const cle = `${l.nature}|${l.tauxTvaBp}`;
    const g = groupes.get(cle) ?? { tauxTvaBp: l.tauxTvaBp, ttc: 0 };
    g.ttc += l.montant;
    groupes.set(cle, g);
  }
  const parTaux = new Map<number, { tauxTvaBp: number; ttc: number; ht: number; tva: number }>();
  for (const g of groupes.values()) {
    const { ht, tva } = decomposerTTC(g.ttc, g.tauxTvaBp / 100);
    const t = parTaux.get(g.tauxTvaBp) ?? { tauxTvaBp: g.tauxTvaBp, ttc: 0, ht: 0, tva: 0 };
    t.ttc += g.ttc;
    t.ht += ht;
    t.tva += tva;
    parTaux.set(g.tauxTvaBp, t);
  }
  return [...parTaux.values()].sort((a, b) => b.tauxTvaBp - a.tauxTvaBp);
}

// --------------------------------------------------------------- écritures

const TRESORERIE: Record<MoyenLocation, { numero: string; libelle: string }> = {
  especes: COMPTES.caisse,
  mobile_money: COMPTES.caisseMobileMoney,
  banque: COMPTES.banque,
};

/** Avances reçues des clients : l'acompte attend la note, il n'est pas encore une recette. */
export const COMPTE_AVANCES = { numero: "4191", libelle: "Clients, avances et acomptes reçus" };
/** Dépôts et cautionnements reçus, comme au comptoir de location. */
const COMPTE_CAUTIONS = { numero: "165", libelle: "Dépôts et cautionnements reçus" };

const COMPTE_PRESTATION: Record<NaturePrestation, { numero: string; libelle: string }> = {
  service: COMPTES.servicesVendus,
  marchandise: COMPTES.ventesMarchandises,
};

function journalDe(moyen: MoyenLocation) {
  return moyen === "banque" ? "BQ" : "CA";
}

function exiger(ecriture: Ecriture): Ecriture {
  if (!estEquilibree(ecriture)) throw new Error(`Écriture déséquilibrée sur ${ecriture.piece}.`);
  return ecriture;
}

/**
 * Acompte : l'argent entre, la dette envers le client aussi.
 *
 *   5xx Trésorerie   débit
 *   4191 Avances     crédit
 */
export function ecritureAcompte(piece: { numero: string; date: string; client: string; montant: number; moyen: MoyenLocation }): Ecriture {
  if (piece.montant <= 0) throw new Error("Un acompte est un montant positif.");
  const tresorerie = TRESORERIE[piece.moyen];
  return exiger({
    journal: journalDe(piece.moyen),
    date: piece.date,
    piece: piece.numero,
    libelle: `Acompte ${piece.numero} — ${piece.client}`,
    lignes: [
      { compte: tresorerie.numero, libelleCompte: tresorerie.libelle, debit: piece.montant, credit: 0 },
      { compte: COMPTE_AVANCES.numero, libelleCompte: COMPTE_AVANCES.libelle, debit: 0, credit: piece.montant },
    ],
  });
}

/**
 * Caution d'une résidence, reçue à l'arrivée. Détenue, pas encaissée : elle se
 * rend au départ, et seule une retenue devient une recette.
 *
 *   5xx Trésorerie   débit
 *   165 Cautions     crédit
 */
export function ecritureCaution(piece: { numero: string; date: string; client: string; montant: number; moyen: MoyenLocation }): Ecriture {
  const tresorerie = TRESORERIE[piece.moyen];
  return exiger({
    journal: journalDe(piece.moyen),
    date: piece.date,
    piece: `${piece.numero}-C`,
    libelle: `Caution ${piece.numero} — ${piece.client}`,
    lignes: [
      { compte: tresorerie.numero, libelleCompte: tresorerie.libelle, debit: piece.montant, credit: 0 },
      { compte: COMPTE_CAUTIONS.numero, libelleCompte: COMPTE_CAUTIONS.libelle, debit: 0, credit: piece.montant },
    ],
  });
}

/** Produit d'un acompte conservé à l'annulation : un dédit, pas une nuit vendue. */
export const COMPTE_DEDITS = { numero: "758", libelle: "Produits divers — acomptes conservés" };

/**
 * Annulation d'une réservation qui avait reçu des acomptes : on les rend, ou
 * l'établissement les garde comme dédit selon ses conditions.
 *
 *   4191 Avances        débit   acomptes reçus
 *   5xx Trésorerie      crédit  si on rend
 *   758 Produits divers crédit  si on garde
 */
export function ecritureAnnulation(piece: {
  numero: string;
  date: string;
  client: string;
  acomptes: number;
  sort: { rendre: MoyenLocation } | "conserver";
}): Ecriture {
  const contrepartie = piece.sort === "conserver" ? COMPTE_DEDITS : TRESORERIE[piece.sort.rendre];
  return exiger({
    journal: piece.sort === "conserver" ? "OD" : journalDe(piece.sort.rendre),
    date: piece.date,
    piece: `${piece.numero}-X`,
    libelle: `Annulation ${piece.numero} — ${piece.client}`,
    lignes: [
      { compte: COMPTE_AVANCES.numero, libelleCompte: COMPTE_AVANCES.libelle, debit: piece.acomptes, credit: 0 },
      { compte: contrepartie.numero, libelleCompte: contrepartie.libelle, debit: 0, credit: piece.acomptes },
    ],
  });
}

export type MoyenSolde = MoyenLocation | "credit";

/**
 * Départ : la note entière devient un produit, en une écriture.
 *
 *   4191 Avances        débit   acomptes reçus pendant le séjour
 *   5xx Trésorerie      débit   le reste payé au départ
 *   411 Clients         débit   le reste laissé à crédit (entreprise, agence)
 *   706/701 Produits    crédit  HT, par compte et par taux
 *   4431 TVA facturée   crédit  taxe collectée
 *   5xx Trésorerie      crédit  ce qu'on rend, si les acomptes dépassent la note
 *
 * Les montants sont TTC, comme sur la note remise au client.
 */
export function ecritureDepart(piece: {
  numero: string;
  date: string;
  client: string;
  compteAuxiliaire?: string | null;
  lignes: { montant: number; tauxTvaBp: number; nature: NaturePrestation }[];
  acomptes: number;
  /** Moyen du reste, ou du remboursement s'il est négatif. */
  moyen: MoyenSolde | null;
}): Ecriture {
  const groupes = new Map<string, { compte: { numero: string; libelle: string }; tauxTvaBp: number; ttc: number }>();
  for (const ligne of piece.lignes) {
    if (ligne.montant <= 0) continue;
    const compte = COMPTE_PRESTATION[ligne.nature];
    const cle = `${compte.numero}|${ligne.tauxTvaBp}`;
    const groupe = groupes.get(cle);
    if (groupe) groupe.ttc += ligne.montant;
    else groupes.set(cle, { compte, tauxTvaBp: ligne.tauxTvaBp, ttc: ligne.montant });
  }

  const produits: LigneEcriture[] = [];
  let total = 0;
  let tvaTotale = 0;
  for (const g of groupes.values()) {
    const { ht, tva } = decomposerTTC(g.ttc, g.tauxTvaBp / 100);
    total += g.ttc;
    tvaTotale += tva;
    if (ht > 0) produits.push({ compte: g.compte.numero, libelleCompte: g.compte.libelle, debit: 0, credit: ht });
  }
  if (tvaTotale > 0) {
    produits.push({ compte: COMPTES.tvaFacturee.numero, libelleCompte: COMPTES.tvaFacturee.libelle, debit: 0, credit: tvaTotale });
  }

  const reste = total - piece.acomptes;
  const debits: LigneEcriture[] = [];
  if (piece.acomptes > 0) {
    debits.push({ compte: COMPTE_AVANCES.numero, libelleCompte: COMPTE_AVANCES.libelle, debit: piece.acomptes, credit: 0 });
  }
  if (reste !== 0) {
    if (!piece.moyen) throw new Error("Indiquez le moyen de règlement du solde.");
    if (piece.moyen === "credit") {
      if (reste < 0) throw new Error("Un trop-perçu se rend : choisissez espèces, mobile money ou banque.");
      if (!piece.compteAuxiliaire) throw new Error("Ce client n'a pas de compte client : le solde ne peut pas rester à crédit.");
      debits.push({ compte: COMPTES.clients.numero, libelleCompte: COMPTES.clients.libelle, auxiliaire: piece.compteAuxiliaire, debit: reste, credit: 0 });
    } else {
      const tresorerie = TRESORERIE[piece.moyen];
      if (reste > 0) debits.push({ compte: tresorerie.numero, libelleCompte: tresorerie.libelle, debit: reste, credit: 0 });
      else produits.push({ compte: tresorerie.numero, libelleCompte: tresorerie.libelle, debit: 0, credit: -reste });
    }
  }

  return exiger({
    journal: piece.moyen === "banque" ? "BQ" : piece.moyen === "credit" ? "VE" : "CA",
    date: piece.date,
    piece: piece.numero,
    libelle: `Séjour ${piece.numero} — ${piece.client}`,
    lignes: [...debits, ...produits],
  });
}
