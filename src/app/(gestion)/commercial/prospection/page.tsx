import type { Metadata } from "next";
import Link from "next/link";

import { ChampsPlan } from "@/components/prospection/champs";
import { AccesRefuse } from "@/components/coque/acces-refuse";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { fmt, fmtDateIso, fmtPeriode } from "@/lib/format";
import { accesProspection } from "@/modules/prospection/acces";
import { creerPlan } from "@/modules/prospection/actions";
import { LIBELLE_CANAL, actionEnRetard, atteinte, bilanPlan } from "@/modules/prospection/regles";
import { aujourdhuiPour, commerciauxActifs, plansDe, prospectsDes } from "@/modules/prospection/requetes";

export const metadata: Metadata = { title: "Prospection" };

/**
 * Les plans de prospection : les siens pour un commercial, tous pour la
 * supervision. En tête, ce qui est à faire aujourd'hui et ce qui a pris du
 * retard, tous plans ouverts confondus.
 */
export default async function PageProspection() {
  const a = await accesProspection();
  if (!a.planifier) return <AccesRefuse droit="commercial.prospection.planifier" />;
  const org = a.session.organizationId;
  const [plans, aujourdhui, commerciaux] = await Promise.all([
    plansDe(org, a.superviser ? {} : { commercialId: a.monCommercialId }),
    aujourdhuiPour(org),
    a.superviser ? commerciauxActifs(org) : Promise.resolve(null),
  ]);
  const prospects = await prospectsDes(org, plans.map((p) => p.id));
  const ouverts = new Set(plans.filter((p) => p.statut === "ouvert").map((p) => p.id));

  const parPlan = new Map<string, typeof prospects>();
  for (const p of prospects) parPlan.set(p.planId, [...(parPlan.get(p.planId) ?? []), p]);

  const aFaire = prospects
    .filter((p) => ouverts.has(p.planId))
    .flatMap((p) => p.actions.filter((x) => x.statut === "prevue" && x.datePrevue <= aujourdhui).map((x) => ({ ...x, prospect: p.nom, planId: p.planId })))
    .sort((x, y) => (x.datePrevue + (x.heure ?? "")).localeCompare(y.datePrevue + (y.heure ?? "")));
  const enRetard = aFaire.filter((x) => actionEnRetard(x, aujourdhui)).length;
  const bilanOuvert = bilanPlan(prospects.filter((p) => ouverts.has(p.planId)), [], aujourdhui);

  const peutCreer = a.superviser ? (commerciaux?.length ?? 0) > 0 : a.monCommercialId !== null;

  return (
    <>
      <EnTetePage
        titre="Prospection"
        sousTitre={a.superviser ? "Les plans de tous les commerciaux" : "Vos plans de prospection"}
        actions={
          peutCreer && (
            <FormulaireRepliable libelle="Nouveau plan" titre="Nouveau plan de prospection" action={creerPlan} presentation="ample">
              <ChampsPlan commerciaux={commerciaux} aujourdhui={aujourdhui} />
            </FormulaireRepliable>
          )
        }
      />

      {!peutCreer && plans.length === 0 ? (
        <EtatVide
          titre={a.superviser ? "Aucun commercial enregistré" : "Votre compte n'est lié à aucun commercial"}
          message={
            a.superviser
              ? "Enregistrez d'abord les commerciaux dans « Commercial » : chaque plan de prospection appartient à l'un d'eux."
              : "Demandez à la direction de vous enregistrer dans « Commercial », lié à votre compte : vous pourrez alors élaborer vos plans."
          }
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CarteIndicateur libelle="Plans ouverts" valeur={String(ouverts.size)} />
            <CarteIndicateur libelle="Pistes en cours" valeur={String(bilanOuvert.prospects - bilanOuvert.convertis - bilanOuvert.parStatut.perdu)} precision={`${fmt(bilanOuvert.potentielOuvert)} F de potentiel`} ton="marque" />
            <CarteIndicateur libelle="Actions à faire" valeur={String(aFaire.length)} ton={aFaire.length ? "alerte" : "neutre"} />
            <CarteIndicateur libelle="En retard" valeur={String(enRetard)} ton={enRetard ? "danger" : "valide"} />
          </div>

          {aFaire.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">À faire aujourd&apos;hui et en retard</h2>
              <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-2xl border border-[var(--filet)] bg-[var(--surface)]">
                {aFaire.map((x) => (
                  <li key={x.id}>
                    <Link href={`/commercial/prospection/${x.planId}#prospect-${x.prospectId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-creuse)]">
                      <span className={`chiffres w-24 shrink-0 text-sm ${actionEnRetard(x, aujourdhui) ? "font-semibold text-danger-600" : ""}`}>
                        {x.datePrevue === aujourdhui ? (x.heure ?? "Aujourd'hui") : fmtDateIso(x.datePrevue)}
                      </span>
                      <Pastille>{LIBELLE_CANAL[x.canal]}</Pastille>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <strong>{x.prospect}</strong> — {x.objet}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plans.length === 0 ? (
            <EtatVide titre="Aucun plan de prospection" message="Un plan fixe une période, une zone et des objectifs, puis la liste des prospects à approcher — particuliers, entreprises, ONG, mutuelles, associations, coopératives — avec les visites et appels prévus." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Plan</Th>
                  {a.superviser && <Th>Commercial</Th>}
                  <Th>Période</Th>
                  <Th aligne="droite">Prospects</Th>
                  <Th aligne="droite">Contacts</Th>
                  <Th aligne="droite">Nouveaux clients</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const liste = parPlan.get(plan.id) ?? [];
                  const bilan = bilanPlan(liste, liste.flatMap((p) => p.actions), aujourdhui);
                  const contacts = atteinte(bilan.actionsRealisees, plan.objectifContacts);
                  const clients = atteinte(bilan.convertis, plan.objectifClients);
                  return (
                    <tr key={plan.id} className="hover:bg-[var(--surface-creuse)]">
                      <Td>
                        <Link href={`/commercial/prospection/${plan.id}`} className="font-semibold text-marque-600 hover:underline">
                          {plan.titre}
                        </Link>
                        <span className="chiffres block text-xs text-[var(--encre-faible)]">
                          {plan.numero}
                          {plan.zone ? ` · ${plan.zone}` : ""}
                        </span>
                      </Td>
                      {a.superviser && <Td>{plan.commercial}</Td>}
                      <Td chiffres>{fmtPeriode(plan.debut, plan.fin)}</Td>
                      <Td aligne="droite" chiffres>
                        {bilan.prospects}
                      </Td>
                      <Td aligne="droite" chiffres>
                        {bilan.actionsRealisees}
                        {plan.objectifContacts > 0 && ` / ${plan.objectifContacts}`}
                        {contacts !== null && <span className="block text-xs text-[var(--encre-faible)]">{contacts} %</span>}
                      </Td>
                      <Td aligne="droite" chiffres>
                        {bilan.convertis}
                        {plan.objectifClients > 0 && ` / ${plan.objectifClients}`}
                        {clients !== null && <span className="block text-xs text-[var(--encre-faible)]">{clients} %</span>}
                      </Td>
                      <Td>
                        {plan.statut === "clos" ? <Pastille>Clos</Pastille> : plan.fin < aujourdhui ? <Pastille ton="alerte">Échu</Pastille> : <Pastille ton="valide">Ouvert</Pastille>}
                        {bilan.actionsEnRetard > 0 && plan.statut === "ouvert" && (
                          <span className="ml-1">
                            <Pastille ton="danger">{bilan.actionsEnRetard} en retard</Pastille>
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
