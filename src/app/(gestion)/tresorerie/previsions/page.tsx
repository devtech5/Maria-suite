import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import type { Flux } from "@/modules/tresorerie/calcul";
import { planDeTresorerie } from "@/modules/tresorerie/requetes";

export const metadata: Metadata = { title: "Plan de trésorerie" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const JOUR_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const date = (iso: string, f = JOUR) => f.format(new Date(`${iso}T00:00:00Z`));

const ORIGINE: Record<Flux["origine"], { libelle: string; ton: TonPastille }> = {
  facture: { libelle: "Facture client", ton: "valide" },
  depense: { libelle: "Dépense approuvée", ton: "alerte" },
  bon: { libelle: "Bon de caisse", ton: "alerte" },
  intervenant: { libelle: "Dû à un intervenant", ton: "alerte" },
  avance: { libelle: "Avance", ton: "neutre" },
  fournisseur: { libelle: "Facture fournisseur", ton: "danger" },
  paie: { libelle: "Paie", ton: "alerte" },
  tva: { libelle: "TVA", ton: "alerte" },
  impot: { libelle: "Impôt sur les bénéfices", ton: "alerte" },
  commission: { libelle: "Commission", ton: "alerte" },
  recurrente: { libelle: "Charge récurrente", ton: "alerte" },
};

/**
 * Plan de trésorerie sur treize semaines.
 *
 * Il ne prédit rien : il additionne ce qui est déjà décidé — factures émises,
 * dépenses approuvées, bons approuvés, sommes dues. Ce qui n'est pas encore
 * saisi n'y est pas, et l'écran le dit.
 */
export default async function PagePrevisions() {
  const session = await exigerEntreprise();
  if (!(await peut("tresorerie.consulter"))) redirect("/tresorerie/caisse");

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const plan = await planDeTresorerie(session.organizationId, aujourdhui);
  const entrees = plan.flux.filter((f) => f.montant > 0).reduce((s, f) => s + f.montant, 0);
  const sorties = plan.flux.filter((f) => f.montant < 0).reduce((s, f) => s - f.montant, 0);
  const fin = plan.semaines[plan.semaines.length - 1]?.soldeFin ?? plan.disponible;
  const enRetard = plan.flux.filter((f) => f.date < aujourdhui && f.montant > 0);

  return (
    <>
      <EnTetePage titre="Plan de trésorerie" sousTitre="Le disponible d'aujourd'hui, et ce qui doit entrer et sortir sur treize semaines" />

      {plan.comptes === 0 ? (
        <EtatVide titre="Aucun compte déclaré" message="Le plan part du solde de vos comptes de trésorerie. Déclarez-les, ou reprenez ceux de la comptabilité, dans l'onglet Comptes." />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <CarteIndicateur libelle="Disponible aujourd'hui" valeur={fmt(plan.disponible)} unite="FCFA" ton={plan.disponible < 0 ? "danger" : "marque"} precision="Comptes en service, virements en route compris" />
            <CarteIndicateur libelle="Entrées attendues" valeur={fmt(entrees)} unite="FCFA" ton="valide" precision={enRetard.length ? `Dont ${fmt(enRetard.reduce((s, f) => s + f.montant, 0))} F de factures échues` : "Factures émises non soldées"} />
            <CarteIndicateur libelle="Sorties prévues" valeur={fmt(sorties)} unite="FCFA" ton={sorties > 0 ? "alerte" : "neutre"} precision="Paie, TVA, fournisseurs, dépenses, bons, intervenants" />
            <CarteIndicateur libelle="Dans 13 semaines" valeur={fmt(fin)} unite="FCFA" ton={fin < 0 ? "danger" : "valide"} precision={plan.horsHorizon ? `${plan.horsHorizon} flux au-delà, non comptés` : "Si tout se passe comme prévu"} />
          </section>

          <p
            role="status"
            className={`mb-5 rounded-xl border-l-4 px-4 py-3 text-sm ${
              plan.premierDecouvert ? "border-danger-500 bg-danger-50 text-danger-600" : "border-valide-500 bg-valide-50 text-valide-600"
            }`}
          >
            {plan.premierDecouvert ? (
              <>
                <strong className="font-semibold">Découvert prévu le {date(plan.premierDecouvert, JOUR_LONG)}.</strong> Relancez les factures échues,
                étalez une dépense ou alimentez le compte avant cette date.
              </>
            ) : (
              <strong className="font-semibold">Aucun découvert prévu sur treize semaines.</strong>
            )}
          </p>

          <section className="mb-6">
            <h2 className="mb-2 text-base font-semibold">Semaine par semaine</h2>
            <Tableau>
              <thead>
                <tr>
                  <Th>Semaine</Th>
                  <Th aligne="droite">Entrées</Th>
                  <Th aligne="droite">Sorties</Th>
                  <Th aligne="droite">Solde en fin de semaine</Th>
                </tr>
              </thead>
              <tbody>
                {plan.semaines.map((s, i) => (
                  <tr key={s.debut}>
                    <Td chiffres>
                      {i === 0 ? "Cette semaine" : `Du ${date(s.debut)} au ${date(s.fin)}`}
                      {i === 0 && <span className="block text-xs text-[var(--encre-faible)]">retards compris</span>}
                    </Td>
                    <Td aligne="droite" chiffres>
                      <span className={s.entrees ? "text-valide-600" : "text-[var(--encre-faible)]"}>{s.entrees ? `+ ${fmt(s.entrees)}` : "—"}</span>
                    </Td>
                    <Td aligne="droite" chiffres>
                      <span className={s.sorties ? "text-danger-600" : "text-[var(--encre-faible)]"}>{s.sorties ? `− ${fmt(s.sorties)}` : "—"}</span>
                    </Td>
                    <Td aligne="droite" chiffres fort>
                      <span className={s.soldeFin < 0 ? "text-danger-600" : ""}>{fmt(s.soldeFin)}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          </section>

          {plan.flux.length > 0 && (
            <section>
              <h2 className="mb-2 text-base font-semibold">Ce qui est attendu</h2>
              <Tableau>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Nature</Th>
                    <Th>Détail</Th>
                    <Th aligne="droite">Montant</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...plan.flux]
                    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
                    .slice(0, 100)
                    .map((f, i) => (
                      <tr key={i}>
                        <Td chiffres>
                          {date(f.date)}
                          {f.date < aujourdhui && <span className="block text-xs text-danger-600">en retard</span>}
                        </Td>
                        <Td>
                          <Pastille ton={ORIGINE[f.origine].ton}>{ORIGINE[f.origine].libelle}</Pastille>
                        </Td>
                        <Td>
                          <span className="block max-w-[360px] truncate">{f.libelle}</span>
                        </Td>
                        <Td aligne="droite" chiffres fort>
                          <span className={f.montant > 0 ? "text-valide-600" : "text-danger-600"}>
                            {f.montant > 0 ? "+" : "−"} {fmt(Math.abs(f.montant))}
                          </span>
                        </Td>
                      </tr>
                    ))}
                </tbody>
              </Tableau>
            </section>
          )}

          <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
            Le plan additionne ce qui est déjà décidé : factures émises, dépenses et bons approuvés, sommes dues aux
            intervenants. Les ventes au comptoir à venir, les salaires non saisis et les dépenses pas encore demandées
            n&apos;y figurent pas.
          </p>
        </>
      )}
    </>
  );
}
