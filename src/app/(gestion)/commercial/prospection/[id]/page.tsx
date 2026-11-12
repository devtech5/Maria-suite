import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChampsProspect } from "@/components/prospection/champs";
import { AnnulerAction, ChangerStatut, CompteRendu, Convertir, PlanifierAction, StatutPlan } from "@/components/prospection/gestes";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmt, fmtDateIso, fmtPeriode } from "@/lib/format";
import { accesProspection } from "@/modules/prospection/acces";
import { ajouterProspect } from "@/modules/prospection/actions";
import { LIBELLE_CANAL, LIBELLE_STATUT_ACTION, LIBELLE_STATUT_PROSPECT, actionEnRetard, atteinte, bilanPlan, convertible, type StatutProspect } from "@/modules/prospection/regles";
import { aujourdhuiPour, clientsPourRattacher, planDe, prospectsDes, type ProspectVue } from "@/modules/prospection/requetes";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS } from "@/modules/tiers/natures";

export const metadata: Metadata = { title: "Plan de prospection" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TON_STATUT: Record<StatutProspect, TonPastille> = {
  a_contacter: "neutre",
  en_discussion: "marque",
  interesse: "alerte",
  converti: "valide",
  perdu: "danger",
};

/** Ordre d'affichage : les pistes chaudes d'abord, les closes en dernier. */
const RANG: Record<StatutProspect, number> = { interesse: 0, en_discussion: 1, a_contacter: 2, converti: 3, perdu: 4 };

export default async function PagePlanProspection({ params }: PageProps<"/commercial/prospection/[id]">) {
  const { id } = await params;
  const a = await accesProspection();
  if (!UUID.test(id)) notFound();
  const org = a.session.organizationId;
  const plan = await planDe(org, id);
  if (!plan || !a.voit(plan)) notFound();
  const [prospects, aujourdhui, clients] = await Promise.all([prospectsDes(org, [plan.id]), aujourdhuiPour(org), a.enregistrerClients ? clientsPourRattacher(org) : Promise.resolve([])]);
  const gere = a.gere(plan);
  const bilan = bilanPlan(prospects, prospects.flatMap((p) => p.actions), aujourdhui);
  const contacts = atteinte(bilan.actionsRealisees, plan.objectifContacts);
  const nouveaux = atteinte(bilan.convertis, plan.objectifClients);
  const tries = [...prospects].sort((x, y) => RANG[x.statut] - RANG[y.statut]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/commercial/prospection" className="font-semibold text-marque-600 hover:underline">
          ← Plans de prospection
        </Link>
      </p>
      <EnTetePage
        titre={plan.titre}
        sousTitre={[plan.numero, plan.commercial, fmtPeriode(plan.debut, plan.fin), plan.zone].filter(Boolean).join(" · ")}
        actions={
          <>
            {gere && (
              <FormulaireRepliable libelle="Ajouter un prospect" titre="Nouveau prospect" action={ajouterProspect.bind(null, plan.id)} presentation="tiroir">
                <ChampsProspect />
              </FormulaireRepliable>
            )}
            {a.voit(plan) && <StatutPlan planId={plan.id} statut={plan.statut === "clos" ? "clos" : "ouvert"} />}
          </>
        }
      />

      {(plan.cibles || plan.notes) && (
        <div className="mb-5 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-sm">
          {plan.cibles && (
            <p>
              <span className="font-semibold">Cibles : </span>
              {plan.cibles}
            </p>
          )}
          {plan.notes && <p className="mt-1 whitespace-pre-line text-[var(--encre-douce)]">{plan.notes}</p>}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CarteIndicateur
          libelle="Contacts réalisés"
          valeur={plan.objectifContacts > 0 ? `${bilan.actionsRealisees} / ${plan.objectifContacts}` : String(bilan.actionsRealisees)}
          precision={contacts !== null ? `${contacts} % de l'objectif` : `${bilan.actionsPrevues} prévus`}
          ton="marque"
        />
        <CarteIndicateur
          libelle="Devenus clients"
          valeur={plan.objectifClients > 0 ? `${bilan.convertis} / ${plan.objectifClients}` : String(bilan.convertis)}
          precision={nouveaux !== null ? `${nouveaux} % de l'objectif` : `${bilan.tauxConversion} % des prospects`}
          ton="valide"
        />
        <CarteIndicateur libelle="Potentiel en cours" valeur={fmt(bilan.potentielOuvert)} unite="F" precision={plan.objectifCa > 0 ? `Objectif ${fmt(plan.objectifCa)} F · gagné ${fmt(bilan.potentielGagne)} F` : `Gagné ${fmt(bilan.potentielGagne)} F`} />
        <CarteIndicateur libelle="Actions en retard" valeur={String(bilan.actionsEnRetard)} ton={bilan.actionsEnRetard ? "danger" : "valide"} />
      </div>

      {bilan.prospects > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
          {NATURES_TIERS.filter((n) => bilan.parNature[n]).map((n) => (
            <span key={n} className="rounded-full border border-[var(--filet)] bg-[var(--surface)] px-3 py-1 font-semibold">
              {LIBELLE_NATURE_TIERS[n]} <span className="chiffres opacity-70">{bilan.parNature[n]}</span>
            </span>
          ))}
        </div>
      )}

      {!gere && plan.statut === "clos" && <p className="mb-4 rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm">Ce plan est clos : il se consulte, et se rouvre pour être modifié.</p>}

      {tries.length === 0 ? (
        <EtatVide titre="Aucun prospect dans ce plan" message="Ajoutez les prospects à approcher, avec leur type et la personne à voir, puis planifiez visites et appels." />
      ) : (
        <ul className="space-y-3">
          {tries.map((p) => (
            <CarteProspect key={p.id} p={p} gere={gere} aujourdhui={aujourdhui} convertir={a.enregistrerClients} clients={clients} />
          ))}
        </ul>
      )}
    </>
  );
}

function CarteProspect({ p, gere, aujourdhui, convertir, clients }: { p: ProspectVue; gere: boolean; aujourdhui: string; convertir: boolean; clients: { id: string; code: string; nom: string }[] }) {
  const ouvert = convertible(p.statut);
  return (
    <li id={`prospect-${p.id}`} className="scroll-mt-20 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{p.nom}</h2>
          <p className="text-sm text-[var(--encre-douce)]">
            {[p.contact && (p.fonction ? `${p.contact}, ${p.fonction}` : p.contact), p.telephone, p.ville, p.secteur].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <span className="flex shrink-0 flex-wrap gap-1">
          <Pastille ton="marque">{LIBELLE_NATURE_TIERS[p.nature]}</Pastille>
          <Pastille ton={TON_STATUT[p.statut]}>{LIBELLE_STATUT_PROSPECT[p.statut]}</Pastille>
        </span>
      </div>

      {(p.besoin || p.potentiel > 0) && (
        <p className="mt-2 text-sm">
          {p.potentiel > 0 && <span className="chiffres font-semibold">{fmt(p.potentiel)} F · </span>}
          {p.besoin}
        </p>
      )}
      {p.statut === "perdu" && p.motifPerte && <p className="mt-1 text-sm text-danger-600">Perdu : {p.motifPerte}</p>}
      {p.statut === "converti" && p.client && (
        <p className="mt-1 text-sm text-valide-600">
          Client{" "}
          <Link href={`/commercial?q=${encodeURIComponent(p.nom)}`} className="chiffres font-semibold underline">
            {p.client}
          </Link>
        </p>
      )}

      {p.actions.length > 0 && (
        <ol className="mt-3 space-y-2 border-l-2 border-[var(--filet)] pl-3">
          {p.actions.map((x) => (
            <li key={x.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chiffres ${actionEnRetard(x, aujourdhui) ? "font-semibold text-danger-600" : ""}`}>
                  {fmtDateIso(x.datePrevue)}
                  {x.heure ? ` ${x.heure}` : ""}
                </span>
                <Pastille>{LIBELLE_CANAL[x.canal]}</Pastille>
                <span className={x.statut === "annulee" ? "text-[var(--encre-faible)] line-through" : ""}>{x.objet}</span>
                {x.statut !== "prevue" && <Pastille ton={x.statut === "realisee" ? "valide" : "neutre"}>{LIBELLE_STATUT_ACTION[x.statut]}</Pastille>}
                {actionEnRetard(x, aujourdhui) && <Pastille ton="danger">En retard</Pastille>}
                {gere && x.statut === "prevue" && <AnnulerAction actionId={x.id} />}
              </div>
              {x.compteRendu && <p className="mt-0.5 whitespace-pre-line text-[var(--encre-douce)]">{x.compteRendu}</p>}
              {gere && x.statut === "prevue" && (
                <div className="mt-1">
                  <CompteRendu actionId={x.id} statut={p.statut} aujourdhui={aujourdhui} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {gere && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {ouvert && <PlanifierAction prospectId={p.id} aujourdhui={aujourdhui} />}
          <ChangerStatut prospectId={p.id} statut={p.statut} />
          {ouvert && convertir && <Convertir prospectId={p.id} nom={p.nom} clients={clients} />}
        </div>
      )}
    </li>
  );
}
