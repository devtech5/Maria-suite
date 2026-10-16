import type { Metadata } from "next";

import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { etapesDeMission, listerMissions } from "@/modules/missions/requetes";
import { LIBELLE_NATURE } from "@/modules/missions/suivi";

import { FilMission } from "./fil-mission";

export const metadata: Metadata = { title: "Suivi terrain" };

export default async function PageSuivi({ searchParams }: PageProps<"/missions/suivi">) {
  const session = await exigerEntreprise();
  const parametres = await searchParams;
  const demande = parametres.mission;
  const filtres = lireFiltresListe(parametres);

  const [missions, peutSaisir, peutGerer] = await Promise.all([
    listerMissions(session.organizationId),
    peut("missions.terrain.saisir"),
    peut("missions.mission.gerer"),
  ]);

  const affichees = missions.filter(
    (m) =>
      correspond(filtres.q, [m.reference, m.titre, LIBELLE_NATURE[m.nature], m.lieu, m.executant, m.client, m.actif]) &&
      dansPeriode(m.echeanceLe, filtres.periode),
  );
  // Recherche et période suivent le clic sur une autre mission de la liste.
  const suite = new URLSearchParams();
  if (filtres.q) suite.set("q", filtres.q);
  if (filtres.periode.du) suite.set("du", filtres.periode.du);
  if (filtres.periode.au) suite.set("au", filtres.periode.au);

  // Par défaut, la première mission ouverte : c'est celle qu'on attend du
  // terrain. À défaut, la plus récente.
  const choisie =
    affichees.find((m) => m.id === demande) ??
    affichees.find((m) => m.statut === "en_cours" || m.statut === "planifiee") ??
    affichees[0] ??
    null;

  const etapes = choisie
    ? await etapesDeMission(session.organizationId, choisie.id)
    : [];

  return (
    <>
      <EnTetePage
        titre="Suivi terrain"
        sousTitre="Étapes et preuves rapportées du terrain"
      />
      {missions.length === 0 ? (
        <EtatVide
          titre="Rien à suivre"
          message="Ouvrez une mission : ses étapes et leurs preuves apparaîtront ici, au fil de ce que le terrain rapporte."
        />
      ) : (
        <>
          <Recherche
            chemin="/missions/suivi"
            valeur={filtres.q}
            placeholder="Référence, titre, exécutant, lieu, client…"
            periode={{ ...filtres.periode, libelle: "Échéance" }}
            resultats={filtres.actif ? `${fmtEntier(affichees.length)} sur ${fmtEntier(missions.length)}` : undefined}
          />
          {affichees.length === 0 ? (
            <EtatVide titre="Aucune mission ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <FilMission
              missions={affichees}
              selectionId={choisie?.id ?? null}
              etapes={etapes}
              peutSaisir={peutSaisir}
              peutGerer={peutGerer}
              filtres={suite.toString()}
            />
          )}
        </>
      )}
    </>
  );
}
