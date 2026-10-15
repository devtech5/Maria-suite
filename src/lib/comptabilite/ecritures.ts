import { percentOf } from "@/lib/money";

/**
 * Génération des écritures comptables à partir des pièces commerciales.
 *
 * C'est le chaînon qui manquait : jusqu'ici, valider une facture ne produisait
 * rien en comptabilité. Sans ce pont, le comptable ressaisit à la main ce que
 * le commercial vient d'enregistrer — deux fois le travail, et deux occasions
 * de se tromper.
 *
 * Logique pure : ni React, ni base de données. Une écriture se calcule et se
 * vérifie, elle ne s'affiche pas.
 *
 * Règle absolue : **une écriture déséquilibrée n'est jamais produite**. La
 * fonction lève plutôt que d'écrire un total faux, parce qu'une balance qui ne
 * tombe pas juste se découvre à la clôture, des mois plus tard, quand plus
 * personne ne sait d'où vient l'écart.
 */

export type CodeJournal = "VE" | "AC" | "CA" | "BQ" | "OD";

/**
 * Les cinq journaux, avec le compte que la saisie déduit toute seule.
 *
 * C'est ce qui permet à un non-comptable de ne saisir qu'un seul compte : dans
 * le journal de caisse, la contrepartie est la caisse, et il ne reste à
 * désigner que la nature de la dépense.
 */
export const JOURNAUX: readonly {
  code: CodeJournal;
  libelle: string;
  contrepartie: string | null;
}[] = [
  { code: "VE", libelle: "Ventes", contrepartie: "411 — Clients" },
  { code: "AC", libelle: "Achats", contrepartie: "401 — Fournisseurs" },
  { code: "CA", libelle: "Caisse", contrepartie: "571 — Caisse" },
  { code: "BQ", libelle: "Banque", contrepartie: "521 — Banques" },
  // Les opérations diverses n'ont pas de contrepartie déduite : c'est là que
  // se passent la paie, les amortissements et les corrections, dont les deux
  // côtés se saisissent.
  { code: "OD", libelle: "Opérations diverses", contrepartie: null },
];

export interface LigneEcriture {
  compte: string;
  libelleCompte: string;
  /** Compte auxiliaire du tiers, quand le compte général en admet un. */
  auxiliaire?: string;
  debit: number;
  credit: number;
}

export interface Ecriture {
  journal: CodeJournal;
  date: string;
  /** Numéro de la pièce d'origine : c'est lui qui rend l'écriture explicable. */
  piece: string;
  libelle: string;
  lignes: LigneEcriture[];
}

/**
 * Plan de comptes utilisé par le pont. Sous-ensemble du référentiel SYSCOHADA.
 */
export const COMPTES = {
  clients: { numero: "411", libelle: "Clients" },
  fournisseurs: { numero: "401", libelle: "Fournisseurs" },
  tvaFacturee: { numero: "4431", libelle: "TVA facturée sur ventes" },
  tvaRecuperable: { numero: "4451", libelle: "TVA récupérable sur achats" },
  ventesMarchandises: { numero: "701", libelle: "Ventes de marchandises" },
  servicesVendus: { numero: "706", libelle: "Services vendus" },
  achatsMarchandises: { numero: "601", libelle: "Achats de marchandises" },
  banque: { numero: "521", libelle: "Banques" },
  caisse: { numero: "571", libelle: "Caisse" },
  caisseMobileMoney: { numero: "5711", libelle: "Caisse Mobile Money" },
  /**
   * Écarts de caisse. Un manque est une charge, un excédent un produit.
   *
   * Jamais un compte d'attente : une différence laissée en 471 se traîne
   * d'exercice en exercice et finit par cacher un vol régulier sous un solde
   * que personne ne justifie.
   */
  manquantCaisse: { numero: "658", libelle: "Charges diverses — manquant de caisse" },
  excedentCaisse: { numero: "758", libelle: "Produits divers — excédent de caisse" },
  /**
   * Rémunérations de personnel extérieur à l'entreprise.
   *
   * C'est là que va ce qu'on verse à un maçon, un manœuvre, un chauffeur
   * occasionnel ou un serveur extra — pas en classe 66, qui est celle des
   * charges de personnel salarié. Les confondre gonflerait la masse salariale
   * déclarée de gens qui ne figurent sur aucune déclaration CNPS, et l'écart
   * se découvrirait au contrôle.
   */
  personnelExterieur: {
    numero: "637",
    libelle: "Rémunérations de personnel extérieur",
  },
} as const;

