import type { Metadata } from "next";

import { LIBELLE_ECHEANCE, ListeEcheances } from "@/components/actifs/liste-echeances";
import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { listerActifs, listerEcheances } from "@/modules/actifs/requetes";

import {
  FormulaireEcheance,
  type OptionActifEcheance,
} from "@/components/actifs/formulaire-echeance";

export const metadata: Metadata = { title: "Échéances" };

export default async function PageEcheances({ searchParams }: PageProps<"/actifs/echeances">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);

  const [echeances, parc] = await Promise.all([
    listerEcheances(session.organizationId),
    listerActifs(session.organizationId),
  ]);

  const depassees = echeances.filter((e) => e.gravite === "depassee").length;
  const proches = echeances.filter((e) => e.gravite === "proche").length;
  // Les indicateurs portent sur toutes les échéances suivies ; seule la liste suit la recherche.
  // Une échéance au seul compteur n'a pas de date : une période l'écarte.
  const lignes = echeances.filter(
    (e) =>
      dansPeriode(e.echeanceLe, filtres.periode) &&
      correspond(filtres.q, [e.actifCode, e.actifDesignation, e.libelle, LIBELLE_ECHEANCE[e.nature]]),
  );

  const options: OptionActifEcheance[] = parc.map((actif) => ({
    id: actif.id,
    code: actif.code,
    designation: actif.designation,
    uniteCompteur: actif.uniteCompteur,
  }));

  return (
    <>
      <EnTetePage
        titre="Échéances"
        sousTitre="Assurances, visites techniques, garanties et entretiens"
        actions={<FormulaireEcheance actifs={options} />}
      />

      {echeances.length === 0 ? (
        <EtatVide
          titre="Aucune échéance suivie"
          message={
            parc.length === 0
              ? "Ouvrez d'abord une fiche d'actif : une échéance porte toujours sur quelque chose."
              : "Une échéance se déclenche à une date, à un seuil de compteur, ou aux deux — et c'est le premier atteint qui compte. Rouler sans assurance valide n'est pas un retard administratif : c'est une immobilisation au premier contrôle."
          }
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Dépassées"
              valeur={fmtEntier(depassees)}
              ton={depassees > 0 ? "danger" : "valide"}
              precision="Actif en infraction ou à risque"
            />
            <CarteIndicateur
              libelle="Proches"
              valeur={fmtEntier(proches)}
              ton={proches > 0 ? "alerte" : "valide"}
              precision="À traiter sans attendre"
            />
            <CarteIndicateur
              libelle="Suivies"
              valeur={fmtEntier(echeances.length)}
              precision="Non honorées, sur tout le parc"
            />
          </section>

          <Recherche
            chemin="/actifs/echeances"
            valeur={filtres.q}
            placeholder="Code, actif, assurance, visite, garantie…"
            periode={{ ...filtres.periode, libelle: "Échéance" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} sur ${fmtEntier(echeances.length)}` : undefined}
          />

          {lignes.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucune échéance ne répond. Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <ListeEcheances echeances={lignes} />
          )}

          <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
            Une échéance qui porte une date ET un seuil de compteur — « tous les
            5 000 km ou six mois » — échoit au premier atteint. Enregistrer
            l&apos;intervention qui l&apos;honore la retire de cette liste sans
            l&apos;effacer : l&apos;historique des visites est précisément ce
            qu&apos;un contrôle demande à voir.
          </p>
        </>
      )}
    </>
  );
}
