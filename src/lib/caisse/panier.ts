import {
  ECHELLE_QUANTITE,
  montantLigne,
  type CodeUnite,
} from "@/lib/quantite";

/**
 * Calculs du panier de caisse.
 *
 * Logique pure, sans React ni base de données : c'est le seul endroit où les
 * montants d'un ticket sont décidés, donc le seul à devoir être juste.
 *
 * Les quantités sont en millièmes d'unité de vente — une poissonnerie vend
 * 1,340 kg, pas un poisson. Le montant reste un entier de francs : l'arrondi
 * se fait à la multiplication, jamais sur la quantité, car arrondir un poids
 * changerait ce que le client emporte.
 *
 * Convention de présentation, reprise d'un ticket SOCOCE relevé à Yopougon :
 *
 *     TOTAL          somme des montants BRUTS des lignes
 *     REMISE         cumul des remises
 *     TOTAL A PAYER  net encaissé
 *
 * Leur ticket affiche pourtant un montant de ligne déjà net, ce qui fait que
 * la colonne ne s'additionne pas au TOTAL imprimé juste en dessous
 * (1 200 + 1 700 = 2 900, alors que le TOTAL indique 2 975). Ici la colonne
 * Montant porte le brut : elle retombe exactement sur le TOTAL.
 */

export interface LignePanier {
  /** Identifiant de la ligne, distinct de l'article : un même article peut
   *  figurer deux fois avec des remises différentes. */
  id: string;
  articleId: string;
  designation: string;
  /** Prix unitaire en francs entiers, pour UNE unité de vente. */
  prixUnitaire: number;
  /** Quantité en millièmes d'unité. 1000 = une unité entière. */
  quantite: number;
  unite: CodeUnite;
  /** Remise de ligne, en francs entiers. Jamais un pourcentage stocké. */
  remise: number;
}

export interface TotauxPanier {
  /** Somme des montants de ligne, avant toute remise. */
  brut: number;
  /** Remises de ligne + remise de pied ventilée. */
  remise: number;
  /** Ce que le client doit réellement. */
  net: number;
  /** Nombre de lignes. Les quantités ne s'additionnent plus entre elles :
   *  additionner des kilos et des bouteilles ne veut rien dire. */
  lignes: number;
}

/** Montant brut d'une ligne, arrondi au franc. */
export function brutLigne(ligne: LignePanier): number {
  return montantLigne(ligne.prixUnitaire, ligne.quantite);
}

/** Montant net d'une ligne, remise déduite. Jamais négatif. */
export function netLigne(ligne: LignePanier): number {
  return Math.max(0, brutLigne(ligne) - ligne.remise);
}

/**
 * Totalise le panier.
 *
 * `remisePied` est une remise globale accordée en fin de ticket. Elle est
 * ventilée sur les lignes au prorata de leur montant net, avec une répartition
 * qui garde la somme exacte — additionner des arrondis indépendants ne retombe
 * jamais sur le total accordé.
 */
export function totaliser(lignes: LignePanier[], remisePied = 0): TotauxPanier {
  const brut = lignes.reduce((somme, ligne) => somme + brutLigne(ligne), 0);
  const remiseLignes = lignes.reduce(
    (somme, ligne) => somme + Math.min(ligne.remise, brutLigne(ligne)),
    0,
  );

  const netAvantPied = brut - remiseLignes;
  const remiseAppliquee = Math.min(remisePied, netAvantPied);

  return {
    brut,
    remise: remiseLignes + remiseAppliquee,
    net: netAvantPied - remiseAppliquee,
    lignes: lignes.length,
  };
}

/**
 * Monnaie à rendre.
 *
 * Le concurrent n'a aucun champ de ce genre sur son écran d'encaissement,
 * alors que l'espèce reste le moyen dominant. Un caissier qui calcule la
 * monnaie de tête se trompe, et l'écart apparaît à la clôture.
 */
export function monnaieARendre(net: number, recu: number): number {
  return Math.max(0, recu - net);
}

/** Ce qu'il reste à encaisser après les règlements déjà saisis. */
export function resteAPayer(net: number, regle: number): number {
  return Math.max(0, net - regle);
}

// ---------------------------------------------------------------- mutations

export function ajouterArticle(
  lignes: LignePanier[],
  article: {
    id: string;
    designation: string;
    prix: number;
    unite: CodeUnite;
  },
  quantite = ECHELLE_QUANTITE,
): LignePanier[] {
  // Un article rescanné incrémente la ligne existante, tant qu'elle n'a pas de
  // remise propre : sinon on écraserait une remise déjà accordée.
  const existante = lignes.find(
    (ligne) => ligne.articleId === article.id && ligne.remise === 0,
  );

  if (existante) {
    return lignes.map((ligne) =>
      ligne.id === existante.id
        ? { ...ligne, quantite: ligne.quantite + quantite }
        : ligne,
    );
  }

  return [
    ...lignes,
    {
      id: `${article.id}-${Date.now()}`,
      articleId: article.id,
      designation: article.designation,
      prixUnitaire: article.prix,
      quantite,
      unite: article.unite,
      remise: 0,
    },
  ];
}

export function modifierQuantite(
  lignes: LignePanier[],
  ligneId: string,
  quantite: number,
): LignePanier[] {
  if (quantite <= 0) return lignes.filter((ligne) => ligne.id !== ligneId);
  return lignes.map((ligne) =>
    ligne.id === ligneId ? { ...ligne, quantite } : ligne,
  );
}

export function definirRemise(
  lignes: LignePanier[],
  ligneId: string,
  remise: number,
): LignePanier[] {
  return lignes.map((ligne) =>
    ligne.id === ligneId
      ? { ...ligne, remise: Math.max(0, Math.min(remise, brutLigne(ligne))) }
      : ligne,
  );
}

export function retirerLigne(lignes: LignePanier[], ligneId: string): LignePanier[] {
  return lignes.filter((ligne) => ligne.id !== ligneId);
}
