import Link from "next/link";

import { Avatar } from "@/components/ui/courrier";
import { dateLisible, quandAnniversaire } from "@/modules/personnes/anniversaires";

export interface AnniversaireAffiche {
  id: string;
  nom: string;
  poste: string;
  service: string | null;
  jour: string;
  dans: number;
  /** Nul pour qui n'est pas de la direction : l'équipe ne voit pas l'âge. */
  age: number | null;
}

/**
 * Bandeau des anniversaires de la semaine, en tête de l'accueil : ceux du jour
 * en avant, les suivants à la file. Rien s'il n'y en a pas.
 */
export function BandeauAnniversaires({ prochains, lien }: { prochains: AnniversaireAffiche[]; lien: string | null }) {
  const semaine = prochains.filter((a) => a.dans <= 7);
  if (semaine.length === 0) return null;
  const duJour = semaine.filter((a) => a.dans === 0);
  const suivants = semaine.filter((a) => a.dans > 0);

  const contenu = (
    <>
      <span aria-hidden className="text-2xl leading-none">
        🎂
      </span>
      <span className="min-w-0 text-sm">
        {duJour.length > 0 && (
          <span className="block font-semibold">
            Aujourd&apos;hui, joyeux anniversaire à {duJour.map((a) => `${a.nom}${a.age !== null ? ` (${a.age} ans)` : ""}`).join(", ")} !
          </span>
        )}
        {suivants.length > 0 && (
          <span className="block text-[var(--encre-douce)]">
            {duJour.length > 0 ? "Et bientôt : " : "Anniversaires de la semaine : "}
            {suivants.map((a) => `${a.nom}, ${quandAnniversaire(a)}`).join(" · ")}
          </span>
        )}
      </span>
    </>
  );
  const classe = "mt-4 flex max-w-2xl items-center gap-3 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] px-4 py-3 text-left shadow-sm";
  return lien ? (
    <Link href={lien} className={`${classe} hover:bg-[var(--surface-creuse)]`}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
/** Abréviations usuelles : « nov. », pas « nove. ». */
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Les anniversaires de l'année à venir, rangés par mois. */
export function ListeAnniversaires({ prochains }: { prochains: AnniversaireAffiche[] }) {
  const parMois = new Map<string, AnniversaireAffiche[]>();
  for (const a of prochains) {
    const cle = a.jour.slice(0, 7);
    parMois.set(cle, [...(parMois.get(cle) ?? []), a]);
  }
  return (
    <div className="space-y-6">
      {[...parMois.entries()].map(([cle, liste]) => (
        <section key={cle}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--encre-douce)]">
            {MOIS[Number(cle.slice(5, 7)) - 1]} {cle.slice(0, 4)}
          </h2>
          <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
            {liste.map((a) => (
              <li key={a.id} className={`flex items-center gap-3 px-4 py-3 ${a.dans === 0 ? "bg-marque-50" : ""}`}>
                <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-[var(--filet)] py-1 text-center leading-tight">
                  <span className="chiffres text-lg font-bold">{Number(a.jour.slice(8, 10))}</span>
                  <span className="text-[10px] uppercase text-[var(--encre-faible)]">{MOIS_COURTS[Number(a.jour.slice(5, 7)) - 1]}</span>
                </span>
                <Avatar nom={a.nom} className="size-9 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {a.dans === 0 && "🎂 "}
                    {a.nom}
                  </span>
                  <span className="block truncate text-xs text-[var(--encre-faible)]">{[a.poste, a.service].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className={`block font-medium ${a.dans <= 7 ? "text-marque-600" : ""}`}>{a.dans === 0 ? "Aujourd'hui" : a.dans === 1 ? "Demain" : a.dans <= 7 ? `Dans ${a.dans} jours` : dateLisible(a.jour)}</span>
                  {a.age !== null && <span className="block text-[var(--encre-faible)]">{a.age} ans</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
