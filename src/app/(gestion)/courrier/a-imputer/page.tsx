import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { FormulaireImputation } from "@/components/courrier/formulaire-imputation";
import { ListePlis } from "@/components/courrier/liste-plis";
import { EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { accesCourrier } from "@/modules/courrier/acces";
import { NATURES, enRetard, natureValide } from "@/modules/courrier/regles";
import { aujourdhuiPour, destinatairesPossibles, plisDe } from "@/modules/courrier/requetes";

export const metadata: Metadata = { title: "Courrier à imputer" };

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Abidjan" });

/**
 * La table de la direction : chaque pli arrivé s'impute à une personne,
 * avec un service, des instructions et un délai. En dessous, ce qui est
 * en retard.
 */
export default async function PageAImputer() {
  const a = await accesCourrier();
  if (!a.imputer) return <AccesRefuse droit="courrier.imputer" />;
  const org = a.session.organizationId;
  const [aImputer, enCours, aujourdhui, { personnes, services }] = await Promise.all([
    plisDe(org, { sens: "arrivee", statuts: ["enregistre"], limite: 200 }),
    plisDe(org, { sens: "arrivee", statuts: ["impute", "recu"], limite: 500 }),
    aujourdhuiPour(org),
    destinatairesPossibles(org),
  ]);
  const retards = enCours.filter((p) => enRetard(p, aujourdhui));

  return (
    <>
      <EnTetePage titre="À imputer" sousTitre={`${aImputer.length} courrier${aImputer.length > 1 ? "s" : ""} à imputer · ${retards.length} en retard`} />
      {aImputer.length === 0 ? (
        <EtatVide titre="Rien à imputer" message="Chaque courrier enregistré par le secrétariat arrive ici, et vous en êtes prévenu dans la cloche." />
      ) : (
        <ul className="space-y-3">
          {aImputer.map((p) => (
            <li key={p.id} className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/courrier/${p.id}`} className="font-semibold hover:underline">
                    {p.numero} · {p.objet}
                  </Link>
                  <p className="text-sm text-[var(--encre-douce)]">
                    De {p.correspondant}
                    {natureValide(p.nature) && ` · ${NATURES[p.nature]}`}
                    {p.reference && ` · réf. ${p.reference}`} · reçu le {DATE.format(p.enregistreLe)}
                  </p>
                </div>
                {p.confidentiel && <Pastille ton="danger">Confidentiel</Pastille>}
                {p.scan && <Pastille>Scan joint</Pastille>}
              </div>
              <FormulaireImputation pliId={p.id} personnes={personnes} services={services} aujourdhui={aujourdhui} compact />
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">En retard</h2>
      <ListePlis plis={retards} aujourdhui={aujourdhui} vide="Aucun courrier en retard." />
    </>
  );
}