/**
 * Taux de TVA en Côte d'Ivoire.
 *
 * ⚠️ 18 % est le taux normal. Certains produits — produits alimentaires de
 * base notamment — relèvent d'un taux réduit ou d'une exonération. Le taux
 * appartient donc à l'article, pas au moteur, et doit être vérifié auprès de
 * la DGI avant toute mise en production.
 */
export const TVA_TAUX_NORMAL = 18;

export interface LignePiece {
  designation: string;
  /** Base hors taxes, en francs entiers. */
  montantHT: number;
  tauxTVA: number;
  /** Compte de produit ou de charge à mouvementer. */
  compte: string;
  libelleCompte: string;
}

// ------------------------------------------------------------- vérification

export function totalDebit(ecriture: Ecriture): number {
  return ecriture.lignes.reduce((somme, ligne) => somme + ligne.debit, 0);
}

export function totalCredit(ecriture: Ecriture): number {
  return ecriture.lignes.reduce((somme, ligne) => somme + ligne.credit, 0);
}

export function estEquilibree(ecriture: Ecriture): boolean {
  return totalDebit(ecriture) === totalCredit(ecriture);
}

/**
 * Refuse une écriture qui ne tombe pas juste.
 *
 * Appelée systématiquement avant de rendre une écriture : mieux vaut un échec
 * immédiat et bruyant qu'une balance fausse découverte à la clôture.
 */
function exigerEquilibre(ecriture: Ecriture): Ecriture {
  if (!estEquilibree(ecriture)) {
    throw new Error(
      `Écriture déséquilibrée sur la pièce ${ecriture.piece} : ` +
        `débit ${totalDebit(ecriture)} contre crédit ${totalCredit(ecriture)}.`,
    );
  }
  return ecriture;
}

// ------------------------------------------------------------------ ventes

/**
 * Regroupe les lignes par compte de produit ET par taux de TVA.
 *
 * Deux articles vendus au même taux mais imputés sur des comptes différents
 * doivent rester séparés, sinon la ventilation par nature de produit est
 * perdue. Deux articles sur le même compte à des taux différents aussi, sinon
 * la déclaration de TVA devient infaisable.
 */
function regrouper(lignes: LignePiece[]) {
  const groupes = new Map<
    string,
    { compte: string; libelleCompte: string; tauxTVA: number; montantHT: number }
  >();

  for (const ligne of lignes) {
    const cle = `${ligne.compte}|${ligne.tauxTVA}`;
    const existant = groupes.get(cle);
    if (existant) {
      existant.montantHT += ligne.montantHT;
    } else {
      groupes.set(cle, {
        compte: ligne.compte,
        libelleCompte: ligne.libelleCompte,
        tauxTVA: ligne.tauxTVA,
        montantHT: ligne.montantHT,
      });
    }
  }

  return [...groupes.values()];
}

export interface PieceVente {
  numero: string;
  date: string;
  client: string;
  /** Compte auxiliaire du client, classe 411. */
  compteAuxiliaire: string;
  lignes: LignePiece[];
}

/**
 * Facture de vente.
 *
 *   411 Clients            débit   TTC
 *   701/706 Produits       crédit  HT, par compte et par taux
 *   4431 TVA facturée      crédit  TVA, par taux
 *
 * Le client est débité du TTC : c'est ce qu'il doit. L'entreprise n'a gagné
 * que le HT ; la TVA n'est pas un produit, elle est collectée pour le compte
 * de l'État et figure en dette.
 */
