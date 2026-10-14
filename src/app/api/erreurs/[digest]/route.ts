import type { NextRequest } from "next/server";

import { session } from "@/lib/auth/dal";
import { erreurParDigest } from "@/lib/erreurs-recentes";

export const dynamic = "force-dynamic";

/**
 * Détail d'une erreur serveur, par son code, pour l'écran d'erreur.
 *
 * Réservé au propriétaire : un message de pilote peut citer une table, une
 * requête, une valeur. Lu par `session()` et non `exigerSession` : l'écran qui
 * le demande est peut-être celui d'une coque tombée, et une redirection
 * effacerait ce qu'il montre. Un écran verrouillé, lui, n'apprend rien.
 */
export async function GET(_requete: NextRequest, ctx: RouteContext<"/api/erreurs/[digest]">) {
  const qui = await session();
  if (!qui || qui.verrouillee || !qui.estProprietaire) {
    return Response.json({ erreur: "Réservé au propriétaire." }, { status: 403 });
  }

  const { digest } = await ctx.params;
  if (!/^[\w-]{1,64}$/.test(digest)) return Response.json({ erreur: "Code illisible." }, { status: 400 });

  const trouvee = erreurParDigest(digest);
  if (!trouvee) {
    // Redémarrage depuis, ou autre conteneur : le journal Dokploy l'a toujours.
    return Response.json({ erreur: "Introuvable ici : cherchez ce code dans le journal du serveur." }, { status: 404 });
  }
  return Response.json(trouvee, { headers: { "Cache-Control": "no-store" } });
}
