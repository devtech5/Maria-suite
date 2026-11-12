/**
 * Prospection : les règles, sans base ni React.
 *
 * Un PLAN DE PROSPECTION (`PP-AAAA-NNNNN`) est élaboré par un commercial pour
 * une période : une zone, des objectifs (contacts à réaliser, nouveaux
 * clients, chiffre d'affaires visé), et la liste des PROSPECTS à approcher —
 * chacun avec son type (particulier, entreprise, ONG, mutuelle, association,
 * coopérative) et ses ACTIONS datées : visite, appel, WhatsApp, e-mail,
 * rendez-vous, démonstration.
 *
 * Une action se planifie, puis se réalise (avec son compte rendu) ou
 * s'annule. Le compte rendu fait avancer le prospect : à contacter → en
 * discussion → intéressé → converti en client, ou perdu (avec le motif). Un
 * prospect converti devient une fiche client, avec son type.
 */

import type { NatureTiers } from "@/modules/tiers/natures";

export const STATUTS_PLAN = ["ouvert", "clos"] as const;
export type StatutPlan = (typeof STATUTS_PLAN)[number];

export const STATUTS_PROSPECT = ["a_contacter", "en_discussion", "interesse", "converti", "perdu"] as const;
export type StatutProspect = (typeof STATUTS_PROSPECT)[number];

export const LIBELLE_STATUT_PROSPECT: Record<StatutProspect, string> = {
  a_contacter: "À contacter",
  en_discussion: "En discussion",
  interesse: "Intéressé",
  converti: "Devenu client",
  perdu: "Perdu",
};

export const CANAUX = ["visite", "appel", "whatsapp", "email", "rendez_vous", "demonstration"] as const;
export type Canal = (typeof CANAUX)[number];

export const LIBELLE_CANAL: Record<Canal, string> = {
  visite: "Visite",
  appel: "Appel",
  whatsapp: "WhatsApp",
  email: "E-mail",
  rendez_vous: "Rendez-vous",
  demonstration: "Démonstration",
};

export const STATUTS_ACTION = ["prevue", "realisee", "annulee"] as const;
export type StatutAction = (typeof STATUTS_ACTION)[number];

export const LIBELLE_STATUT_ACTION: Record<StatutAction, string> = { prevue: "Prévue", realisee: "Réalisée", annulee: "Annulée" };

const dans = <T extends string>(liste: readonly T[], v: unknown): v is T => typeof v === "string" && (liste as readonly string[]).includes(v);
export const estStatutProspect = (v: unknown): v is StatutProspect => dans(STATUTS_PROSPECT, v);
export const estCanal = (v: unknown): v is Canal => dans(CANAUX, v);

/** Un plan couvre au plus un an : au-delà, ce n'est plus un plan, c'est une stratégie. */
export const DUREE_MAX_JOURS = 366;

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Une vraie date du calendrier : le 30 février ne repasse pas l'aller-retour. */
export const estDate = (v: string): boolean => {
  if (!DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};

/** Jours entre deux dates `AAAA-MM-JJ`, bornes comprises. */
export function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Erreur lisible si la période ne tient pas, sinon nul. */
export function erreurPeriode(debut: string, fin: string): string | null {
  if (!estDate(debut) || !estDate(fin)) return "Indiquez le début et la fin du plan.";
  if (fin < debut) return "La fin du plan précède son début.";
  if (joursEntre(debut, fin) > DUREE_MAX_JOURS) return "Un plan couvre au plus un an.";
  return null;
}

export function formatNumero(annee: number): { cle: string; prefix: string; padding: number; periode: string } {
  return { cle: "prospection", prefix: `PP-${annee}-`, padding: 5, periode: String(annee) };
}

/**
 * Où peut aller un prospect. Le converti est définitif : il est client, la
 * suite se passe dans le fichier clients. Le perdu se rouvre — un « non »
 * d'aujourd'hui redevient une piste au prochain budget.
 */
const PASSAGES: Record<StatutProspect, readonly StatutProspect[]> = {
  a_contacter: ["en_discussion", "interesse", "perdu"],
  en_discussion: ["a_contacter", "interesse", "perdu"],
  interesse: ["en_discussion", "perdu"],
  perdu: ["a_contacter"],
  converti: [],
};

export function passagePermis(de: StatutProspect, vers: StatutProspect): boolean {
  return de === vers || PASSAGES[de].includes(vers);
}

/** Vrai si le prospect peut encore être converti en client. */
export const convertible = (s: StatutProspect): boolean => s !== "converti" && s !== "perdu";

export interface ProspectBilan {
  statut: StatutProspect;
  nature: NatureTiers;
  /** Montant d'affaires estimé, en francs entiers. */
  potentiel: number;
}

export interface ActionBilan {
  statut: StatutAction;
  datePrevue: string;
}

export interface Bilan {
  prospects: number;
  parStatut: Record<StatutProspect, number>;
  parNature: Partial<Record<NatureTiers, number>>;
  actionsPrevues: number;
  actionsRealisees: number;
  actionsEnRetard: number;
  convertis: number;
  /** Pourcentage entier, arrondi par défaut : 2 sur 3 donne 66. */
  tauxConversion: number;
  /** Potentiel des pistes encore vivantes (ni perdues, ni converties). */
  potentielOuvert: number;
  /** Potentiel des prospects devenus clients. */
  potentielGagne: number;
}

/**
 * Où en est le plan. En entiers de bout en bout : pas de taux flottant, pas
 * de somme de montants en virgule.
 */
export function bilanPlan(prospects: readonly ProspectBilan[], actions: readonly ActionBilan[], aujourdhui: string): Bilan {
  const parStatut = Object.fromEntries(STATUTS_PROSPECT.map((s) => [s, 0])) as Record<StatutProspect, number>;
  const parNature: Partial<Record<NatureTiers, number>> = {};
  let potentielOuvert = 0;
  let potentielGagne = 0;
  for (const p of prospects) {
    parStatut[p.statut] += 1;
    parNature[p.nature] = (parNature[p.nature] ?? 0) + 1;
    if (p.statut === "converti") potentielGagne += p.potentiel;
    else if (p.statut !== "perdu") potentielOuvert += p.potentiel;
  }
  const prevues = actions.filter((a) => a.statut === "prevue");
  const convertis = parStatut.converti;
  return {
    prospects: prospects.length,
    parStatut,
    parNature,
    actionsPrevues: prevues.length,
    actionsRealisees: actions.filter((a) => a.statut === "realisee").length,
    actionsEnRetard: prevues.filter((a) => a.datePrevue < aujourdhui).length,
    convertis,
    tauxConversion: prospects.length === 0 ? 0 : Math.floor((convertis * 100) / prospects.length),
    potentielOuvert,
    potentielGagne,
  };
}

/** Avancement vers un objectif, en pourcentage entier plafonné à 100 ; nul sans objectif. */
export function atteinte(realise: number, objectif: number): number | null {
  if (objectif <= 0) return null;
  return Math.min(100, Math.floor((realise * 100) / objectif));
}

/** Une action prévue dont la date est passée. */
export const actionEnRetard = (a: ActionBilan, aujourdhui: string): boolean => a.statut === "prevue" && a.datePrevue < aujourdhui;