export function ecritureFacture(piece: PieceVente): Ecriture {
  const groupes = regrouper(piece.lignes);
  const lignes: LigneEcriture[] = [];

  let totalHT = 0;
  let totalTVA = 0;

  for (const groupe of groupes) {
    const tva = percentOf(groupe.montantHT, groupe.tauxTVA);
    totalHT += groupe.montantHT;
    totalTVA += tva;

    lignes.push({
      compte: groupe.compte,
      libelleCompte: groupe.libelleCompte,
      debit: 0,
      credit: groupe.montantHT,
    });
  }

  if (totalTVA > 0) {
    lignes.push({
      compte: COMPTES.tvaFacturee.numero,
      libelleCompte: COMPTES.tvaFacturee.libelle,
      debit: 0,
      credit: totalTVA,
    });
  }

  // Le débit client vient en tête à l'affichage, mais se calcule en dernier :
  // il vaut exactement ce que les crédits totalisent.
  lignes.unshift({
    compte: COMPTES.clients.numero,
    libelleCompte: COMPTES.clients.libelle,
    auxiliaire: piece.compteAuxiliaire,
    debit: totalHT + totalTVA,
    credit: 0,
  });

  return exigerEquilibre({
    journal: "VE",
    date: piece.date,
    piece: piece.numero,
    libelle: `Facture ${piece.numero} — ${piece.client}`,
    lignes,
  });
}

/**
 * Avoir.
 *
 * Exactement l'écriture de la facture, sens inversé. Jamais une écriture
 * négative : un montant négatif dans un journal rend la balance illisible et
 * fausse les cumuls de TVA.
 */
export function ecritureAvoir(piece: PieceVente): Ecriture {
  const facture = ecritureFacture(piece);

  return exigerEquilibre({
    ...facture,
    piece: piece.numero,
    libelle: `Avoir ${piece.numero} — ${piece.client}`,
    lignes: facture.lignes.map((ligne) => ({
      ...ligne,
      debit: ligne.credit,
      credit: ligne.debit,
    })),
  });
}

// ------------------------------------------------------------- règlements

export type MoyenReglement = "especes" | "banque" | "mobile_money";

const COMPTE_REGLEMENT: Record<MoyenReglement, { numero: string; libelle: string }> = {
  especes: COMPTES.caisse,
  banque: COMPTES.banque,
  mobile_money: COMPTES.caisseMobileMoney,
};

const JOURNAL_REGLEMENT: Record<MoyenReglement, CodeJournal> = {
  especes: "CA",
  banque: "BQ",
  mobile_money: "CA",
};

/**
 * Encaissement d'un client.
 *
 *   5xx Trésorerie   débit   montant reçu
 *   411 Clients      crédit  montant reçu
 *
 * Le règlement est une écriture distincte de la facture, et c'est essentiel :
 * facturer crée une créance, encaisser l'éteint. Les confondre revient à
 * considérer comme payé tout ce qui est facturé — l'erreur qui masque les
 * impayés jusqu'à ce que la trésorerie manque.
 */
export function ecritureReglement(reglement: {
  numero: string;
  date: string;
  client: string;
  compteAuxiliaire: string;
  montant: number;
  moyen: MoyenReglement;
  /** Compte de trésorerie choisi : il remplace le compte par défaut du moyen. */
  tresorerie?: { numero: string; libelle: string; journal: CodeJournal } | null;
}): Ecriture {
  const compte = reglement.tresorerie ?? COMPTE_REGLEMENT[reglement.moyen];

  return exigerEquilibre({
    journal: reglement.tresorerie?.journal ?? JOURNAL_REGLEMENT[reglement.moyen],
    date: reglement.date,
    piece: reglement.numero,
    libelle: `Règlement ${reglement.numero} — ${reglement.client}`,
    lignes: [
      {
        compte: compte.numero,
        libelleCompte: compte.libelle,
        debit: reglement.montant,
        credit: 0,
      },
      {
        compte: COMPTES.clients.numero,
        libelleCompte: COMPTES.clients.libelle,
        auxiliaire: reglement.compteAuxiliaire,
        debit: 0,
        credit: reglement.montant,
      },
    ],
  });
}

// ------------------------------------------------------------------ achats

/**
 * Facture d'achat.
 *
 *   601 Achats             débit   HT
 *   4451 TVA récupérable   débit   TVA
 *   401 Fournisseurs       crédit  TTC
 *
 * Symétrique de la vente : la TVA payée au fournisseur est une créance sur
 * l'État, pas une charge. La traiter en charge gonflerait les achats et
 * priverait l'entreprise de sa déduction.
 */
