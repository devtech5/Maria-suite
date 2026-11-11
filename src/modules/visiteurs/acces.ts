import "server-only";

import { cache } from "react";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";

import { accueilsDeLAgent } from "./requetes";

/**
 * Qui agit, et sur quels accueils : la supervision voit tous les accueils ;
 * un agent, ceux qu'il tient ; les autres, aucun. Même règle pour les pages
 * et pour les actions.
 */
export const accesVisiteurs = cache(async () => {
  const session = await exigerEntreprise();
  const [accueillir, annoncer, superviser] = await Promise.all([peut("visiteurs.accueillir"), peut("visiteurs.annoncer"), peut("visiteurs.superviser")]);
  /** Accueils lisibles ; nul = tous. */
  const permis = superviser ? null : accueillir ? await accueilsDeLAgent(session.organizationId, session.userId) : [];
  return {
    session,
    accueillir: accueillir || superviser,
    annoncer: annoncer || accueillir || superviser,
    superviser,
    permis,
    accueilPermis: (id: string) => permis === null || permis.includes(id),
  };
});
