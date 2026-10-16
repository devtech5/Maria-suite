import type { Metadata } from "next";
import Link from "next/link";

import { ToutMarquerLu } from "@/components/communication/tout-marquer-lu";
import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { notificationsDe } from "@/modules/communication/notifications";

export const metadata: Metadata = { title: "Notifications" };

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

/** Toutes les notifications de la personne connectée, les cent dernières. */
export default async function PageNotifications({ searchParams }: PageProps<"/notifications">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  // Le compte des non lues porte sur toutes ; seule la liste suit la recherche.
  const [toutes, trouvees] = await Promise.all([
    notificationsDe(session.organizationId, session.userId, 100),
    filtres.actif ? notificationsDe(session.organizationId, session.userId, 100, filtres) : null,
  ]);
  const liste = trouvees ?? toutes;
  const nonLues = toutes.filter((n) => !n.lueLe).length;

  return (
    <>
      <EnTetePage
        titre="Notifications"
        sousTitre={nonLues > 0 ? `${nonLues} non lue${nonLues > 1 ? "s" : ""}` : "Tout est lu"}
        actions={nonLues > 0 ? <ToutMarquerLu /> : undefined}
      />
      {toutes.length > 0 && (
        <Recherche
          chemin="/notifications"
          valeur={filtres.q}
          placeholder="Titre, contenu : tâche, dépense, bon de caisse…"
          periode={{ ...filtres.periode, libelle: "Reçue" }}
          resultats={filtres.actif ? `${fmtEntier(liste.length)} notification${liste.length > 1 ? "s" : ""}` : undefined}
        />
      )}
      {toutes.length === 0 ? (
        <EtatVide titre="Aucune notification" message="Vous serez prévenu ici d'une tâche qu'on vous attribue, d'une dépense ou d'un bon de caisse qui attend votre approbation." />
      ) : liste.length === 0 ? (
        <EtatVide titre="Aucun résultat" message="Aucune de vos notifications ne répond. Élargissez la période ou retirez un mot." />
      ) : (
        <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {liste.map((n) => {
            const contenu = (
              <span className="flex items-start gap-3">
                <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.lueLe ? "bg-transparent" : "bg-marque-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.lueLe ? "" : "font-semibold"}`}>{n.titre}</span>
                  {n.corps && <span className="block text-xs text-[var(--encre-douce)]">{n.corps}</span>}
                </span>
                <span className="chiffres shrink-0 text-xs text-[var(--encre-faible)]">{HEURE.format(n.createdAt)}</span>
              </span>
            );
            return (
              <li key={n.id} className="px-4 py-3">
                {n.lien ? (
                  <Link href={n.lien} className="block hover:underline">
                    {contenu}
                  </Link>
                ) : (
                  contenu
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
