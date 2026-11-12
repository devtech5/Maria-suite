/**
 * Types de client : à qui l'on a affaire.
 *
 * Sans base ni React — partagé par les formulaires, la fiche, la reprise et
 * la prospection. L'ordre est celui de l'énumération `nature_tiers` en base :
 * un type nouveau s'ajoute à la FIN, sinon la migration recrée le type au
 * lieu de l'étendre.
 *
 * Le type ne change ni la comptabilisation (tout client se solde en 411) ni
 * la numérotation : il dit comment on traite avec lui. Une ONG, une mutuelle
 * ou une coopérative décide en bureau ou en assemblée, d'où un interlocuteur
 * à connaître ; un particulier décide seul.
 */

export const NATURES_TIERS = ["entreprise", "particulier", "ong", "mutuelle", "association", "cooperative"] as const;
export type NatureTiers = (typeof NATURES_TIERS)[number];

export const LIBELLE_NATURE_TIERS: Record<NatureTiers, string> = {
  particulier: "Particulier",
  entreprise: "Entreprise",
  ong: "ONG",
  mutuelle: "Mutuelle",
  association: "Association",
  cooperative: "Coopérative",
};

export const estNatureTiers = (v: unknown): v is NatureTiers => typeof v === "string" && (NATURES_TIERS as readonly string[]).includes(v);

/** Tout sauf le particulier : une personne morale, qui a des contacts. */
export const estPersonneMorale = (n: NatureTiers): boolean => n !== "particulier";

/**
 * Le type lu dans une saisie libre — colonne d'un fichier importé, réponse
 * d'un tableur. Sans accents ni casse ; « SARL », « société » valent
 * entreprise. Ce qui ne se reconnaît pas reste une entreprise : c'est le cas
 * le plus courant d'un fichier clients professionnel.
 */
export function natureDepuisSaisie(saisie: string | null | undefined): NatureTiers {
  const s = (saisie ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (s.startsWith("part") || s.startsWith("pers")) return "particulier";
  if (s === "ong" || s.startsWith("organisation non")) return "ong";
  if (s.startsWith("mutuel")) return "mutuelle";
  if (s.startsWith("asso")) return "association";
  if (s.startsWith("coop") || s.startsWith("scoop")) return "cooperative";
  return "entreprise";
}
