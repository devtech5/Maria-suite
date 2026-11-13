import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnnulerIntervenant, ConfierIntervenant, FixerBudget, PayerIntervenant, VoirDecharge } from "@/components/missions/intervenants";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtDateIso } from "@/lib/format";
import { LIBELLE_STATUT, MOYENS, NATURES_INTERVENANT, bilanBudget, type StatutIntervenant } from "@/modules/missions/budget";
import { aujourdhuiPour, choixIntervenants, intervenantsDe, missionBudgetee } from "@/modules/missions/intervenants";

export const metadata: Metadata = { title: "Budget et intervenants" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TON: Record<StatutIntervenant, TonPastille> = { a_payer: "alerte", paye: "valide", annule: "neutre" };

/**
 * Le budget d'une mission et ses intervenants : chacun a une tâche précise et
 * un montant convenu, imputé au budget ; chacun est payé sur place, contre une
 * décharge qui se garde comme preuve.
 */
export default async function PageMissionBudget({ params }: PageProps<"/missions/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const org = session.organizationId;
  const mission = await missionBudgetee(org, id);
  if (!mission) notFound();
  const [gerer, payer, lignes, aujourdhui] = await Promise.all([peut("missions.mission.gerer"), peut("missions.terrain.saisir"), intervenantsDe(org, id), aujourdhuiPour(org)]);
  const choix = gerer ? await choixIntervenants(org) : { intervenants: [], prestataires: [] };
  const bilan = bilanBudget(mission.budget, lignes);
  const close = ["terminee", "echouee", "annulee"].includes(mission.statut);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/missions" className="font-semibold text-marque-600 hover:underline">
          ← Missions
        </Link>
      </p>
      <EnTetePage
        titre={mission.titre}
        sousTitre={[mission.reference, mission.collaborateur ? `Collaborateur : ${mission.collaborateur}` : mission.intervenant ? `Intervenant : ${mission.intervenant}` : "Non attribuée", mission.lieu].filter(Boolean).join(" · ")}
        actions={
          gerer && (
            <>
              <FixerBudget missionId={id} budget={mission.budget} />
              <ConfierIntervenant missionId={id} choix={choix} reste={bilan.reste} desactive={mission.budget === null || close} />
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CarteIndicateur libelle="Budget" valeur={mission.budget === null ? "—" : fmt(mission.budget)} unite={mission.budget === null ? undefined : "F"} precision={mission.budget === null ? "À fixer pour confier des tâches" : undefined} />
        <CarteIndicateur libelle="Confié" valeur={fmt(bilan.engage)} unite="F" ton="marque" precision={`${lignes.filter((l) => l.statut !== "annule").length} tâche(s)`} />
        <CarteIndicateur libelle="Payé" valeur={fmt(bilan.paye)} unite="F" ton="valide" precision={bilan.aPayer > 0 ? `${fmt(bilan.aPayer)} F restent à payer` : "Tout est payé"} />
        <CarteIndicateur libelle="Reste au budget" valeur={bilan.reste === null ? "—" : fmt(bilan.reste)} unite={bilan.reste === null ? undefined : "F"} ton={bilan.reste !== null && bilan.reste < 0 ? "danger" : "neutre"} />
      </div>

      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucun intervenant sur cette mission"
          message={
            mission.budget === null
              ? gerer
                ? "Pour confier une tâche — manutention, vendeuse, entreprise, prestataire — fixez d'abord le budget de la mission."
                : "Aucun budget n'est fixé pour cette mission."
              : "Confiez une tâche précise à une personne ou à une entreprise : son montant s'impute au budget, et elle se paie sur place contre une décharge."
          }
        />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Tâche</Th>
              <Th>Qui</Th>
              <Th aligne="droite">Montant</Th>
              <Th>État</Th>
              {(payer || gerer) && <Th aligne="droite">Gestes</Th>}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className={l.statut === "annule" ? "opacity-60" : ""}>
                <Td fort>{l.tache}</Td>
                <Td>
                  {l.nom}
                  <span className="block text-xs text-[var(--encre-faible)]">{[NATURES_INTERVENANT[l.nature], l.telephone].filter(Boolean).join(" · ")}</span>
                </Td>
                <Td aligne="droite" chiffres fort>
                  {fmt(l.montantConvenu)}
                </Td>
                <Td>
                  <Pastille ton={TON[l.statut]}>{LIBELLE_STATUT[l.statut]}</Pastille>
                  {l.statut === "paye" && l.payeLe && (
                    <span className="block text-xs text-[var(--encre-faible)]">
                      {fmtDateIso(l.payeLe)}
                      {l.moyen ? ` · ${MOYENS[l.moyen]}` : ""}
                      {l.recuPar ? ` · reçu par ${l.recuPar}` : ""}
                    </span>
                  )}
                  {l.statut === "paye" && l.decharge && (
                    <span className="block">
                      <VoirDecharge id={l.id} nom={l.dechargeNom} />
                    </span>
                  )}
                  {l.statut === "annule" && l.motifAnnulation && <span className="block text-xs text-[var(--encre-faible)]">{l.motifAnnulation}</span>}
                </Td>
                {(payer || gerer) && (
                  <Td aligne="droite">
                    {l.statut === "a_payer" && (
                      <span className="inline-flex flex-wrap items-center justify-end gap-3">
                        {payer && <PayerIntervenant id={l.id} nom={l.nom} montant={l.montantConvenu} aujourdhui={aujourdhui} />}
                        {gerer && <AnnulerIntervenant id={l.id} />}
                      </span>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
