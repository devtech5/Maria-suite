import type { Metadata } from "next";

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
import { lireFiltresListe } from "@/lib/recherche";
import { listerActifs, listerInterventions } from "@/modules/actifs/requetes";
import type { NatureIntervention } from "@/modules/actifs/schema";

import {
  FormulaireIntervention,
  type OptionActif,
} from "@/components/actifs/formulaire-intervention";

export const metadata: Metadata = { title: "Interventions" };

const LIBELLE_NATURE: Record<NatureIntervention, string> = {
  preventif: "Préventif",
  correctif: "Correctif",
  controle: "Contrôle",
};

const TON: Record<NatureIntervention, TonPastille> = {
  preventif: "valide",
  correctif: "alerte",
  controle: "marque",
};

const dateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Historique des interventions.
 *
 * Le même écran couvre deux situations que rien n'oblige à séparer :
 * l'entretien d'un actif de l'entreprise, qui est une charge, et l'intervention
 * sur l'actif d'un client, qui est facturable. C'est ce qui permet au moteur de
 * porter aussi bien un parc automobile qu'un garage.
 */
export default async function PageInterventions({ searchParams }: PageProps<"/actifs/interventions">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);

  // Les indicateurs portent sur les dernières interventions ; seul le tableau
  // suit la recherche, filtrée en base pour atteindre les plus anciennes.
  const [lignes, parc, trouvees] = await Promise.all([
    listerInterventions(session.organizationId),
    listerActifs(session.organizationId),
    filtres.actif ? listerInterventions(session.organizationId, 500, filtres) : null,
  ]);
  const affichees = trouvees ?? lignes;

  const interne = lignes.filter((i) => !i.facturable);
  const facturable = lignes.filter((i) => i.facturable);

  const coutInterne = interne.reduce((s, i) => s + i.cout, 0);
  const produitFacturable = facturable.reduce((s, i) => s + i.cout, 0);
  const correctifs = lignes.filter((i) => i.nature === "correctif").length;

  const options: OptionActif[] = parc.map((actif) => ({
    id: actif.id,
    code: actif.code,
    designation: actif.designation,
    uniteCompteur: actif.uniteCompteur,
    compteur: actif.compteur,
    proprietaire: actif.proprietaire,
  }));

  return (
    <>
      <EnTetePage
        titre="Interventions"
        sousTitre="Entretien du parc et travaux facturés aux clients"
        actions={<FormulaireIntervention actifs={options} />}
      />

      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucune intervention"
          message={
            parc.length === 0
              ? "Ouvrez d'abord une fiche d'actif : une intervention se rattache toujours à quelque chose."
              : "Chaque passage à l'atelier se note ici, avec son coût et le relevé du compteur. C'est la proportion de correctif sur préventif qui dit si un parc est tenu ou subi."
          }
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Interventions"
              valeur={fmtEntier(lignes.length)}
              precision={`${interne.length} sur le parc · ${facturable.length} clients`}
            />
            <CarteIndicateur
              libelle="Charge d'entretien"
              valeur={fmtCompact(coutInterne)}
              unite="FCFA"
              precision="Actifs de l'entreprise"
            />
            <CarteIndicateur
              libelle="À facturer"
              valeur={fmtCompact(produitFacturable)}
              unite="FCFA"
              ton={produitFacturable > 0 ? "marque" : "neutre"}
              precision="Travaux sur actifs de clients"
            />
            <CarteIndicateur
              libelle="Correctifs"
              valeur={fmtEntier(correctifs)}
              ton={correctifs > lignes.length / 2 ? "alerte" : "valide"}
              precision="Pannes subies, non prévues"
            />
          </section>

          <Recherche
            chemin="/actifs/interventions"
            valeur={filtres.q}
            placeholder="Numéro, actif, travaux, prestataire, client…"
            periode={{ ...filtres.periode, libelle: "Date d'intervention" }}
            resultats={filtres.actif ? `${fmtEntier(affichees.length)} intervention${affichees.length > 1 ? "s" : ""}` : undefined}
          />

          {affichees.length === 0 ? (
            <EtatVide titre="Aucune intervention ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Numéro</Th>
                  <Th>Date</Th>
                  <Th>Actif</Th>
                  <Th>Nature</Th>
                  <Th>Travaux</Th>
                  <Th>Prestataire</Th>
                  <Th aligne="droite">Compteur</Th>
                  <Th aligne="droite">Montant</Th>
                </tr>
              </thead>
              <tbody>
                {affichees.map((ligne) => (
                  <tr key={ligne.id}>
                    <Td chiffres>{ligne.numero}</Td>
                    <Td chiffres>{dateCourte.format(ligne.effectueeLe)}</Td>
                    <Td fort>
                      {ligne.actifCode}
                      <span className="block text-xs font-normal text-[var(--encre-faible)]">
                        {ligne.client ? `Client — ${ligne.client}` : ligne.actifDesignation}
                      </span>
                    </Td>
                    <Td>
                      <Pastille ton={TON[ligne.nature]}>
                        {LIBELLE_NATURE[ligne.nature]}
                      </Pastille>
                    </Td>
                    <Td>{ligne.libelle}</Td>
                    <Td>
                      <span className="text-xs text-[var(--encre-douce)]">
                        {ligne.prestataire ?? "—"}
                      </span>
                    </Td>
                    <Td aligne="droite" chiffres>
                      {ligne.compteur !== null
                        ? `${fmtEntier(ligne.compteur)} ${ligne.uniteCompteur ?? ""}`
                        : "—"}
                    </Td>
                    <Td aligne="droite" chiffres fort>
                      {/* Le montant d'une intervention facturable est un produit
                          à venir, pas une charge : il se distingue à l'œil. */}
                      <span className={ligne.facturable ? "text-marque-600" : ""}>
                        {fmt(ligne.cout)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}

          <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
            Une intervention ne pose pas d&apos;écriture comptable. Le coût
            constaté ici est un engagement de dépense ; la charge naît quand la
            facture du prestataire est enregistrée. Compter les deux ferait
            passer la même réparation deux fois au résultat.
          </p>
        </>
      )}
    </>
  );
}
