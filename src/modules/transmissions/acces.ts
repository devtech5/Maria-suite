import "server-only";

import { cache } from "react";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";

import type { LigneTransmission } from "./requetes";

/**
 * Qui voit quel bordereau : la supervision, tout ; les autres, ce qu'ils ont
 * émis ou établi, ce qu'ils suivent, et ce qui leur est adressé.
 */
export const accesTransmissions = cache(async () => {
  const session = await exigerEntreprise();
  const [emettre, superviser, recevoir] = await Promise.all([peut("transmissions.emettre"), peut("transmissions.superviser"), peut("transmissions.recevoir")]);
  const moi = session.userId;
  const concerne = (t: Pick<LigneTransmission, "emetteurUserId" | "responsableUserId" | "destinataireUserId" | "creePar">) =>
    t.emetteurUserId === moi || t.responsableUserId === moi || t.creePar === moi || t.destinataireUserId === moi;
  const voit = (t: Pick<LigneTransmission, "emetteurUserId" | "responsableUserId" | "destinataireUserId" | "creePar">) => superviser || ((emettre || recevoir) && concerne(t));
  /** Faire avancer : qui l'a émis ou le suit (ou la supervision) ; le destinataire, pour accuser et répondre. */
  const gere = (t: Pick<LigneTransmission, "emetteurUserId" | "responsableUserId" | "creePar">) => superviser || (emettre && (t.emetteurUserId === moi || t.responsableUserId === moi || t.creePar === moi));
  return { session, emettre: emettre || superviser, superviser, recevoir, voit, gere, moi };
});
