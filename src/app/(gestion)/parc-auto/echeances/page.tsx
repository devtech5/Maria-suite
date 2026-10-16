import type { Metadata } from "next";

import { FormulaireEcheance } from "@/components/actifs/formulaire-echeance";
import { LIBELLE_ECHEANCE, ListeEcheances } from "@/components/actifs/liste-echeances";
import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { listerEcheances } from "@/modules/actifs/requetes";
import { listerVehicules } from "@/modules/parc-auto/requetes";

export const metadata: Metadata = { title: "Échéances du parc auto" };

/**
 * Échéances des seuls véhicules : assurance, visite technique, vignette,
 * patente, entretien au kilométrage. Rouler sans assurance ou visite valide
 * immobilise le véhicule au premier contrôle.
 */
export default async function PageEcheancesParcAuto({ searchParams }: PageProps<"/parc-auto/echeances">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [vehicules, toutes, echeancer] = await Promise.all([
    listerVehicules(session.organizationId),
    listerEcheances(session.organizationId),
    peut("actifs.echeance.gerer"),
  ]);
  const ids = new Set(vehicules.map((v) => v.id));
  const echeances = toutes.filter((e) => ids.has(e.actifId));
  const depassees = echeances.filter((e) => e.gravite === "depassee").length;
  const proches = echeances.filter((e) => e.gravite === "proche").length;
  // Les indicateurs portent sur toutes les échéances suivies ; seule la liste suit la recherche.
  // Une échéance au seul kilométrage n'a pas de date : une période l'écarte.
  const immatriculations = new Map(vehicules.map((v) => [v.id, v.fiche?.immatriculation]));
  const lignes = echeances.filter(
    (e) =>
      dansPeriode(e.echeanceLe, filtres.periode) &&
      correspond(filtres.q, [e.actifCode, e.actifDesignation, immatriculations.get(e.actifId), e.libelle, LIBELLE_ECHEANCE[e.nature]]),
  );

  return (
    <>
      <EnTetePage
        titre="Échéances du parc"
        sousTitre="Assurance, visite technique, vignette, patente et entretiens"
        actions={
          echeancer && vehicules.length > 0 ? (
            <FormulaireEcheance
              actifs={vehicules.map((v) => ({ id: v.id, code: v.code, designation: v.designation, uniteCompteur: "km" }))}
              natures={["assurance", "visite", "vignette", "patente", "entretien"]}
            />
          ) : undefined
        }
      />
      {echeances.length === 0 ? (
        <EtatVide titre="Aucune échéance suivie" message="Posez l'assurance, la visite technique et la vignette de chaque véhicule : une alerte prévient trente jours avant." />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <CarteIndicateur libelle="Dépassées" valeur={fmtEntier(depassees)} ton={depassees > 0 ? "danger" : "valide"} precision="Véhicule en infraction" />
            <CarteIndicateur libelle="Proches" valeur={fmtEntier(proches)} ton={proches > 0 ? "alerte" : "valide"} precision="Dans les 30 jours" />
            <CarteIndicateur libelle="Suivies" valeur={fmtEntier(echeances.length)} precision="Non honorées" />
          </section>
          <Recherche
            chemin="/parc-auto/echeances"
            valeur={filtres.q}
            placeholder="Immatriculation, véhicule, assurance, visite…"
            periode={{ ...filtres.periode, libelle: "Échéance" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} sur ${fmtEntier(echeances.length)}` : undefined}
          />
          {lignes.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucune échéance ne répond. Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <ListeEcheances echeances={lignes} />
          )}
        </>
      )}
    </>
  );
}
