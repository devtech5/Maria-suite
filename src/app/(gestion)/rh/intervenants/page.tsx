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
} from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { depuisQuantite } from "@/lib/quantite";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { LIBELLE_MODE } from "@/modules/personnes/paie";
import {
  listerIntervenants,
  type IntervenantAvecCompte,
} from "@/modules/personnes/requetes";

import {
  FormulaireBonPaiement,
  FormulaireIntervenant,
  FormulairePointage,
  type OptionIntervenant,
} from "./formulaires";

export const metadata: Metadata = { title: "Intervenants" };

const SANS_CHANTIER = "Sans affectation";

/**
 * Main-d'œuvre non salariée.
 *
 * Un maçon sur un chantier n'ouvre jamais le logiciel, n'a pas de contrat à
 * durée indéterminée, pas de numéro CNPS et pas de bulletin de paie. Il est
 * payé à la journée, à la tâche ou au mètre carré. Le module de paie classique
 * ne sait pas le représenter — c'est pour cela qu'aucun ERP concurrent n'est
 * utilisable sur un chantier ivoirien.
 *
 * Le même écran sert bien au-delà du bâtiment : chauffeurs occasionnels en
 * livraison, serveurs extra au maquis, coiffeuses à la commission, ouvriers
 * saisonniers, mécaniciens à la tâche.
 */
export default async function PageIntervenants({ searchParams }: PageProps<"/rh/intervenants">) {
  const session = await exigerEntreprise();
  // Ni pointage ni bon n'est listé ici : pas de date utile, la recherche seule.
  const { q } = lireFiltresListe(await searchParams);
  const intervenants = await listerIntervenants(session.organizationId);

  // Indicateurs et formulaires portent sur tous les intervenants ; seuls les tableaux suivent la recherche.
  const affiches = intervenants.filter((i) =>
    correspond(q, [i.nom, i.code, i.qualification, i.telephone, i.affectation, LIBELLE_MODE[i.mode]]),
  );
  const chantiers = new Set(intervenants.map((i) => i.affectation ?? SANS_CHANTIER)).size;

  const parChantier = new Map<string, IntervenantAvecCompte[]>();
  for (const intervenant of affiches) {
    const cle = intervenant.affectation ?? SANS_CHANTIER;
    const equipe = parChantier.get(cle) ?? [];
    equipe.push(intervenant);
    parChantier.set(cle, equipe);
  }

  const totalDu = intervenants.reduce((somme, i) => somme + i.du, 0);
  const totalEngage = intervenants.reduce((somme, i) => somme + i.engage, 0);

  const options: OptionIntervenant[] = intervenants.map((i) => ({
    id: i.id,
    nom: i.nom,
    qualification: i.qualification,
    uniteLibelle: i.uniteLibelle,
    taux: i.taux,
    du: i.du,
    affectation: i.affectation,
  }));

  return (
    <>
      <EnTetePage
        titre="Intervenants"
        sousTitre="Main-d'œuvre payée à la journée, à la tâche ou à l'unité d'œuvre"
        actions={
          <>
            <FormulairePointage intervenants={options} />
            <FormulaireIntervenant premier={intervenants.length === 0} />
          </>
        }
      />

      {intervenants.length === 0 ? (
        <EtatVide
          titre="Aucun intervenant"
          message="Le maçon, le manœuvre, le chauffeur occasionnel ou le serveur extra n'ouvrent pas le logiciel et n'ont pas de bulletin : ils ont un pointage, un taux et un bon de paiement. Ouvrez une fiche, ou installez le jeu de démonstration."
          actions={<BoutonDemonstration libelle="Installer le jeu de démonstration" />}
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Intervenants actifs"
              valeur={fmtEntier(intervenants.length)}
              precision={`Sur ${chantiers} chantiers`}
            />
            <CarteIndicateur
              libelle="Main-d'œuvre engagée"
              valeur={fmtCompact(totalEngage)}
              unite="FCFA"
              precision="Somme des pointages"
            />
            <CarteIndicateur
              libelle="Reste à régler"
              valeur={fmtCompact(totalDu)}
              unite="FCFA"
              ton={totalDu > 0 ? "alerte" : "valide"}
              precision="Bons de paiement déduits"
            />
          </section>

          <div className="mb-5">
            <FormulaireBonPaiement intervenants={options} />
          </div>

          <Recherche
            chemin="/rh/intervenants"
            valeur={q}
            placeholder="Nom, code, qualification, chantier, téléphone…"
            resultats={q ? `${fmtEntier(affiches.length)} sur ${fmtEntier(intervenants.length)}` : undefined}
          />

          {affiches.length === 0 && (
            <EtatVide titre="Aucun intervenant ne répond" message="Retirez un mot de la recherche, ou cherchez par chantier ou qualification." />
          )}

          <div className="space-y-5">
            {[...parChantier.entries()].map(([chantier, equipe]) => {
              const engage = equipe.reduce((s, i) => s + i.engage, 0);
              const du = equipe.reduce((s, i) => s + i.du, 0);

              return (
                <section
                  key={chantier}
                  className="overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--filet)] bg-[var(--surface-creuse)] px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold">{chantier}</h2>
                      <p className="text-xs text-[var(--encre-faible)]">
                        {equipe.length} intervenant{equipe.length > 1 ? "s" : ""} ·{" "}
                        {fmt(engage)} FCFA engagés
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-[var(--encre-faible)]">
                        Reste à régler
                      </p>
                      <p
                        className={`chiffres text-base font-bold ${du > 0 ? "text-alerte-600" : ""}`}
                      >
                        {fmt(du)}
                      </p>
                    </div>
                  </header>

                  <Tableau>
                    <thead>
                      <tr>
                        <Th>Intervenant</Th>
                        <Th>Qualification</Th>
                        <Th>Rémunération</Th>
                        <Th aligne="droite">Taux</Th>
                        <Th aligne="droite">Pointé</Th>
                        <Th aligne="droite">Engagé</Th>
                        <Th aligne="droite">Reste dû</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipe.map((intervenant) => (
                        <tr key={intervenant.id}>
                          <Td fort>
                            {intervenant.nom}
                            <span className="chiffres block text-xs font-normal text-[var(--encre-faible)]">
                              {intervenant.telephone ?? intervenant.code}
                            </span>
                          </Td>
                          <Td>
                            <Pastille>{intervenant.qualification}</Pastille>
                          </Td>
                          <Td>
                            <span className="text-xs text-[var(--encre-douce)]">
                              {LIBELLE_MODE[intervenant.mode]}
                            </span>
                          </Td>
                          <Td aligne="droite" chiffres>
                            {fmt(intervenant.taux)}
                            <span className="block text-xs text-[var(--encre-faible)]">
                              / {intervenant.uniteLibelle}
                            </span>
                          </Td>
                          <Td aligne="droite" chiffres>
                            {fmtEntier(depuisQuantite(intervenant.pointe))}
                          </Td>
                          <Td aligne="droite" chiffres>
                            {fmt(intervenant.engage)}
                          </Td>
                          <Td aligne="droite" chiffres fort>
                            <span className={intervenant.du > 0 ? "text-alerte-600" : ""}>
                              {fmt(intervenant.du)}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Tableau>
                </section>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
        Un intervenant ne reçoit pas de bulletin de paie mais un bon de paiement.
        Sa rémunération se ventile en 637 — personnel extérieur — et non en
        charges de personnel salarié : l&apos;y mêler gonflerait la masse
        salariale déclarée de gens qui ne figurent sur aucune déclaration CNPS.
        Un intervenant régularisé en contrat de travail conserve son historique.
      </p>
    </>
  );
}
