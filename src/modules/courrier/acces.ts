import "server-only";

import { cache } from "react";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";

import type { LignePli } from "./requetes";

/**
 * Qui voit quoi dans le courrier.
 *
 *   · le registre (`courrier.consulter`) voit tous les plis ; un pli
 *     CONFIDENTIEL n'y montre ni son objet ni son scan, sauf à qui l'impute,
 *     à qui il est imputé et à qui l'a enregistré ;
 *   · chacun (`courrier.recevoir`, droit de tous) voit les plis qui lui sont
 *     imputés.
 */
export const accesCourrier = cache(async () => {
  const session = await exigerEntreprise();
  const [consulter, enregistrer, imputer, recevoir] = await Promise.all([
    peut("courrier.consulter"),
    peut("courrier.enregistrer"),
    peut("courrier.imputer"),
    peut("courrier.recevoir"),
  ]);
  const moi = session.userId;
  const sien = (p: Pick<LignePli, "imputeUserId">) => p.imputeUserId === moi;
  const voit = (p: Pick<LignePli, "imputeUserId">) => consulter || enregistrer || imputer || (recevoir && sien(p));
  const voitContenu = (p: Pick<LignePli, "imputeUserId" | "confidentiel" | "enregistrePar">) =>
    voit(p) && (!p.confidentiel || imputer || sien(p) || p.enregistrePar === moi);
  return { session, consulter: consulter || enregistrer || imputer, enregistrer, imputer, recevoir, sien, voit, voitContenu };
});

/** Ce qu'un pli confidentiel montre à qui n'en voit pas le contenu. */
export function masquer<T extends LignePli>(p: T, contenu: boolean): T {
  return contenu ? p : { ...p, objet: "Pli confidentiel", reference: null, instructions: null, noteTraitement: null, scan: false };
}