export function ecritureAchat(piece: {
  numero: string;
  date: string;
  fournisseur: string;
  compteAuxiliaire: string;
  lignes: LignePiece[];
}): Ecriture {
  const groupes = regrouper(piece.lignes);
  const lignes: LigneEcriture[] = [];

  let totalHT = 0;
  let totalTVA = 0;

  for (const groupe of groupes) {
    const tva = percentOf(groupe.montantHT, groupe.tauxTVA);
    totalHT += groupe.montantHT;
    totalTVA += tva;

    lignes.push({
      compte: groupe.compte,
      libelleCompte: groupe.libelleCompte,
      debit: groupe.montantHT,
      credit: 0,
    });
  }

  if (totalTVA > 0) {
    lignes.push({
      compte: COMPTES.tvaRecuperable.numero,
      libelleCompte: COMPTES.tvaRecuperable.libelle,
      debit: totalTVA,
      credit: 0,
    });
  }

  lignes.push({
    compte: COMPTES.fournisseurs.numero,
    libelleCompte: COMPTES.fournisseurs.libelle,
    auxiliaire: piece.compteAuxiliaire,
    debit: 0,
    credit: totalHT + totalTVA,
  });

  return exigerEquilibre({
    journal: "AC",
    date: piece.date,
    piece: piece.numero,
    libelle: `Facture fournisseur ${piece.numero} — ${piece.fournisseur}`,
    lignes,
  });
}

// -------------------------------------------------------------------- TTC

/**
 * Décompose un montant TTC en base et taxe.
 *
 * Nécessaire au ticket de caisse : le prix affiché en rayon est TTC, alors que
 * la comptabilité raisonne en HT. Extraire la taxe plutôt que l'ajouter évite
 * qu'un article à 300 F soit encaissé 354 F.
 *
 * @example decomposerTTC(11800, 18) -> { ht: 10000, tva: 1800 }
 */
export function decomposerTTC(
  montantTTC: number,
  taux: number,
): { ht: number; tva: number } {
  const ht = Math.round((montantTTC * 100) / (100 + taux));
  // La TVA se déduit du HT plutôt qu'elle ne se recalcule : ainsi les deux
  // parts retombent toujours exactement sur le TTC encaissé.
  return { ht, tva: montantTTC - ht };
}

// ------------------------------------------------------- vente au comptoir

/** Moyens acceptés au comptoir. Le crédit n'en est pas un : c'est une créance. */
export type MoyenComptoir = MoyenReglement | "carte" | "credit";

/**
 * La carte bancaire se solde en banque.
 *
 * Le versement arrive sur le compte, pas dans le tiroir-caisse : l'imputer en
 * 571 ferait un fonds de caisse qui ne correspond à rien au comptage du soir.
 */
const COMPTE_COMPTOIR: Record<
  Exclude<MoyenComptoir, "credit">,
  { numero: string; libelle: string }
> = {
  especes: COMPTES.caisse,
  banque: COMPTES.banque,
  carte: COMPTES.banque,
  mobile_money: COMPTES.caisseMobileMoney,
};

export interface LigneComptoir {
  /** Montant TOUTES TAXES : le prix de rayon est TTC, celui du ticket aussi. */
  montantTTC: number;
  /** Taux en points de base : 1800 = 18 %. */
  tauxTvaBp: number;
  compte: string;
  libelleCompte: string;
}

export interface PieceComptoir {
  numero: string;
  date: string;
  /** Libellé du client. « Client au comptoir » quand il n'est pas identifié. */
  client: string;
  /** Compte auxiliaire, obligatoire dès qu'une part reste à crédit. */
  compteAuxiliaire?: string;
  lignes: LigneComptoir[];
  reglements: { moyen: MoyenComptoir; montant: number }[];
}

/**
 * Ticket de caisse.
 *
 *   5xx Trésorerie     débit   par moyen réellement reçu
 *   411 Clients        débit   la part laissée à crédit, s'il y en a
 *   701/706 Produits   crédit  HT, par compte et par taux
 *   4431 TVA facturée  crédit  taxe collectée
 *
 * UNE écriture, pas deux. La vente au comptoir facture et encaisse dans le
 * même geste : passer une facture puis un règlement produirait deux pièces là
 * où le client n'en a reçu qu'une, et gonflerait le journal de caisse d'autant.
 *
 * La part à crédit, elle, reste en 411 : elle n'est pas encaissée, et la
 * confondre avec le reste ferait passer pour payé ce qui ne l'est pas.
 *
 * Les montants entrent en TTC parce que c'est ainsi qu'ils ont été affichés en
 * rayon et imprimés sur le ticket. Extraire la taxe plutôt que l'ajouter évite
 * qu'un article marqué 300 F soit encaissé 354 F.
 */
