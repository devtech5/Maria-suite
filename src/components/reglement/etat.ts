import type { TonPastille } from "@/components/ui/primitives";
import type { EtatVersion } from "@/modules/reglement/regles";

/** Couleur de la pastille d'état d'une version. */
export const TON_ETAT: Record<EtatVersion, TonPastille> = { brouillon: "neutre", a_venir: "alerte", en_vigueur: "valide", remplacee: "neutre" };

/** « 10 novembre 2026 à 21:15 », à l'heure d'Abidjan. */
export const HORODATAGE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });
