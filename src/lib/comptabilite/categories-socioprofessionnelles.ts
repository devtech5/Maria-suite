/**
 * Catégories socioprofessionnelles des effectifs (note annexe 27B du
 * SYSCOHADA révisé). Elles se portent sur le poste : tous ceux qui l'occupent
 * en héritent. Sans dépendance, pour servir aussi à l'écran des postes.
 */

/** Catégories socioprofessionnelles de la note 27B, portées par le poste. */
export const CATEGORIES_SOCIOPROFESSIONNELLES = [
  { cle: "cadre_superieur", libelle: "Cadres supérieurs" },
  { cle: "cadre_moyen", libelle: "Techniciens supérieurs et cadres moyens" },
  { cle: "maitrise", libelle: "Techniciens, agents de maîtrise et ouvriers qualifiés" },
  { cle: "employe", libelle: "Employés, manœuvres, ouvriers et apprentis" },
] as const;

export type CategorieSocioprofessionnelle = (typeof CATEGORIES_SOCIOPROFESSIONNELLES)[number]["cle"];

export const estCategorie = (v: unknown): v is CategorieSocioprofessionnelle =>
  CATEGORIES_SOCIOPROFESSIONNELLES.some((c) => c.cle === v);
