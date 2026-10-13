import "server-only";

import { moduleOuvert } from "@/lib/modules/garde";

import { lireChemin } from "./calcul";
import { noterRelaisVu } from "./creation";
import { cleValide, verifierLecture } from "./jetons";
import { siteEtCameraDuChemin } from "./requetes";

/**
 * Ce que le serveur vidéo (MediaMTX) demande à Maria Suite avant chaque
 * publication et chaque lecture — son « authentification HTTP externe ».
 * Maria Suite répond oui ou non ; le serveur vidéo applique.
 */
export interface DemandeVideo {
  action: string;
  path: string;
  user?: string;
  password?: string;
  /** Chaîne de requête de l'adresse lue : porte le jeton de lecture. */
  query?: string;
  /** Jeton « Bearer », pour les versions de MediaMTX qui le transmettent à part. */
  token?: string;
}

export type Decision = { autorise: true } | { autorise: false; raison: string };

const refus = (raison: string): Decision => ({ autorise: false, raison });

/**
 * Décide d'une demande.
 *
 *   · publish — le relais d'un site publie sous `s/<son site>/<sa caméra>/…`,
 *     avec l'identifiant de son site et sa clé. Rien d'autre.
 *   · read    — un navigateur lit avec un jeton de lecture signé, émis pour
 *     cette caméra et cette qualité, il y a moins de deux minutes.
 *   · le reste (API, métriques, relecture) — refusé : rien de tout cela n'a à
 *     être ouvert depuis l'extérieur.
 */
export async function deciderVideo(demande: DemandeVideo, maintenant = new Date()): Promise<Decision> {
  const chemin = lireChemin(demande.path ?? "");
  if (!chemin) return refus("chemin inconnu");

  const ligne = await siteEtCameraDuChemin(chemin.siteId, chemin.cameraId);
  if (!ligne) return refus("caméra inconnue");
  const { site, camera } = ligne;
  if (!moduleOuvert("securite")) return refus("module fermé");

  if (demande.action === "publish") {
    if (demande.user?.toLowerCase() !== site.id) return refus("site du relais");
    if (!cleValide(demande.password ?? "", site.relaisEmpreinte)) return refus("clé du relais");
    if (!site.actif || !camera.actif) return refus("caméra retirée");
    if (chemin.qualite === "hd" && !camera.hd) return refus("haute définition non prévue");
    await noterRelaisVu(site.id, maintenant);
    return { autorise: true };
  }

  if (demande.action === "read") {
    const jeton = demande.token || new URLSearchParams(demande.query ?? "").get("jeton") || "";
    const objet = verifierLecture(jeton, maintenant.getTime());
    if (!objet) return refus("jeton de lecture");
    if (objet.organizationId !== site.organizationId || objet.cameraId !== camera.id || objet.qualite !== chemin.qualite) {
      return refus("jeton d'une autre caméra");
    }
    if (!site.actif || !camera.actif) return refus("caméra retirée");
    return { autorise: true };
  }

  return refus(`action ${demande.action}`);
}