export function ecritureVenteComptoir(piece: PieceComptoir): Ecriture {
  const groupes = new Map<
    string,
    { compte: string; libelleCompte: string; tauxTvaBp: number; ttc: number }
  >();

  for (const ligne of piece.lignes) {
    const cle = `${ligne.compte}|${ligne.tauxTvaBp}`;
    const existant = groupes.get(cle);
    if (existant) existant.ttc += ligne.montantTTC;
    else
      groupes.set(cle, {
        compte: ligne.compte,
        libelleCompte: ligne.libelleCompte,
        tauxTvaBp: ligne.tauxTvaBp,
        ttc: ligne.montantTTC,
      });
  }

  const lignes: LigneEcriture[] = [];
  let totalTVA = 0;
  let totalTTC = 0;

  for (const groupe of groupes.values()) {
    // Le taux est en points de base sur la ligne de vente ; `decomposerTTC`
    // raisonne en pourcentage. La division est exacte : 1800 / 100 = 18.
    const { ht, tva } = decomposerTTC(groupe.ttc, groupe.tauxTvaBp / 100);
    totalTVA += tva;
    totalTTC += groupe.ttc;

    if (ht > 0) {
      lignes.push({
        compte: groupe.compte,
        libelleCompte: groupe.libelleCompte,
        debit: 0,
        credit: ht,
      });
    }
  }

  if (totalTVA > 0) {
    lignes.push({
      compte: COMPTES.tvaFacturee.numero,
      libelleCompte: COMPTES.tvaFacturee.libelle,
      debit: 0,
      credit: totalTVA,
    });
  }

  // Les débits viennent en tête à la lecture : on voit d'abord ce qui est
  // entré, puis ce qui l'a justifié.
  const debits: LigneEcriture[] = [];

  for (const reglement of piece.reglements) {
    if (reglement.montant <= 0) continue;

    if (reglement.moyen === "credit") {
      if (!piece.compteAuxiliaire) {
        throw new Error(
          `Ticket ${piece.numero} : une part à crédit sans compte client ` +
            `ne peut pas être imputée. La créance serait perdue.`,
        );
      }
      debits.push({
        compte: COMPTES.clients.numero,
        libelleCompte: COMPTES.clients.libelle,
        auxiliaire: piece.compteAuxiliaire,
        debit: reglement.montant,
        credit: 0,
      });
      continue;
    }

    const compte = COMPTE_COMPTOIR[reglement.moyen];
    debits.push({
      compte: compte.numero,
      libelleCompte: compte.libelle,
      debit: reglement.montant,
      credit: 0,
    });
  }

  const encaisse = debits.reduce((somme, ligne) => somme + ligne.debit, 0);
  if (encaisse !== totalTTC) {
    throw new Error(
      `Ticket ${piece.numero} : les règlements totalisent ${encaisse} ` +
        `pour un ticket de ${totalTTC}. Une caisse ne se ferme pas sur un écart.`,
    );
  }

  return exigerEquilibre({
    journal: "CA",
    date: piece.date,
    piece: piece.numero,
    libelle: `Ticket ${piece.numero} — ${piece.client}`,
    lignes: [...debits, ...lignes],
  });
}

// -------------------------------------------------------- écart de caisse

export interface EcartComptage {
  moyen: Exclude<MoyenComptoir, "credit">;
  /** `compté - attendu`. Négatif : il manque. */
  ecart: number;
}

/**
 * Régularisation d'un écart de caisse à la clôture.
 *
 *   manque    : 658 Charges diverses   débit    | 5xx Trésorerie  crédit
 *   excédent  : 5xx Trésorerie         débit    | 758 Produits    crédit
 *
 * Le compte de trésorerie suit le moyen : un manque en espèces sort du tiroir,
 * un écart de mobile money du compte de l'opérateur. Les confondre ferait
 * tomber juste une caisse qui ne l'est pas, en compensant un vol d'espèces par
 * une commission mal saisie.
 *
 * Renvoie `null` quand tout tombe juste — le cas normal, qui ne mérite aucune
 * écriture. Une écriture à zéro dans un journal est du bruit qui rend les
 * vraies plus difficiles à repérer.
 */
