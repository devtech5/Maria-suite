import "server-only";

import { cache } from "react";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";

/**
 * Qui fait quoi dans l'annuaire. Lire et tenir sont deux droits : lire
 * l'annuaire ne donne ni la main sur les adresses ni les numéros personnels.
 */
export const accesContacts = cache(async () => {
  const session = await exigerEntreprise();
  const [consulter, gerer] = await Promise.all([peut("contacts.consulter"), peut("contacts.gerer")]);
  return { session, consulter: consulter || gerer, gerer };
});
