import type { Metadata } from "next";
import Link from "next/link";

import { AnnulerPerdiem, AttributionPerdiem, PayerPerdiem } from "@/components/perdiem/gestes";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtDateIso } from "@/lib/format";
import { LIBELLE_STATUT, MOYENS, STATUTS, bilanPerdiem, type StatutPerdiem } from "@/modules/perdiem/regles";
import { aujourdhuiPour, choixAttribution, listerAttributions } from "@/modules/perdiem/requetes";

export const metadata: Metadata = { title: "Perdiem" };

const TON: Record<StatutPerdiem, TonPastille> = { a_payer: "alerte", paye: "valide", annule: "neutre" };

/**
 * Les perdiem attribués aux collaborateurs : ce qui reste à payer en tête, puis
 * la liste. La comptable attribue, paie et annule ; les autres consultent.
 */
export default async function PagePerdiem({ searchParams }: PageProps<"/perdiem">) {
  const session = await exigerEntreprise();
  const org = session.organizationId;
  const parametres = await searchParams;
  const statut = STATUTS.find((s) => s === parametres.statut) ?? null;
  const [gerer, tout, aujourdhui] = await Promise.all([peut("perdiem.gerer"), listerAttributions(org), aujourdhuiPour(org)]);
  const choix = gerer ? await choixAttribution(org) : null;
  const bilan = bilanPerdiem(tout);
  const liste = statut ? tout.filter((a) => a.statut === statut) : tout;

  return (
    <>
      <EnTetePage
        titre="Perdiem"
        sousTitre="Indemnités journalières des collaborateurs en déplacement ou en mission"
        actions={choix && <AttributionPerdiem choix={choix} aujourdhui={aujourdhui} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <CarteIndicateur libelle="À payer" valeur={fmt(bilan.aPayer)} unite="F" ton={bilan.aPayer > 0 ? "alerte" : "valide"} precision={`${bilan.nombreAPayer} perdiem`} />
        <CarteIndicateur libelle="Payé" valeur={fmt(bilan.paye)} unite="F" ton="neutre" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {([[null, "Tous"], ...STATUTS.map((s) => [s, LIBELLE_STATUT[s]] as const)] as const).map(([valeur, libelle]) => (
          <Link
            key={libelle}
            href={valeur ? `/perdiem?statut=${valeur}` : "/perdiem"}
            aria-current={statut === valeur ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statut === valeur ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--filet)] bg-[var(--surface)] hover:bg-[var(--surface-creuse)]"}`}
          >
            {libelle}
          </Link>
        ))}
      </div>

      {liste.length === 0 ? (
        <EtatVide
          titre={tout.length === 0 ? "Aucun perdiem attribué" : "Aucun perdiem ici"}
          message={
            tout.length === 0
              ? "Un perdiem se calcule depuis le barème : un collaborateur, une ligne du barème, un nombre de jours. Commencez par fixer les montants dans « Barème »."
              : "Changez de filtre pour voir les autres."
          }
        />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Numéro</Th>
              <Th>Collaborateur</Th>
              <Th>Barème</Th>
              <Th aligne="droite">Jours</Th>
              <Th aligne="droite">Montant</Th>
              <Th>État</Th>
              {gerer && <Th aligne="droite">Gestes</Th>}
            </tr>
          </thead>
          <tbody>
            {liste.map((a) => (
              <tr key={a.id} className={a.statut === "annule" ? "opacity-60" : ""}>
                <Td chiffres>{a.numero}</Td>
                <Td fort>
                  {a.collaborateur}
                  {(a.mission || a.debut || a.motif) && (
                    <span className="block text-xs font-normal text-[var(--encre-faible)]">{[a.mission, a.debut ? `dès le ${fmtDateIso(a.debut)}` : null, a.motif].filter(Boolean).join(" · ")}</span>
                  )}
                </Td>
                <Td>
                  {a.baremeLibelle}
                  <span className="chiffres block text-xs text-[var(--encre-faible)]">{fmt(a.montantJournalier)} F / jour</span>
                </Td>
                <Td aligne="droite" chiffres>
                  {a.jours}
                </Td>
                <Td aligne="droite" chiffres fort>
                  {fmt(a.montantTotal)}
                </Td>
                <Td>
                  <Pastille ton={TON[a.statut]}>{LIBELLE_STATUT[a.statut]}</Pastille>
                  {a.statut === "paye" && a.payeLe && (
                    <span className="block text-xs text-[var(--encre-faible)]">
                      {fmtDateIso(a.payeLe)}
                      {a.moyen ? ` · ${MOYENS[a.moyen]}` : ""}
                      {a.reference ? ` · ${a.reference}` : ""}
                    </span>
                  )}
                  {a.statut === "annule" && a.motifAnnulation && <span className="block text-xs text-[var(--encre-faible)]">{a.motifAnnulation}</span>}
                </Td>
                {gerer && (
                  <Td aligne="droite">
                    {a.statut === "a_payer" && (
                      <span className="inline-flex flex-wrap items-center justify-end gap-3">
                        <PayerPerdiem id={a.id} numero={a.numero} montant={a.montantTotal} aujourdhui={aujourdhui} />
                        <AnnulerPerdiem id={a.id} />
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
