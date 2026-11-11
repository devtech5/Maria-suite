import Link from "next/link";

import { Pastille, type TonPastille } from "@/components/ui/primitives";
import { LIBELLE_STATUT, dureeLisible, dureeMinutes, type StatutVisite } from "@/modules/visiteurs/regles";
import type { LigneVisite } from "@/modules/visiteurs/requetes";

import { ActionsVisite } from "./actions-visite";

export const TON_STATUT: Record<StatutVisite, TonPastille> = { attendue: "alerte", presente: "valide", sortie: "neutre", annulee: "neutre" };

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });
const JOUR_HEURE = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

/** Une liste de visites, en cartes : qui, pour qui, depuis quand, et les gestes possibles. */
export function ListeVisites({
  visites,
  maintenant,
  accueillir,
  vide,
  avecAccueil = false,
  avecJour = false,
}: {
  visites: LigneVisite[];
  maintenant: Date;
  accueillir: boolean;
  vide: string;
  avecAccueil?: boolean;
  avecJour?: boolean;
}) {
  if (visites.length === 0) return <p className="rounded-xl border border-dashed border-[var(--filet)] px-4 py-6 text-center text-sm text-[var(--encre-douce)]">{vide}</p>;
  const format = avecJour ? JOUR_HEURE : HEURE;
  return (
    <ul className="divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
      {visites.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link href={`/visiteurs/${v.id}`} className="font-semibold hover:underline">
              {v.nom}
            </Link>
            {v.societe && <span className="text-sm text-[var(--encre-douce)]"> · {v.societe}</span>}
            <p className="text-sm text-[var(--encre-douce)]">
              {v.motif}
              {(v.visiteNom || v.visiteLibelle) && <> · pour {v.visiteNom ?? v.visiteLibelle}</>}
              {avecAccueil && <> · {v.accueil}</>}
            </p>
            <p className="chiffres text-xs text-[var(--encre-faible)]">
              {v.numero}
              {v.statut === "attendue" && v.attenduLe && <> · attendu {format.format(v.attenduLe)}</>}
              {v.arriveeLe && <> · arrivé {format.format(v.arriveeLe)}</>}
              {v.sortieLe && <> · sorti {format.format(v.sortieLe)}</>}
              {v.arriveeLe && v.statut !== "annulee" && <> · {dureeLisible(dureeMinutes(v.arriveeLe, v.sortieLe, maintenant))}</>}
            </p>
          </div>
          <Pastille ton={TON_STATUT[v.statut]}>{LIBELLE_STATUT[v.statut]}</Pastille>
          <ActionsVisite id={v.id} statut={v.statut} accueillir={accueillir} telephone={Boolean(v.telephone)} />
        </li>
      ))}
    </ul>
  );
}
