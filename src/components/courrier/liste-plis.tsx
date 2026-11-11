import Link from "next/link";

import { Pastille, type TonPastille } from "@/components/ui/primitives";
import { LIBELLE_STATUT, NATURES, enRetard, joursDeRetard, natureValide, type StatutPli } from "@/modules/courrier/regles";
import type { LignePli } from "@/modules/courrier/requetes";

export const TON_STATUT: Record<StatutPli, TonPastille> = {
  enregistre: "alerte",
  impute: "marque",
  recu: "marque",
  traite: "valide",
  a_expedier: "alerte",
  expedie: "marque",
  remis: "valide",
};

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" });

/** Des plis en cartes : numéro, correspondant, objet, imputation, délai. */
export function ListePlis({ plis, aujourdhui, vide }: { plis: LignePli[]; aujourdhui: string; vide: string }) {
  if (plis.length === 0) return <p className="rounded-xl border border-dashed border-[var(--filet)] px-4 py-6 text-center text-sm text-[var(--encre-douce)]">{vide}</p>;
  return (
    <ul className="divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
      {plis.map((p) => {
        const retard = enRetard(p, aujourdhui);
        return (
          <li key={p.id}>
            <Link href={`/courrier/${p.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--surface-creuse)]">
              <span className="chiffres w-32 shrink-0 text-sm font-semibold">{p.numero}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.objet}</span>
                <span className="block truncate text-sm text-[var(--encre-douce)]">
                  {p.sens === "arrivee" ? "De" : "À"} {p.correspondant}
                  {natureValide(p.nature) && ` · ${NATURES[p.nature]}`}
                  {p.imputeNom && ` · imputé à ${p.imputeNom}`}
                  {p.imputeService && ` (${p.imputeService})`}
                </span>
              </span>
              <span className="text-right text-xs text-[var(--encre-faible)]">
                {DATE.format(p.enregistreLe)}
                {p.delaiReponse && (
                  <span className={`block ${retard ? "font-semibold text-danger-600" : ""}`}>
                    {retard ? `${joursDeRetard(p.delaiReponse, aujourdhui)} j de retard` : `réponse le ${p.delaiReponse.split("-").reverse().join("/")}`}
                  </span>
                )}
              </span>
              {p.confidentiel && <Pastille ton="danger">Confidentiel</Pastille>}
              <Pastille ton={TON_STATUT[p.statut]}>{LIBELLE_STATUT[p.statut]}</Pastille>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
