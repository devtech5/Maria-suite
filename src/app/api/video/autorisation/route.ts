import { cheminDeReunion } from "@/modules/meeting/calcul";
import { deciderReunion } from "@/modules/meeting/autorisation";
import { deciderVideo } from "@/modules/securite/autorisation";

/**
 * Authentification externe du serveur vidéo (MediaMTX, `authMethod: http`).
 *
 * Le serveur vidéo appelle cette adresse avant chaque publication et chaque
 * lecture, avec ce qu'il sait de la demande. Une réponse 200 l'autorise ;
 * toute autre la refuse. Aucune session : c'est le serveur vidéo qui appelle,
 * et la décision repose sur la clé du relais ou sur un jeton signé.
 *
 * Deux modules partagent le serveur : les caméras des sites (`s/…`, Sécurité)
 * et les réunions (`m/…`, Meeting). Le chemin dit à qui revient la décision.
 */
export const dynamic = "force-dynamic";

export async function POST(requete: Request) {
  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const chaine = (v: unknown) => (typeof v === "string" ? v : undefined);

  try {
    const demande = {
      action: chaine(corps.action) ?? "",
      path: chaine(corps.path) ?? "",
      user: chaine(corps.user),
      password: chaine(corps.password),
      query: chaine(corps.query),
      token: chaine(corps.token),
    };
    const decision = cheminDeReunion(demande.path) ? await deciderReunion(demande) : await deciderVideo(demande);
    return new Response(null, { status: decision.autorise ? 200 : 401 });
  } catch (erreur) {
    // En cas de doute, on refuse : une caméra ne s'ouvre pas sur une erreur.
    console.error("Autorisation vidéo", erreur);
    return new Response(null, { status: 401 });
  }
}
