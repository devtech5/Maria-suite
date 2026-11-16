import "server-only";

import { cache } from "react";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";

/** Calculer et régler sont deux droits : qui calcule ne change pas les dosages. */
export const accesCalculs = cache(async () => {
  const session = await exigerEntreprise();
  const [utiliser, regler] = await Promise.all([peut("calculs.utiliser"), peut("calculs.regler")]);
  return { session, utiliser: utiliser || regler, regler };
});
