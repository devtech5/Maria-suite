import { rateOf } from "@/lib/money";

/**
 * Moteur de paie — logique pure, sans base ni React.
 *
 * ⚠️ Les taux ci-dessous sont des taux de DÉMONSTRATION. Ils doivent être
 * vérifiés auprès de la CNPS et de la DGI, et confrontés à des bulletins
 * réels, avant toute mise en production. Un barème approximatif dans un moteur
 * de paie est une faute, pas un détail : le concurrent affiche des taux
 * sénégalais — IPRES, CSS, TRIMF — sur des écrans vendus en Côte d'Ivoire.
 *
 * Ce qui est vrai dès maintenant, et qui est le vrai sujet : la CASCADE est
 * juste. Net = brut − cotisations salariales − impôt, donc le net est toujours
 * inférieur au brut. La capture marketing du concurrent affiche un net
 * SUPÉRIEUR au brut sur chacune de ses lignes — 120 000 de brut, 13 420 de
 * retenues, 132 000 de net.
 *
 * Tous les taux sont en POINTS DE BASE : 630 = 6,30 %. Un taux social porte
 * des décimales, et `percentOf` ne les tient pas. Le stocker en points de base
 * garde l'entier de bout en bout, du barème jusqu'au bulletin.
 */

export interface BaremeSocial {
  /** Retraite CNPS — part salariale, en points de base. */
  cnpsRetraiteSalarieBp: number;
  /** Retraite CNPS — part patronale. */
  cnpsRetraitePatronalBp: number;
  /** Plafond mensuel de l'assiette retraite, en francs. */
  cnpsPlafondMensuel: number;
  /** Prestations familiales — entièrement patronal. */
  prestationsFamilialesBp: number;
  /** Accident du travail — patronal, variable selon le risque de l'activité. */
  accidentTravailBp: number;
  /** Vrai tant que les taux n'ont pas été confrontés à des bulletins réels. */
  aVerifier: boolean;
}

export const BAREME_CI: BaremeSocial = {
  cnpsRetraiteSalarieBp: 630,
  cnpsRetraitePatronalBp: 770,
  cnpsPlafondMensuel: 3_375_000,
  prestationsFamilialesBp: 575,
  accidentTravailBp: 200,
  aVerifier: true,
};

/**
 * Tranches de l'impôt sur les traitements et salaires.
 *
 * `plancher` est la limite HAUTE de la tranche précédente : au-delà du dernier
 * plancher, le taux marginal s'applique sans limite. `cumul` porte l'impôt dû
 * sur toutes les tranches inférieures, ce qui évite de reparcourir le barème.
 */
interface TrancheIts {
  plancher: number;
  cumul: number;
  tauxBp: number;
}

const TRANCHES_ITS: readonly TrancheIts[] = [
  { plancher: 800_000, cumul: 30_475, tauxBp: 1_000 },
  { plancher: 240_000, cumul: 2_475, tauxBp: 500 },
  { plancher: 75_000, cumul: 0, tauxBp: 150 },
];

/**
 * Impôt sur le salaire, barème progressif par tranches.
 *
 * ⚠️ Barème simplifié de démonstration. À remplacer par le barème réel de la
 * DGI, qui tient compte des parts de quotient familial.
 */
export function impotSurSalaire(baseImposable: number): number {
  if (baseImposable <= 0) return 0;

  for (const tranche of TRANCHES_ITS) {
    if (baseImposable > tranche.plancher) {
      return tranche.cumul + rateOf(baseImposable - tranche.plancher, tranche.tauxBp);
    }
  }

  return 0;
}

/** Ce qu'il faut savoir d'un collaborateur pour établir son bulletin. */
export interface BaseBulletin {
  id: string;
  matricule: string;
  nom: string;
  salaireBase: number;
}

export interface Bulletin<T extends BaseBulletin = BaseBulletin> {
  employe: T;
  brut: number;
  cotisationsSalariales: number;
  impot: number;
  net: number;
  chargesPatronales: number;
  /** Ce que l'employeur débourse réellement : brut plus charges patronales. */
  coutTotal: number;
}

/**
 * Établit un bulletin. Cascade explicite, vérifiable à la main.
 *
 * L'assiette des cotisations est PLAFONNÉE, celle des prestations familiales et
 * de l'accident du travail ne l'est pas : appliquer le plafond partout ferait
 * sous-déclarer les charges patronales sur les hauts salaires, et l'écart ne
 * se découvrirait qu'au contrôle.
 */
export function calculerBulletin<T extends BaseBulletin>(
  employe: T,
  bareme: BaremeSocial = BAREME_CI,
): Bulletin<T> {
  const brut = employe.salaireBase;
  const assiette = Math.min(brut, bareme.cnpsPlafondMensuel);

  const cotisationsSalariales = rateOf(assiette, bareme.cnpsRetraiteSalarieBp);
  const impot = impotSurSalaire(brut - cotisationsSalariales);
  const net = brut - cotisationsSalariales - impot;

  const chargesPatronales =
    rateOf(assiette, bareme.cnpsRetraitePatronalBp) +
    rateOf(brut, bareme.prestationsFamilialesBp) +
    rateOf(brut, bareme.accidentTravailBp);

  return {
    employe,
    brut,
    cotisationsSalariales,
    impot,
    net,
    chargesPatronales,
    coutTotal: brut + chargesPatronales,
  };
}

// -------------------------------------------------------------- intervenants

export type ModeRemuneration = "journee" | "tache" | "unite" | "forfait";

export const LIBELLE_MODE: Record<ModeRemuneration, string> = {
  journee: "À la journée",
  tache: "À la tâche",
  unite: "À l'unité d'œuvre",
  forfait: "Au forfait",
};

// ---------------------------------------------------------------- échéances

/**
 * Jours restants avant le terme d'un contrat, à partir d'une date ISO.
 *
 * `null` pour un contrat sans terme : un CDI n'expire pas, et le faire figurer
 * parmi les contrats « hors délai » ferait paniquer pour rien. Le calcul se
 * fait en jours civils, donc sur des dates nues — passer par l'heure locale
 * ferait basculer une échéance d'un jour selon le fuseau du navigateur.
 */
export function joursAvantTerme(fin: string | null, aujourdhui: Date): number | null {
  if (!fin) return null;

  const terme = Date.parse(`${fin}T00:00:00Z`);
  if (Number.isNaN(terme)) return null;

  const jour = Date.UTC(
    aujourdhui.getUTCFullYear(),
    aujourdhui.getUTCMonth(),
    aujourdhui.getUTCDate(),
  );

  return Math.round((terme - jour) / 86_400_000);
}
