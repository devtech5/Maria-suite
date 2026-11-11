import type { Metadata } from "next";

import { ListePlis } from "@/components/courrier/liste-plis";
import { CarteIndicateur, EnTetePage } from "@/components/ui/primitives";
import { accesCourrier } from "@/modules/courrier/acces";
import { enRetard } from "@/modules/courrier/regles";
import { aujourdhuiPour, plisDe } from "@/modules/courrier/requetes";

export const metadata: Metadata = { title: "Mon courrier" };

/** Le courrier imputé à la personne connectée : à accuser, à traiter, traité. */
export default async function PageMonCourrier() {
  const a = await accesCourrier();
  const org = a.session.organizationId;
  const [ouverts, traites, aujourdhui] = await Promise.all([
    plisDe(org, { imputeA: a.session.userId, statuts: ["impute", "recu"], limite: 300 }),
    plisDe(org, { imputeA: a.session.userId, statuts: ["traite"], limite: 50 }),
    aujourdhuiPour(org),
  ]);
  const aAccuser = ouverts.filter((p) => p.statut === "impute");
  const retards = ouverts.filter((p) => enRetard(p, aujourdhui));

  return (
    <>
      <EnTetePage titre="Mon courrier" sousTitre="Le courrier que la direction vous a imputé" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <CarteIndicateur libelle="À accuser" valeur={String(aAccuser.length)} ton={aAccuser.length ? "alerte" : "neutre"} />
        <CarteIndicateur libelle="À traiter" valeur={String(ouverts.length)} ton="marque" />
        <CarteIndicateur libelle="En retard" valeur={String(retards.length)} ton={retards.length ? "danger" : "valide"} />
      </div>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">À traiter</h2>
      <ListePlis plis={ouverts} aujourdhui={aujourdhui} vide="Aucun courrier en attente : tout est traité." />
      <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Traités récemment</h2>
      <ListePlis plis={traites} aujourdhui={aujourdhui} vide="Rien encore." />
    </>
  );
}
