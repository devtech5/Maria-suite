/**
 * Origine d'un tiers : local (du pays de l'entreprise) ou international.
 *
 * Sans base ni React. Il n'y a pas de colonne « origine » : elle se déduit
 * du pays du tiers (`tiers.pays_code`), seule source de vérité. Nul, ou le
 * pays de l'entreprise : local. Un autre pays : international. Deux champs
 * qui disent la même chose finiraient par se contredire.
 *
 * Ce que l'origine change pour un fournisseur : l'identifiant fiscal n'est
 * plus le NCC ivoirien mais celui de son pays, les délais de livraison sont
 * ceux d'un import, et la dette se suit à part.
 */

export const ORIGINES = ["local", "international"] as const;
export type OrigineTiers = (typeof ORIGINES)[number];

export const estOrigine = (v: unknown): v is OrigineTiers => v === "local" || v === "international";

/**
 * Pays proposés à l'international : l'Afrique de l'Ouest et du Centre, puis
 * les partenaires commerciaux courants. Le pays de l'entreprise n'est jamais
 * proposé (ce serait un fournisseur local).
 */
export const PAYS_PROPOSES = [
  "BF", "BJ", "CM", "CD", "CG", "CV", "GA", "GH", "GM", "GN", "GW", "LR", "MA", "ML", "MR", "NE", "NG", "SL", "SN", "TG", "TN", "DZ", "EG", "KE", "ZA", "TZ", "ET", "MU",
  "FR", "BE", "DE", "ES", "IT", "NL", "PT", "GB", "CH", "TR",
  "CN", "IN", "AE", "JP", "KR", "VN", "TH", "ID", "MY", "LB",
  "US", "CA", "BR",
] as const;

const COURT = /^[A-Z]{2}$/;

/** Nom français d'un pays : « France », « Côte d'Ivoire ». Le code, faute de mieux. */
export function nomPays(code: string | null | undefined): string {
  if (!code || !COURT.test(code.toUpperCase())) return code ?? "";
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function origineDe(paysCode: string | null | undefined, paysEntreprise: string): OrigineTiers {
  return !paysCode || paysCode.toUpperCase() === paysEntreprise.toUpperCase() ? "local" : "international";
}

/**
 * Le pays à enregistrer pour une origine choisie : nul pour un local (il suit
 * le pays de l'entreprise), le pays choisi pour un international. Une erreur
 * lisible si l'international n'a pas de pays, ou en a un qui est le nôtre.
 */
export function paysPourOrigine(origine: OrigineTiers, paysChoisi: string | null | undefined, paysEntreprise: string): { paysCode: string | null } | { erreur: string } {
  if (origine === "local") return { paysCode: null };
  const code = (paysChoisi ?? "").trim().toUpperCase();
  if (!(PAYS_PROPOSES as readonly string[]).includes(code)) return { erreur: "Choisissez le pays du fournisseur international." };
  if (code === paysEntreprise.toUpperCase()) return { erreur: `Un fournisseur de ${nomPays(paysEntreprise)} est local : choisissez « Local ».` };
  return { paysCode: code };
}