export function ecritureEcartCaisse(cloture: {
  numero: string;
  date: string;
  caissier: string;
  ecarts: EcartComptage[];
}): Ecriture | null {
  const lignes: LigneEcriture[] = [];

  for (const { moyen, ecart } of cloture.ecarts) {
    if (ecart === 0) continue;

    const tresorerie = COMPTE_COMPTOIR[moyen];

    if (ecart < 0) {
      // Il manque : la trésorerie diminue, la différence part en charge.
      lignes.push({
        compte: COMPTES.manquantCaisse.numero,
        libelleCompte: COMPTES.manquantCaisse.libelle,
        debit: -ecart,
        credit: 0,
      });
      lignes.push({
        compte: tresorerie.numero,
        libelleCompte: tresorerie.libelle,
        debit: 0,
        credit: -ecart,
      });
    } else {
      lignes.push({
        compte: tresorerie.numero,
        libelleCompte: tresorerie.libelle,
        debit: ecart,
        credit: 0,
      });
      lignes.push({
        compte: COMPTES.excedentCaisse.numero,
        libelleCompte: COMPTES.excedentCaisse.libelle,
        debit: 0,
        credit: ecart,
      });
    }
  }

  if (lignes.length === 0) return null;

  return exigerEquilibre({
    journal: "OD",
    date: cloture.date,
    piece: cloture.numero,
    libelle: `Écart de caisse ${cloture.numero} — ${cloture.caissier}`,
    lignes,
  });
}

// ------------------------------------------------------- bon de paiement

/** Moyens par lesquels un intervenant est réellement payé. Pas de crédit. */
export type MoyenBonPaiement = Exclude<MoyenComptoir, "credit">;

/**
 * Versement à un intervenant.
 *
 *   637 Personnel extérieur   débit   montant versé
 *   5xx Trésorerie            crédit  montant versé
 *
 * La charge naît au PAIEMENT et non au pointage, exactement comme le stock
 * naît du mouvement et non de la commande. Un pointage engage l'entreprise
 * sans rien décaisser ; le comptabiliser ferait apparaître une dette envers
 * quelqu'un qui n'a pas de compte fournisseur, et qu'aucun lettrage ne saurait
 * solder.
 *
 * Aucune retenue, aucune cotisation : ce n'est pas un bulletin de paie. Un
 * intervenant n'est ni déclaré à la CNPS ni soumis à l'ITS par son donneur
 * d'ordre — le lui appliquer produirait une déclaration fausse.
 */
export function ecritureBonPaiement(bon: {
  numero: string;
  date: string;
  intervenant: string;
  montant: number;
  moyen: MoyenBonPaiement;
}): Ecriture {
  if (bon.montant <= 0) {
    throw new Error(
      `Bon de paiement ${bon.numero} : un versement sans montant n'a rien à enregistrer.`,
    );
  }

  const tresorerie = COMPTE_COMPTOIR[bon.moyen];

  return exigerEquilibre({
    // La carte et le virement sortent du compte bancaire, donc du journal de
    // banque. Les imputer au journal de caisse ferait un tiroir qui ne
    // correspond à rien au comptage du soir.
    journal: bon.moyen === "banque" || bon.moyen === "carte" ? "BQ" : "CA",
    date: bon.date,
    piece: bon.numero,
    libelle: `Bon de paiement ${bon.numero} — ${bon.intervenant}`,
    lignes: [
      {
        compte: COMPTES.personnelExterieur.numero,
        libelleCompte: COMPTES.personnelExterieur.libelle,
        debit: bon.montant,
        credit: 0,
      },
      {
        compte: tresorerie.numero,
        libelleCompte: tresorerie.libelle,
        debit: 0,
        credit: bon.montant,
      },
    ],
  });
}

// ------------------------------------------------------------ saisie guidée

/**
 * Contrepartie déduite du journal.
 *
 * `OD` n'y figure pas : c'est là que se passent la paie, les amortissements et
 * les corrections, dont les deux côtés se saisissent. Un journal sans
 * contrepartie évidente n'en reçoit pas une par défaut — ce serait le meilleur
 * moyen d'imputer un salaire à la caisse.
 */
