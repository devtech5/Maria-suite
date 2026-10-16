import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";

import { referentielPays, type ReferentielPays } from "./pays";

/** Ce que portent les en-têtes et pieds de tous les documents imprimés. */
export interface IdentiteEntreprise {
  nom: string;
  formeJuridique: string | null;
  identifiantFiscal: string | null;
  rccm: string | null;
  regimeFiscal: string | null;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  logo: string | null;
  /** Couleur primaire : en-tête, raison sociale, titre de la pièce. */
  couleur: string;
  /** Couleur secondaire : filets d'accent. */
  couleurSecondaire: string;
  piedDePage: string | null;
  pays: string;
  referentiel: ReferentielPays;
}

/** Couleurs de MARIA GROUP SARL : bleu nuit et or. */
export const COULEUR_PAR_DEFAUT = "#162E49";
export const COULEUR_SECONDAIRE_PAR_DEFAUT = "#BFA169";

export async function identiteEntreprise(organizationId: string): Promise<IdentiteEntreprise> {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!o) throw new Error("Entreprise introuvable.");
  return {
    nom: o.name,
    formeJuridique: o.legalForm,
    identifiantFiscal: o.taxId,
    rccm: o.rccm,
    regimeFiscal: o.taxRegime,
    adresse: o.address,
    ville: o.city,
    telephone: o.phone,
    email: o.email,
    logo: o.logo,
    couleur: o.couleurDocuments ?? COULEUR_PAR_DEFAUT,
    couleurSecondaire: o.couleurSecondaire ?? COULEUR_SECONDAIRE_PAR_DEFAUT,
    piedDePage: o.piedDePage,
    pays: o.countryCode,
    referentiel: referentielPays(o.countryCode),
  };
}

/** Lignes d'en-tête du ticket de caisse : courtes, sans le nom (déjà en titre). */
export function lignesTicket(i: IdentiteEntreprise): string[] {
  return [
    [i.adresse, i.ville].filter(Boolean).join(", "),
    i.telephone ? `Tél. ${i.telephone}` : "",
    i.identifiantFiscal ? `${i.referentiel.identifiantFiscal} ${i.identifiantFiscal}` : "",
  ].filter(Boolean);
}
