import "server-only";

import { moduleOuvert } from "@/lib/modules/garde";
import type { Decision, DemandeVideo } from "@/modules/securite/autorisation";

import { lireChemin } from "./calcul";
import { verifierFlux } from "./jetons";
import { placeDansReunion } from "./requetes";

const refus = (raison: string): Decision => ({ autorise: false, raison });

/**
 * Ce que le serveur vidéo demande avant chaque flux de réunion.
 *
 *   · publish — le participant publie SES flux, sous `m/<réunion>/<lui>/…`,
 *     avec un jeton de publication émis pour lui et cette réunion ;
 *   · read    — un participant lit les flux de la réunion avec un jeton de
 *     lecture émis pour elle ;
 *   · dans les deux cas, la réunion doit être en cours et le titulaire du
 *     jeton toujours invité : une réunion terminée ne se publie ni ne se lit.
 */
export async function deciderReunion(demande: DemandeVideo, maintenant = new Date()): Promise<Decision> {
  const chemin = lireChemin(demande.path ?? "");
  if (!chemin) return refus("chemin inconnu");
  if (!moduleOuvert("meeting")) return refus("module fermé");

  const jeton = demande.token || new URLSearchParams(demande.query ?? "").get("jeton") || "";
  const objet = verifierFlux(jeton, maintenant.getTime());
  if (!objet) return refus("jeton de flux");
  if (objet.reunionId !== chemin.reunionId) return refus("jeton d'une autre réunion");

  if (demande.action === "publish") {
    if (objet.sens !== "publier") return refus("jeton de lecture");
    if (objet.userId !== chemin.userId) return refus("flux d'un autre participant");
  } else if (demande.action === "read") {
    if (objet.sens !== "lire") return refus("jeton de publication");
  } else {
    return refus(`action ${demande.action}`);
  }

  const place = await placeDansReunion(chemin.reunionId, objet.userId);
  if (!place || place.organizationId !== objet.organizationId) return refus("réunion inconnue");
  if (place.statut !== "en_cours") return refus("réunion close");
  if (!place.invite) return refus("participant retiré");
  return { autorise: true };
}