const CONTREPARTIE_JOURNAL: Partial<
  Record<CodeJournal, { numero: string; libelle: string }>
> = {
  VE: COMPTES.clients,
  AC: COMPTES.fournisseurs,
  CA: COMPTES.caisse,
  BQ: COMPTES.banque,
};

/**
 * Contrepasse une écriture : mêmes comptes, sens inversé.
 *
 * Une écriture validée ne s'efface pas, elle se corrige par son contraire. Le
 * chiffre d'affaires annulé disparaît ainsi des états sans qu'aucune ligne
 * d'origine ne soit touchée, et la balance reste juste à chaque instant.
 */
export function contrepasser(
  origine: Ecriture,
  piece: string,
  libelle: string,
  date: string = origine.date,
): Ecriture {
  return {
    journal: origine.journal,
    date,
    piece,
    libelle,
    lignes: origine.lignes.map((ligne) => ({
      ...ligne,
      debit: ligne.credit,
      credit: ligne.debit,
    })),
  };
}

export function contrepartieDe(journal: CodeJournal) {
  return CONTREPARTIE_JOURNAL[journal];
}

export interface SaisieGuidee {
  journal: CodeJournal;
  date: string;
  piece: string;
  libelle: string;
  /** Compte de charge ou de produit choisi par l'exploitant. */
  compte: string;
  libelleCompte: string;
  /** `charge` se débite, `produit` se crédite. */
  sens: "charge" | "produit";
  /** Montant tel qu'il figure sur la pièce : TTC si un taux est donné. */
  montant: number;
  /** Taux de TVA en points de base — 1800 pour 18 %. Absent : pas de TVA. */
  tauxTvaBp?: number;
}

/**
 * Écriture à un seul compte saisi.
 *
 * L'exploitant choisit un journal et un compte de charge ou de produit ; la
 * contrepartie et le sens se déduisent. C'est la seule abstraction qui rende
 * la comptabilité tenable pour un commerçant qui n'est pas comptable — et la
 * partie double reste affichée, on ne la cache pas.
 *
 * La TVA est isolée quand un taux est donné : le montant de la pièce est alors
 * TTC, la charge ou le produit prend le HT, et la différence va au compte de
 * taxe. Sans cette ventilation, la TVA récupérable resterait noyée dans la
 * charge — l'entreprise paierait deux fois.
 */
export function ecritureSaisieGuidee(saisie: SaisieGuidee): Ecriture {
  const contrepartie = contrepartieDe(saisie.journal);

  if (!contrepartie) {
    throw new Error(
      `Le journal ${saisie.journal} n'a pas de contrepartie déduite : les deux comptes doivent être saisis.`,
    );
  }

  if (saisie.montant <= 0) {
    throw new Error("Une écriture sans montant n'a rien à enregistrer.");
  }

  const taux = saisie.tauxTvaBp ? saisie.tauxTvaBp / 100 : 0;
  const { ht, tva } = taux > 0
    ? decomposerTTC(saisie.montant, taux)
    : { ht: saisie.montant, tva: 0 };

  const estCharge = saisie.sens === "charge";
  const compteTaxe = estCharge ? COMPTES.tvaRecuperable : COMPTES.tvaFacturee;

  const lignes: LigneEcriture[] = [
    {
      compte: saisie.compte,
      libelleCompte: saisie.libelleCompte,
      debit: estCharge ? ht : 0,
      credit: estCharge ? 0 : ht,
    },
  ];

  if (tva > 0) {
    lignes.push({
      compte: compteTaxe.numero,
      libelleCompte: compteTaxe.libelle,
      // La TVA suit le sens du compte qu'elle accompagne : récupérable au
      // débit avec la charge, facturée au crédit avec le produit.
      debit: estCharge ? tva : 0,
      credit: estCharge ? 0 : tva,
    });
  }

  lignes.push({
    compte: contrepartie.numero,
    libelleCompte: contrepartie.libelle,
    debit: estCharge ? 0 : saisie.montant,
    credit: estCharge ? saisie.montant : 0,
  });

  return exigerEquilibre({
    journal: saisie.journal,
    date: saisie.date,
    piece: saisie.piece,
    libelle: saisie.libelle,
    lignes,
  });
}
