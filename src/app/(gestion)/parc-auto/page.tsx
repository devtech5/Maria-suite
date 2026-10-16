import type { Metadata } from "next";
import Link from "next/link";

import { LIBELLE_ECHEANCE, libelleEcheance } from "@/components/actifs/liste-echeances";
import { STATUT_ACTIF, TON_ECHEANCE } from "@/components/actifs/statut";
import { FormulaireNouveauVehicule } from "@/components/parc-auto/formulaires";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { ENERGIES, formaterConsommation } from "@/modules/parc-auto/calcul";
import { listerVehicules } from "@/modules/parc-auto/requetes";
import { salariesEnPoste } from "@/modules/personnes/requetes";

export const metadata: Metadata = { title: "Parc auto" };

/**
 * Parc automobile : chaque véhicule avec son conducteur, son kilométrage, sa
 * consommation et son échéance la plus urgente. Un véhicule ouvert depuis
 * l'écran Actifs apparaît aussi, avec sa carte grise à compléter.
 */
export default async function PageParcAuto({ searchParams }: PageProps<"/parc-auto">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [vehicules, conducteurs, gerer] = await Promise.all([
    listerVehicules(session.organizationId),
    salariesEnPoste(session.organizationId),
    peut("parc_auto.vehicule.gerer"),
  ]);

  const enService = vehicules.filter((v) => v.statut === "actif").length;
  const carburantMois = vehicules.reduce((s, v) => s + v.carburantMois, 0);
  const depassees = vehicules.reduce((s, v) => s + v.echeancesDepassees, 0);
  const aCompleter = vehicules.filter((v) => !v.fiche).length;
  // Les indicateurs portent sur tout le parc ; seul le tableau suit la recherche.
  const lignes = vehicules.filter((v) =>
    correspond(filtres.q, [v.code, v.designation, v.affecteA, v.site, v.fiche?.immatriculation, v.fiche?.marque, v.fiche?.modele, v.fiche?.numeroChassis]),
  );

  return (
    <>
      <EnTetePage
        titre="Parc automobile"
        sousTitre={vehicules.length === 0 ? "Aucun véhicule" : `${vehicules.length} véhicule${vehicules.length > 1 ? "s" : ""} · ${enService} en service`}
        actions={gerer ? <FormulaireNouveauVehicule conducteurs={conducteurs} /> : undefined}
      />

      {vehicules.length === 0 ? (
        <EtatVide
          titre="Aucun véhicule"
          message="Ouvrez un véhicule avec sa carte grise, son kilométrage et ses échéances — assurance, visite technique, vignette. Les pleins, les entretiens et le coût au kilomètre suivent."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <CarteIndicateur libelle="Véhicules" valeur={fmtEntier(vehicules.length)} precision={`${enService} en service`} />
            <CarteIndicateur libelle="Carburant du mois" valeur={fmtCompact(carburantMois)} unite="FCFA" precision="Tous véhicules" />
            <CarteIndicateur
              libelle="Échéances dépassées"
              valeur={fmtEntier(depassees)}
              ton={depassees > 0 ? "danger" : "valide"}
              precision="Assurance, visite, vignette, entretien"
            />
            <CarteIndicateur
              libelle="Fiches à compléter"
              valeur={fmtEntier(aCompleter)}
              ton={aCompleter > 0 ? "alerte" : "valide"}
              precision="Sans immatriculation ni carte grise"
            />
          </section>

          <Recherche
            chemin="/parc-auto"
            valeur={filtres.q}
            placeholder="Immatriculation, marque, code, conducteur…"
            resultats={filtres.q ? `${fmtEntier(lignes.length)} sur ${fmtEntier(vehicules.length)}` : undefined}
          />

          {lignes.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun véhicule ne répond à cette recherche. Retirez un mot ou cherchez par immatriculation." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Véhicule</Th>
                  <Th>Conducteur</Th>
                  <Th aligne="droite">Kilométrage</Th>
                  <Th aligne="droite">Consommation</Th>
                  <Th aligne="droite">Coût au km</Th>
                  <Th>Prochaine échéance</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((v) => (
                  <tr key={v.id}>
                    <Td chiffres>{v.code}</Td>
                    <Td fort>
                      <Link href={`/parc-auto/${v.id}`} className="hover:underline">
                        {v.fiche ? (
                          <>
                            <span className="chiffres">{v.fiche.immatriculation}</span>
                            <span className="block text-xs font-normal text-[var(--encre-douce)]">
                              {[v.fiche.marque, v.fiche.modele, v.fiche.energie && ENERGIES[v.fiche.energie]].filter(Boolean).join(" · ") || v.designation}
                            </span>
                          </>
                        ) : (
                          <>
                            {v.designation}
                            <span className="block text-xs font-normal text-alerte-600">Carte grise à compléter</span>
                          </>
                        )}
                      </Link>
                    </Td>
                    <Td>{v.affecteA ?? <span className="text-xs text-[var(--encre-faible)]">—</span>}</Td>
                    <Td aligne="droite" chiffres>
                      {v.compteur !== null ? `${fmtEntier(v.compteur)} km` : "—"}
                    </Td>
                    <Td aligne="droite" chiffres>
                      {formaterConsommation(v.consommation.mlPour100)}
                    </Td>
                    <Td aligne="droite" chiffres>
                      {v.coutAuKm !== null ? `${fmt(v.coutAuKm)} F` : "—"}
                    </Td>
                    <Td>
                      {v.prochaine ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Pastille ton={TON_ECHEANCE[v.prochaine.gravite]}>{LIBELLE_ECHEANCE[v.prochaine.nature]}</Pastille>
                          <span className="chiffres text-xs">{libelleEcheance(v.prochaine)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--encre-faible)]">Aucune suivie</span>
                      )}
                    </Td>
                    <Td>
                      <Pastille ton={STATUT_ACTIF[v.statut].ton}>{STATUT_ACTIF[v.statut].libelle}</Pastille>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}
          <p className="mt-4 max-w-[75ch] text-xs text-[var(--encre-faible)]">
            La consommation se mesure entre deux pleins complets avec kilométrage ; le coût au kilomètre rapporte
            le carburant et l&apos;entretien à la distance ainsi mesurée. Un véhicule sans au moins deux pleins
            complets n&apos;a pas encore de mesure.
          </p>
        </>
      )}
    </>
  );
}
