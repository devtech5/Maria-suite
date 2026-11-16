"use client";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { associerArticle } from "@/modules/calculs/actions";
import { LIBELLES_UNITE, type ArticleChiffrage, type UniteMateriau } from "@/modules/calculs/notes";

/**
 * Un matériau, un article. Seuls les articles de la même unité se proposent :
 * le ciment se compte en sacs (pièces), le sable en m³, le fer non découpé
 * en kg. Chaque choix s'enregistre aussitôt.
 */
export function Correspondances({
  lignes,
  articles,
}: {
  lignes: { cle: string; libelle: string; unite: UniteMateriau; articleId: string | null }[];
  articles: (ArticleChiffrage & { reference: string })[];
}) {
  const op = useOperation();
  return (
    <div className="space-y-3 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5">
      {articles.length === 0 && (
        <p className="rounded-lg bg-alerte-50 px-3 py-2 text-sm text-alerte-600">
          Le catalogue n&apos;a encore aucune marchandise active : créez d&apos;abord les articles (ciment, sable, fer…) dans « Stock ».
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--encre-faible)]">
              <th className="py-1 pr-2 font-medium">Matériau</th>
              <th className="px-2 font-medium">Unité</th>
              <th className="px-2 font-medium">Article</th>
              <th className="px-2 text-right font-medium">Achat / vente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--filet)]">
            {lignes.map((l) => {
              const compatibles = articles.filter((a) => a.unite === l.unite);
              const a = articles.find((x) => x.id === l.articleId);
              return (
                <tr key={l.cle}>
                  <td className="py-2 pr-2">{l.libelle}</td>
                  <td className="px-2">{LIBELLES_UNITE[l.unite]}</td>
                  <td className="px-2 py-1">
                    <select
                      aria-label={`Article pour ${l.libelle}`}
                      defaultValue={l.articleId ?? ""}
                      disabled={op.enCours}
                      onChange={(e) => op.lancer(() => associerArticle(l.cle, e.target.value || null))}
                      className={`${CLASSE_CHAMP} min-w-[14rem]`}
                    >
                      <option value="">— Aucun —</option>
                      {compatibles.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.designation} ({x.reference})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="chiffres whitespace-nowrap px-2 text-right">{a ? `${formatMoney(a.prixAchat)} / ${formatMoney(a.prixVente)}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Retour resultat={op.resultat} />
    </div>
  );
}
