/**
 * Bon de commande interne : règles pures.
 *
 * Le personnel exprime un besoin d'équipement ou de fournitures (ordinateurs
 * par poste, téléphones, abonnements…), chiffré ligne par ligne et regroupé
 * en rubriques. La direction l'approuve ou le refuse ; le bon imprimé porte
 * les visas du demandeur, de la comptable et de la PDG.
 *
 * Distinct du bon de commande STANDARD (Achats), adressé à un fournisseur et
 * suivi jusqu'à la réception : celui-ci reste dans la maison.
 *
 * Tout est entier : quantités en unités, prix et montants en francs.
 */

export const LIGNES_MAX = 100;
export const QUANTITE_MAX = 1_000_000;
/** Mille milliards de francs : au-delà, c'est une faute de frappe. */
export const PRIX_MAX = 1_000_000_000_000;
const DESIGNATION_MAX = 200;
const RUBRIQUE_MAX = 120;

export type StatutCommandeInterne = "demande" | "approuve" | "rejete" | "annule";

export interface LigneCommandeInterne {
  /** Regroupement à l'impression : « Achat d'ordinateurs ». Vide : sans rubrique. */
  rubrique: string;
  designation: string;
  quantite: number;
  prixUnitaire: number;
}

export interface RubriqueCommande {
  rubrique: string;
  lignes: (LigneCommandeInterne & { montant: number })[];
  sousTotal: number;
}

export function montantLigne(l: Pick<LigneCommandeInterne, "quantite" | "prixUnitaire">): number {
  const m = l.quantite * l.prixUnitaire;
  if (!Number.isSafeInteger(m)) throw new Error("Montant de ligne hors limites.");
  return m;
}

export function totalCommande(lignes: readonly LigneCommandeInterne[]): number {
  const total = lignes.reduce((s, l) => s + montantLigne(l), 0);
  if (!Number.isSafeInteger(total)) throw new Error("Total hors limites.");
  return total;
}

/**
 * Lignes regroupées par rubrique, dans l'ordre où chaque rubrique apparaît
 * pour la première fois. Les sous-totaux retombent exactement sur le total.
 */
export function regrouperParRubrique(lignes: readonly LigneCommandeInterne[]): RubriqueCommande[] {
  const groupes = new Map<string, RubriqueCommande>();
  for (const l of lignes) {
    const cle = l.rubrique.trim();
    const groupe = groupes.get(cle) ?? { rubrique: cle, lignes: [], sousTotal: 0 };
    const montant = montantLigne(l);
    groupes.set(cle, { ...groupe, lignes: [...groupe.lignes, { ...l, montant }], sousTotal: groupe.sousTotal + montant });
  }
  return [...groupes.values()];
}

/** Nombre entier saisi : chiffres et espaces seulement. */
function entier(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) ? v : null;
  if (typeof v !== "string") return null;
  const propre = v.replace(/[\s  ]/g, "");
  return /^\d+$/.test(propre) ? Number(propre) : null;
}

const chaine = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * Relit les lignes envoyées par le navigateur. Rend les lignes propres, ou
 * le message de la première erreur. Une ligne entièrement vide est ignorée.
 */
export function lireLignes(brut: unknown): LigneCommandeInterne[] | string {
  if (!Array.isArray(brut)) return "Lignes illisibles.";
  const lignes: LigneCommandeInterne[] = [];
  for (const [i, b] of brut.entries()) {
    const o = (typeof b === "object" && b !== null ? b : {}) as Record<string, unknown>;
    const rubrique = chaine(o.rubrique);
    const designation = chaine(o.designation);
    const vide = !designation && chaine(o.quantite) === "" && chaine(o.prixUnitaire) === "" && typeof o.quantite !== "number";
    if (vide) continue;
    const n = i + 1;
    if (!designation) return `Ligne ${n} : désignation manquante.`;
    if (designation.length > DESIGNATION_MAX) return `Ligne ${n} : désignation trop longue (${DESIGNATION_MAX} caractères au plus).`;
    if (rubrique.length > RUBRIQUE_MAX) return `Ligne ${n} : rubrique trop longue (${RUBRIQUE_MAX} caractères au plus).`;
    const quantite = entier(o.quantite);
    if (quantite === null || quantite < 1 || quantite > QUANTITE_MAX) return `Ligne ${n} : quantité en nombre entier, au moins 1.`;
    const prixUnitaire = entier(o.prixUnitaire);
    if (prixUnitaire === null || prixUnitaire > PRIX_MAX) return `Ligne ${n} : prix unitaire en francs entiers.`;
    lignes.push({ rubrique, designation, quantite, prixUnitaire });
  }
  if (lignes.length === 0) return "Ajoutez au moins une ligne.";
  if (lignes.length > LIGNES_MAX) return `${LIGNES_MAX} lignes au plus par bon.`;
  const total = (() => {
    try {
      return totalCommande(lignes);
    } catch {
      return null;
    }
  })();
  if (total === null || total > PRIX_MAX) return "Total hors limites : vérifiez les quantités et les prix.";
  if (total <= 0) return "Le bon ne peut pas totaliser zéro franc.";
  return lignes;
}
