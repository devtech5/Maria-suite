import type { Metadata } from "next";

import { FormulaireIntervention } from "@/components/actifs/formulaire-intervention";
import { STATUT_ACTIF } from "@/components/actifs/statut";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, CarteIndicateur, Champ, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { listerActifs, listerInterventions } from "@/modules/actifs/requetes";
import { creerLocal } from "@/modules/moyens-generaux/actions";

export const metadata: Metadata = { title: "Entretien des locaux" };

const NATURE = { preventif: "Préventif", correctif: "Correctif", controle: "Contrôle" } as const;
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" });

/**
 * Entretien des locaux : bureaux, entrepôts, magasins.
 *
 * Un local est un actif de type « local ». Nettoyage, plomberie, électricité,
 * climatisation s'enregistrent comme interventions — préventives quand elles
 * sont prévues, correctives quand elles sont subies — et les contrôles
 * périodiques (extincteurs, désinfection) comme échéances, dans Actifs.
 */
export default async function PageEntretienLocaux({ searchParams }: PageProps<"/moyens-generaux/locaux">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [tous, interventions, gerer, saisir] = await Promise.all([
    listerActifs(session.organizationId),
    listerInterventions(session.organizationId, 200),
    peut("moyens_generaux.gerer"),
    peut("actifs.intervention.saisir"),
  ]);
  const locaux = tous.filter((a) => a.type === "local");
  const codes = new Set(locaux.map((l) => l.code));
  const surLocaux = interventions.filter((i) => codes.has(i.actifCode));
  const cout = locaux.reduce((s, l) => s + l.coutMaintenance, 0);
  const correctifs = surLocaux.filter((i) => i.nature === "correctif").length;
  const horsService = locaux.filter((l) => l.statut === "immobilise" || l.statut === "entretien").length;
  // Les indicateurs portent sur tous les locaux ; les deux tableaux suivent la
  // recherche : le local trouvé, et ses seules interventions.
  const trouves = locaux.filter((l) => correspond(filtres.q, [l.code, l.designation, l.site, STATUT_ACTIF[l.statut].libelle]));
  const codesTrouves = new Set(trouves.map((l) => l.code));
  const interventionsTrouvees = filtres.q ? surLocaux.filter((i) => codesTrouves.has(i.actifCode)) : surLocaux;

  return (
    <>
      <EnTetePage
        titre="Entretien des locaux"
        sousTitre="Nettoyage, réparations et contrôles des bureaux, entrepôts et magasins."
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {saisir && locaux.length > 0 && (
              <FormulaireIntervention
                actifs={locaux.map((l) => ({ id: l.id, code: l.code, designation: l.designation, uniteCompteur: null, compteur: null, proprietaire: null }))}
              />
            )}
            {gerer && (
              <FormulaireRepliable libelle="Nouveau local" titre="Nouveau local" action={creerLocal}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Champ libelle="Nom du local">
                    <input name="designation" required placeholder="Bureaux — 2e étage" className={CLASSE_CHAMP} />
                  </Champ>
                  <Champ libelle="Site">
                    <input name="site" placeholder="Cocody, Riviera 3" className={CLASSE_CHAMP} />
                  </Champ>
                  <Champ libelle="Note">
                    <input name="notes" placeholder="Surface, bail, contact du bailleur…" className={CLASSE_CHAMP} />
                  </Champ>
                </div>
              </FormulaireRepliable>
            )}
          </div>
        }
      />

      {locaux.length === 0 ? (
        <EtatVide titre="Aucun local suivi" message="Ouvrez la fiche de chaque bureau, entrepôt ou magasin. Ses nettoyages, réparations et contrôles s'enregistrent ensuite ici, avec leur coût." />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CarteIndicateur libelle="Locaux suivis" valeur={fmtEntier(locaux.length)} />
            <CarteIndicateur libelle="Coût d'entretien" valeur={fmt(cout)} unite="FCFA" ton="marque" precision="Cumul des interventions" />
            <CarteIndicateur libelle="Pannes subies" valeur={fmtEntier(correctifs)} ton={correctifs > 0 ? "alerte" : "valide"} precision="Interventions correctives" />
            <CarteIndicateur libelle="Hors service" valeur={fmtEntier(horsService)} ton={horsService > 0 ? "danger" : "valide"} precision="En travaux ou fermés" />
          </section>

          <Recherche
            chemin="/moyens-generaux/locaux"
            valeur={filtres.q}
            placeholder="Code, local, site…"
            resultats={filtres.q ? `${fmtEntier(trouves.length)} sur ${fmtEntier(locaux.length)}` : undefined}
          />

          {trouves.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun local ne répond à cette recherche. Retirez un mot ou cherchez par site." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Local</Th>
                  <Th>Site</Th>
                  <Th aligne="droite">Interventions</Th>
                  <Th aligne="droite">Coût d&apos;entretien</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {trouves.map((l) => (
                  <tr key={l.id}>
                    <Td chiffres>{l.code}</Td>
                    <Td fort>{l.designation}</Td>
                    <Td>{l.site ?? "—"}</Td>
                    <Td aligne="droite" chiffres>
                      {fmtEntier(l.interventions)}
                    </Td>
                    <Td aligne="droite" chiffres>
                      {fmt(l.coutMaintenance)}
                    </Td>
                    <Td>
                      <Pastille ton={STATUT_ACTIF[l.statut].ton}>{STATUT_ACTIF[l.statut].libelle}</Pastille>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}

          <h2 className="mb-3 mt-8 text-base font-semibold">Dernières interventions</h2>
          {interventionsTrouvees.length === 0 ? (
            <p className="text-sm text-[var(--encre-douce)]">
              {filtres.q ? "Aucune intervention enregistrée sur les locaux trouvés." : "Aucune intervention enregistrée sur les locaux."}
            </p>
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Local</Th>
                  <Th>Nature</Th>
                  <Th>Travaux</Th>
                  <Th>Prestataire</Th>
                  <Th aligne="droite">Coût</Th>
                </tr>
              </thead>
              <tbody>
                {interventionsTrouvees.slice(0, 30).map((i) => (
                  <tr key={i.id}>
                    <Td chiffres>{JOUR.format(i.effectueeLe)}</Td>
                    <Td>{i.actifDesignation}</Td>
                    <Td>
                      <Pastille ton={i.nature === "correctif" ? "alerte" : "neutre"}>{NATURE[i.nature]}</Pastille>
                    </Td>
                    <Td>{i.libelle}</Td>
                    <Td>{i.prestataire ?? "—"}</Td>
                    <Td aligne="droite" chiffres>
                      {fmt(i.cout)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
