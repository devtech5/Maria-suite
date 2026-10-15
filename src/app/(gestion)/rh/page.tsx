import type { Metadata } from "next";
import Link from "next/link";

import { BoutonDemonstration } from "@/components/bouton-demonstration";
import { Portrait } from "@/components/personnes/photo";
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
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { naturesParSalarie } from "@/modules/personnes/dossier";
import { calculerBulletin, joursAvantTerme } from "@/modules/personnes/paie";
import { piecesManquantes } from "@/modules/personnes/pieces";
import { listerSalaries } from "@/modules/personnes/requetes";
import type { TypeContrat } from "@/modules/personnes/schema";

import { FormulaireSalarie } from "./formulaire-salarie";

export const metadata: Metadata = { title: "Salariés" };

const LIBELLE_CONTRAT: Record<TypeContrat, string> = {
  cdi: "CDI",
  cdd: "CDD",
  stage: "Stage",
  essai: "Essai",
};

const TON_CONTRAT: Record<TypeContrat, TonPastille> = {
  cdi: "valide",
  cdd: "marque",
  stage: "neutre",
  essai: "alerte",
};

export default async function PageSalaries({ searchParams }: PageProps<"/rh">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [salaries, voitLesDossiers, tientLesDossiers] = await Promise.all([
    listerSalaries(session.organizationId),
    peut("personnes.dossier.consulter"),
    peut("personnes.dossier.gerer"),
  ]);
  const natures = voitLesDossiers ? await naturesParSalarie(session.organizationId) : null;

  const bulletins = salaries.map((salarie) =>
    calculerBulletin({
      id: salarie.id,
      matricule: salarie.matricule,
      nom: salarie.nom,
      salaireBase: salarie.salaireBase,
    }),
  );

  const masse = bulletins.reduce((somme, b) => somme + b.brut, 0);
  const cout = bulletins.reduce((somme, b) => somme + b.coutTotal, 0);

  // Un contrat à durée indéterminée n'a pas d'échéance : il ne compte ni dans
  // les contrats qui expirent, ni dans ceux qui seraient « hors délai ».
  // Le concurrent affiche « OK (>60j) : 0 » alors que huit CDI sont en cours.
  const aujourdhui = new Date();
  const echeances = salaries.map((salarie) => ({
    salarie,
    jours: joursAvantTerme(salarie.fin, aujourdhui),
  }));

  const bientot = echeances.filter(
    ({ jours }) => jours !== null && jours >= 0 && jours <= 60,
  );
  const expires = echeances.filter(({ jours }) => jours !== null && jours < 0);
  const sansCnps = salaries.filter((salarie) => !salarie.numeroCnps);

  const indetermines = salaries.filter((salarie) => salarie.contrat === "cdi");

  // Les indicateurs portent sur tout l'effectif ; seul le tableau suit la
  // recherche (la barre du haut y renvoie par `?q=`) et la date d'entrée.
  const affiches = echeances.filter(
    ({ salarie }) =>
      correspond(filtres.q, [
        salarie.nom,
        salarie.matricule,
        salarie.poste,
        salarie.service,
        salarie.telephone,
        salarie.emailProfessionnel,
        salarie.numeroCnps,
        LIBELLE_CONTRAT[salarie.contrat],
      ]) && dansPeriode(salarie.debut, filtres.periode),
  );

  return (
    <>
      <EnTetePage
        titre="Salariés"
        sousTitre={
          salaries.length === 0
            ? "Aucun salarié inscrit"
            : `${salaries.length} salariés · ${indetermines.length} en contrat à durée indéterminée`
        }
        actions={<FormulaireSalarie premier={salaries.length === 0} dossier={tientLesDossiers} />}
      />

      {salaries.length === 0 ? (
        <EtatVide
          titre="Aucun salarié"
          message="Un salarié porte un contrat, un numéro CNPS et un bulletin — à ne pas confondre avec l'intervenant payé à la journée, qui se tient dans l'onglet voisin. Vous pouvez aussi installer le jeu de démonstration."
          actions={<BoutonDemonstration libelle="Installer le jeu de démonstration" />}
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Masse salariale brute"
              valeur={fmtCompact(masse)}
              unite="FCFA"
              precision="Par mois"
            />
            <CarteIndicateur
              libelle="Coût employeur"
              valeur={fmtCompact(cout)}
              unite="FCFA"
              precision="Brut et charges patronales"
            />
            <CarteIndicateur
              libelle="Contrats à échéance"
              valeur={fmtEntier(bientot.length)}
              ton={bientot.length > 0 ? "alerte" : "valide"}
              precision="Dans les 60 jours"
            />
            <CarteIndicateur
              libelle="Contrats expirés"
              valeur={fmtEntier(expires.length)}
              ton={expires.length > 0 ? "danger" : "valide"}
              precision="À renouveler ou clôturer"
            />
          </section>

          <Recherche
            chemin="/rh"
            valeur={filtres.q}
            placeholder="Nom, matricule, poste, service, n° CNPS…"
            periode={{ ...filtres.periode, libelle: "Entrée" }}
            resultats={filtres.actif ? `${fmtEntier(affiches.length)} sur ${fmtEntier(salaries.length)}` : undefined}
          />

          {affiches.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun salarié ne répond à cette recherche. Élargissez la période ou retirez un mot." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Matricule</Th>
                  <Th>Salarié</Th>
                  <Th>Poste</Th>
                  <Th>Contrat</Th>
                  <Th>Échéance</Th>
                  <Th>N° CNPS</Th>
                  {natures && <Th>Dossier</Th>}
                  <Th aligne="droite">Salaire de base</Th>
                </tr>
              </thead>
              <tbody>
                {affiches.map(({ salarie, jours }) => (
                  <tr key={salarie.id}>
                    <Td chiffres>{salarie.matricule}</Td>
                    <Td fort>
                      <Link href={`/rh/salaries/${salarie.id}`} className="flex items-center gap-2 hover:underline">
                        <Portrait photo={salarie.photo} nom={salarie.nom} taille="petite" />
                        {salarie.nom}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-xs text-[var(--encre-douce)]">
                        {salarie.poste}
                      </span>
                    </Td>
                    <Td>
                      <Pastille ton={TON_CONTRAT[salarie.contrat]}>
                        {LIBELLE_CONTRAT[salarie.contrat]}
                      </Pastille>
                    </Td>
                    <Td>
                      {jours === null ? (
                        <span className="text-xs text-[var(--encre-faible)]">
                          Indéterminée
                        </span>
                      ) : jours < 0 ? (
                        <Pastille ton="danger">Expiré</Pastille>
                      ) : jours <= 60 ? (
                        <Pastille ton="alerte">Dans {jours} j</Pastille>
                      ) : (
                        <span className="chiffres text-xs">{salarie.fin}</span>
                      )}
                    </Td>
                    <Td chiffres>
                      {/* Sans numéro CNPS, aucune déclaration n'est possible :
                          l'absence est signalée, pas laissée vide. */}
                      {salarie.numeroCnps ?? <Pastille ton="alerte">Manquant</Pastille>}
                    </Td>
                    {natures && (
                      <Td>
                        {(() => {
                          const manque = piecesManquantes(natures.get(salarie.id) ?? new Set(), Boolean(salarie.photo));
                          return manque.length === 0 ? (
                            <Pastille ton="valide">Complet</Pastille>
                          ) : (
                            <span title={`À compléter : ${manque.join(", ")}`}>
                              <Pastille ton="alerte">{manque.length} à compléter</Pastille>
                            </span>
                          );
                        })()}
                      </Td>
                    )}
                    <Td aligne="droite" chiffres fort>
                      {fmt(salarie.salaireBase)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}

          {sansCnps.length > 0 && (
            <p className="mt-4 max-w-[70ch] text-xs text-[var(--encre-faible)]">
              {sansCnps.length} salarié{sansCnps.length > 1 ? "s" : ""} sans numéro
              CNPS. La déclaration sociale les laissera de côté tant que le numéro
              manque, et le retard se règle auprès de la caisse, pas dans le
              logiciel.
            </p>
          )}
        </>
      )}
    </>
  );
}
