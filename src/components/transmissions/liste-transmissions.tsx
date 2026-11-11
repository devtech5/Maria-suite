import Link from "next/link";

import { Pastille, type TonPastille } from "@/components/ui/primitives";
import { AVIS, LIBELLE_STATUT, MENTIONS, bientotDu, enRetard, totalExemplaires, valide, type Statut } from "@/modules/transmissions/regles";
import type { LigneTransmission } from "@/modules/transmissions/requetes";

export const TON_STATUT: Record<Statut, TonPastille> = {
  a_transmettre: "alerte",
  attendue: "alerte",
  transmise: "marque",
  recue: "marque",
  accusee: "marque",
  traitee: "valide",
  annulee: "neutre",
};

const jour = (d: string) => d.split("-").reverse().join("/");

/** Qui transmet à qui, en une ligne. */
export function trajet(t: LigneTransmission): string {
  if (t.sens === "interne") return `${t.emetteurNom ?? "?"}${t.emetteurService ? ` (${t.emetteurService})` : ""} → ${t.destinataireNom ?? "?"}${t.destinataireService ? ` (${t.destinataireService})` : ""}`;
  const entreprise = t.tiersNom ?? t.entreprise ?? "entreprise";
  return t.sens === "sortante" ? `Nous → ${entreprise}` : `${entreprise} → nous`;
}

export function ListeTransmissions({ liste, aujourdhui, vide }: { liste: LigneTransmission[]; aujourdhui: string; vide: string }) {
  if (liste.length === 0) return <p className="rounded-xl border border-dashed border-[var(--filet)] px-4 py-6 text-center text-sm text-[var(--encre-douce)]">{vide}</p>;
  return (
    <ul className="divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
      {liste.map((t) => {
        const retard = enRetard(t, aujourdhui);
        const proche = bientotDu(t, aujourdhui);
        return (
          <li key={t.id}>
            <Link href={`/transmissions/${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--surface-creuse)]">
              <span className="chiffres w-32 shrink-0 text-sm font-semibold">{t.numero}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.objet}</span>
                <span className="block truncate text-sm text-[var(--encre-douce)]">
                  {trajet(t)} · {valide(MENTIONS, t.mention) ? MENTIONS[t.mention] : t.mention} · {t.pieces.length} pièce{t.pieces.length > 1 ? "s" : ""} ({totalExemplaires(t.pieces)} ex.)
                </span>
              </span>
              {t.dateLimite && (t.statut === "a_transmettre" || t.statut === "attendue") && (
                <span className={`text-xs ${retard ? "font-semibold text-danger-600" : proche ? "font-semibold text-alerte-600" : "text-[var(--encre-faible)]"}`}>
                  {retard ? "En retard · " : ""}avant le {jour(t.dateLimite)}
                </span>
              )}
              {t.avis && <Pastille ton={t.avis === "refuse" ? "danger" : t.avis === "vise_observations" ? "alerte" : "valide"}>{AVIS[t.avis]}</Pastille>}
              <Pastille ton={TON_STATUT[t.statut]}>{LIBELLE_STATUT[t.statut]}</Pastille>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
