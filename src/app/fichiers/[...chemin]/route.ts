import { env } from "@/env";
import { typeServi } from "@/lib/apercu";
import { lireSigne } from "@/lib/stockage/local";

/**
 * Lecture d'un fichier du dépôt disque (développement, ou VPS avec volume).
 * L'URL est signée et expire : c'est elle qui autorise.
 *
 * Servi `inline` : la visionneuse l'affiche dans la plateforme. Le
 * téléchargement passe par l'attribut `download` du lien, qui porte le nom
 * d'origine ; `?telecharger=1` force la boîte d'enregistrement pour un
 * navigateur qui l'ignorerait.
 */
export async function GET(requete: Request, { params }: { params: Promise<{ chemin: string[] }> }) {
  if (!env.STOCKAGE_LOCAL) return new Response(null, { status: 404 });

  const { chemin } = await params;
  const url = new URL(requete.url);
  const cle = chemin.join("/");
  const contenu = await lireSigne(cle, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "");
  if (!contenu) return new Response("Lien expiré ou invalide.", { status: 403 });

  return new Response(new Uint8Array(contenu), {
    headers: {
      "Content-Type": typeServi(cle),
      "Content-Disposition": url.searchParams.get("telecharger") === "1" ? "attachment" : "inline",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
