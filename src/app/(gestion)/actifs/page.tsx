import type { Metadata } from "next";

import { BoutonDemonstration } from "@/components/bouton-demonstration";
import {
  CarteIndicateur,
  EnTetePage,
  EtatVide,
  Pastille,
  Tableau,
  Td,
  Th,
  type TonPastille,
} from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { listerActifs, resumeParc } from "@/modules/actifs/requetes";
import type { StatutActif, TypeActif } from "@/modules/actifs/schema";
import { listerSalaries, listerIntervenants } from "@/modules/personnes/requetes";
import { listerTiers } from "@/modules/tiers/requetes";

import { FormulaireActif, type OptionPersonne } from "./formulaire-actif";

export const metadata: Metadata = { title: "Parc" };

const LIBELLE_TYPE: Record<TypeActif, string> = {
  vehicule: "Véhicule",
  informatique: "Informatique",
  engin: "Engin",
  mobilier: "Mobilier",
  local: "Local",
};

const LIBELLE_STATUT: Record<StatutActif, string> = {
  actif: "En service",
  entretien: "En entretien",
  immobilise: "Immobilisé",
  cede: "Cédé",
};

const TON: Record<StatutActif, TonPastille> = {
  actif: "valide",
  entretien: "alerte",
  immobilise: "danger",
  cede: "neutre",
};

export default async function PageParc({ searchParams }: PageProps<"/actifs">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);

  const [parc, salaries, intervenants, partenaires] = await Promise.all([
    listerActifs(session.organizationId),
    listerSalaries(session.organizationId),
    listerIntervenants(session.organizationId),
    listerTiers(session.organizationId, "client"),
  ]);

  const resume = resumeParc(parc);
  // Les indicateurs portent sur tout le parc ; seul le tableau suit la recherche.
  const lignes = parc.filter((actif) =>
    correspond(filtres.q, [
      actif.code,
      actif.designation,
      LIBELLE_TYPE[actif.type],
      actif.affecteA,
      actif.site,
      actif.proprietaire,
      LIBELLE_STATUT[actif.statut],
    ]),
  );

  const personnes: OptionPersonne[] = [
    ...salaries.map((s) => ({ id: s.id, nom: s.nom, nature: "employe" as const })),
    ...intervenants.map((i) => ({
      id: i.id,
      nom: i.nom,
      nature: "intervenant" as const,
    })),
  ];

  const clients = partenaires.map((tiers) => ({ id: tiers.id, nom: tiers.nom }));

  return (
    <>
      <EnTetePage
        titre="Parc"
        sousTitre="Véhicules, matériel informatique, engins et équipements"
        actions={
          <FormulaireActif
            personnes={personnes}
            clients={clients}
            premier={parc.length === 0}
          />
        }
      />

      {parc.length === 0 ? (
        <EtatVide
          titre="Aucun actif suivi"
          message="Un actif est une chose qui coûte, s'use et s'entretient : un véhicule, un ordinateur, une bétonnière, une chambre froide. Le même écran suit le véhicule d'un client confié à l'atelier — c'est le propriétaire qui décide si l'intervention est une charge ou une facture."
          actions={<BoutonDemonstration libelle="Installer le jeu de démonstration" />}
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Actifs suivis"
              valeur={fmtEntier(resume.actifs)}
              precision={`${resume.affectes} affectés à une personne`}
            />
            <CarteIndicateur
              libelle="Valeur d'acquisition"
              valeur={fmtCompact(resume.valeur)}
              unite="FCFA"
              precision="Actifs de clients exclus"
            />
            <CarteIndicateur
              libelle="Coût de maintenance"
              valeur={fmtCompact(resume.coutMaintenance)}
              unite="FCFA"
              precision={
                resume.valeur > 0
                  ? `${Math.round((resume.coutMaintenance / resume.valeur) * 100)} % de la valeur du parc`
                  : "Somme des interventions"
              }
            />
            <CarteIndicateur
              libelle="Indisponibles"
              valeur={fmtEntier(resume.indisponibles)}
              ton={resume.indisponibles > 0 ? "alerte" : "valide"}
              precision="En entretien ou immobilisés"
            />
          </section>

          <Recherche
            chemin="/actifs"
            valeur={filtres.q}
            placeholder="Code, désignation, site, affecté à…"
            resultats={filtres.q ? `${fmtEntier(lignes.length)} sur ${fmtEntier(parc.length)}` : undefined}
          />

          {lignes.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun actif ne répond à cette recherche. Retirez un mot ou cherchez par code." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Désignation</Th>
                  <Th>Type</Th>
                  <Th>Affecté à</Th>
                  <Th>Site</Th>
                  <Th>Statut</Th>
                  <Th aligne="droite">Compteur</Th>
                  <Th aligne="droite">Maintenance</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((actif) => (
                  <tr key={actif.id}>
                    <Td chiffres>{actif.code}</Td>
                    <Td fort>
                      {actif.designation}
                      {/* Un actif de client se signale : sa valeur n'est pas au
                          bilan, et ses interventions se facturent. */}
                      {actif.proprietaire && (
                        <span className="block text-xs font-normal text-[var(--encre-faible)]">
                          Appartient à {actif.proprietaire}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs text-[var(--encre-douce)]">
                        {LIBELLE_TYPE[actif.type]}
                      </span>
                    </Td>
                    <Td>
                      {/* L'affectation pointe vers une personne du module
                          Personnel, salariée ou intervenante. */}
                      {actif.affecteA ?? (
                        <span className="text-xs text-[var(--encre-faible)]">
                          Non affecté
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs text-[var(--encre-douce)]">
                        {actif.site ?? "—"}
                      </span>
                    </Td>
                    <Td>
                      <Pastille ton={TON[actif.statut]}>
                        {LIBELLE_STATUT[actif.statut]}
                      </Pastille>
                    </Td>
                    <Td aligne="droite" chiffres>
                      {actif.compteur !== null
                        ? `${fmtEntier(actif.compteur)} ${actif.uniteCompteur ?? ""}`
                        : "—"}
                    </Td>
                    <Td aligne="droite" chiffres>
                      {actif.coutMaintenance > 0 ? fmt(actif.coutMaintenance) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}

          <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
            Ni le coût de maintenance ni le compteur ne sont stockés sur la
            fiche : le premier est la somme des interventions, le second le
            dernier relevé enregistré. Un compteur remplacé repart de zéro, et
            c&apos;est le relevé le plus récent qui fait foi — pas le plus élevé.
          </p>
        </>
      )}
    </>
  );
}
