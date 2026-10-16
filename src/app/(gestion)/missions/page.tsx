import type { Metadata } from "next";
import Link from "next/link";

import {
  CarteIndicateur,
  EnTetePage,
  EtatVide,
  Pastille,
  type TonPastille,
} from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { listerMissions, optionsMission } from "@/modules/missions/requetes";
import type { StatutMission } from "@/modules/missions/schema";
import { LIBELLE_NATURE, LIBELLE_STATUT, pourcentage } from "@/modules/missions/suivi";

import { FormulaireMission } from "./formulaire-mission";

export const metadata: Metadata = { title: "Missions" };

const TON: Record<StatutMission, TonPastille> = {
  planifiee: "neutre",
  en_cours: "marque",
  terminee: "valide",
  echouee: "danger",
  annulee: "neutre",
};

const dateHeure = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export default async function PageMissions({ searchParams }: PageProps<"/missions">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);

  const [missions, options, peutGerer] = await Promise.all([
    listerMissions(session.organizationId),
    optionsMission(session.organizationId),
    peut("missions.mission.gerer"),
  ]);

  const enCours = missions.filter((m) => m.statut === "en_cours");
  const echouees = missions.filter((m) => m.statut === "echouee");
  const enRetard = missions.filter((m) => m.enRetard);
  const facturable = missions
    .filter((m) => m.statut !== "annulee" && m.client)
    .reduce((somme, m) => somme + m.montant, 0);
  // Les indicateurs portent sur toutes les missions ; seules les cartes suivent la recherche.
  const affichees = missions.filter(
    (m) =>
      correspond(filtres.q, [m.reference, m.titre, LIBELLE_NATURE[m.nature], m.lieu, m.executant, m.client, m.actif]) &&
      dansPeriode(m.echeanceLe, filtres.periode),
  );

  return (
    <>
      <EnTetePage
        titre="Missions"
        sousTitre="Livraisons, chantiers, collectes et projets"
        actions={peutGerer ? <FormulaireMission options={options} /> : undefined}
      />

      {missions.length === 0 ? (
        <EtatVide
          titre="Aucune mission"
          message="Une mission confie un travail à quelqu'un, le découpe en étapes et exige, à chacune, la preuve du terrain : photo, position, signature."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="En cours"
              valeur={fmtEntier(enCours.length)}
              precision={`Sur ${missions.length} missions suivies`}
            />
            <CarteIndicateur
              libelle="En retard"
              valeur={fmtEntier(enRetard.length)}
              ton={enRetard.length > 0 ? "alerte" : "valide"}
              precision="Échéance dépassée, mission ouverte"
            />
            <CarteIndicateur
              libelle="Échouées"
              valeur={fmtEntier(echouees.length)}
              ton={echouees.length > 0 ? "danger" : "valide"}
              precision="À reprogrammer"
            />
            <CarteIndicateur
              libelle="Missions facturables"
              valeur={fmt(facturable)}
              unite="FCFA"
              ton="valide"
              precision="Rattachées à un client"
            />
          </section>

          <Recherche
            chemin="/missions"
            valeur={filtres.q}
            placeholder="Référence, titre, exécutant, lieu, client…"
            periode={{ ...filtres.periode, libelle: "Échéance" }}
            resultats={filtres.actif ? `${fmtEntier(affichees.length)} sur ${fmtEntier(missions.length)}` : undefined}
          />

          {affichees.length === 0 ? (
            <EtatVide titre="Aucune mission ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {affichees.map((mission) => {
                const progression = pourcentage(mission.etapesFaites, mission.etapes);

                return (
                  <li key={mission.id}>
                    <Link
                      href={`/missions/suivi?mission=${mission.id}`}
                      className="block rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 hover:border-marque-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="chiffres text-xs text-[var(--encre-faible)]">
                            {mission.reference} · {LIBELLE_NATURE[mission.nature]}
                          </p>
                          <p className="truncate text-sm font-semibold">{mission.titre}</p>
                        </div>
                        <Pastille ton={TON[mission.statut]}>
                          {LIBELLE_STATUT[mission.statut]}
                        </Pastille>
                      </div>

                      <p className="mt-1.5 truncate text-xs text-[var(--encre-douce)]">
                        {mission.executant ?? "Non attribuée"}
                        {mission.lieu ? ` · ${mission.lieu}` : ""}
                      </p>

                      <div className="mt-3">
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-[var(--encre-faible)]">
                            {mission.statut === "terminee"
                              ? "Terminée"
                              : mission.motif && mission.statut !== "planifiee" && mission.statut !== "en_cours"
                                ? mission.motif
                                : mission.etapeCourante
                                  ? `Étape : ${mission.etapeCourante}`
                                  : "Sans étape"}
                          </span>
                          <span className="chiffres shrink-0 font-semibold">{progression} %</span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-creuse)]"
                          role="progressbar"
                          aria-valuenow={progression}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Avancement de ${mission.reference}`}
                        >
                          <div
                            className={`h-full rounded-full ${
                              mission.statut === "echouee" ? "bg-danger-500" : "bg-marque-600"
                            }`}
                            style={{ width: `${progression}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {mission.echeanceLe && (
                          <span className="chiffres text-[var(--encre-faible)]">
                            {dateHeure.format(mission.echeanceLe)}
                          </span>
                        )}
                        <span className="text-[var(--encre-faible)]">
                          {fmtEntier(mission.preuves)} preuve{mission.preuves > 1 ? "s" : ""}
                        </span>
                        {mission.client && (
                          <span className="chiffres ml-auto font-semibold">
                            {fmt(mission.montant)} FCFA
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
