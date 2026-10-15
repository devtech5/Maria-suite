import type { Metadata } from "next";
import Link from "next/link";

import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { echeanceDeclarations, libelleMois, moisCourant, moisValide } from "@/modules/paie/calcul";
import { baremeDe } from "@/modules/paie/creation";
import { listerPeriodes, periodeDetail } from "@/modules/paie/requetes";
import { listerComptes } from "@/modules/tresorerie/requetes";

import { ActionsPeriode, PreparerMois } from "./actions-periode";
import { TableBulletins } from "./bulletins";

export const metadata: Metadata = { title: "Paie" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const date = (iso: string) => JOUR.format(new Date(`${iso}T00:00:00Z`));

/**
 * Paie du mois : préparer, saisir les éléments variables, valider (bulletins
 * numérotés et écriture de paie), payer les nets, verser la CNPS et l'impôt.
 */
export default async function PagePaie({ searchParams }: PageProps<"/rh/paie">) {
  const session = await exigerEntreprise();
  const [preparer, valider, payer] = await Promise.all([peut("personnes.paie.preparer"), peut("personnes.paie.valider"), peut("personnes.paie.payer")]);
  const { mois: demande } = await searchParams;
  const [periodes, bareme] = await Promise.all([listerPeriodes(session.organizationId), baremeDe(session.organizationId)]);
  const mois = typeof demande === "string" && moisValide(demande) ? demande : (periodes[0]?.mois ?? moisCourant());
  const [detail, comptes] = await Promise.all([periodeDetail(session.organizationId, mois), payer ? listerComptes(session.organizationId) : Promise.resolve([])]);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const bulletins = detail?.bulletins ?? [];
  const validee = detail?.periode.statut === "validee";
  const somme = (f: (b: (typeof bulletins)[number]) => number) => bulletins.reduce((s, b) => s + f(b), 0);
  const nonPayes = bulletins.filter((b) => !b.payeLe && b.net > 0);

  return (
    <>
      <EnTetePage
        titre={`Paie de ${libelleMois(mois)}`}
        sousTitre={!detail ? "Pas encore préparée" : validee ? `Validée — écriture ${detail.periode.ecriture}` : "En préparation : les bulletins se recalculent jusqu'à la validation"}
        actions={
          <>
            <Link href="/rh/paie/bareme" className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]">
              Barème
            </Link>
            {preparer && <PreparerMois moisCourant={moisCourant()} mois={mois} dejaValidee={validee} />}
          </>
        }
      />

      <p
        className={`mb-5 rounded-xl border-l-4 px-4 py-3 text-sm ${
          bareme.verifie ? "border-valide-500 bg-valide-50 text-valide-600" : "border-alerte-500 bg-alerte-50 text-alerte-600"
        }`}
      >
        {bareme.verifie ? (
          <>
            <strong className="font-semibold">Barème attesté vérifié</strong> le {bareme.verifieLe ? JOUR.format(bareme.verifieLe) : "—"}. Toute modification des taux
            demandera une nouvelle attestation.
          </>
        ) : (
          <>
            <strong className="font-semibold">Barème non vérifié.</strong> Les taux CNPS et le barème de l&apos;impôt sur salaire sont ceux de la démonstration. Faites-les
            contrôler par votre comptable, corrigez-les dans <Link href="/rh/paie/bareme" className="font-semibold underline">Barème</Link> et attestez-les : la paie ne
            peut pas être validée avant.
          </>
        )}
      </p>

      {periodes.length > 0 && (
        <nav aria-label="Mois de paie" className="mb-4 flex gap-1.5 overflow-x-auto pb-0.5">
          {periodes.map((p) => (
            <Link
              key={p.id}
              href={`/rh/paie?mois=${p.mois}`}
              aria-current={p.mois === mois ? "page" : undefined}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
                p.mois === mois ? "bg-marque-600 text-white" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"
              }`}
            >
              {libelleMois(p.mois)} {p.statut === "validee" ? (p.payes === p.bulletins ? "✓" : "•") : "(brouillon)"}
            </Link>
          ))}
        </nav>
      )}

      {!detail ? (
        <EtatVide
          titre="Paie non préparée"
          message="Préparez la paie du mois : un bulletin par salarié sous contrat, calculé sur son salaire de base, moins les jours hors contrat et les congés sans solde accordés dans Présences. Vous ajouterez ensuite absences, primes, indemnités et retenues."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur libelle="Masse brute" valeur={fmt(somme((b) => b.brut))} unite="FCFA" precision={`${bulletins.length} bulletin${bulletins.length > 1 ? "s" : ""}`} />
            <CarteIndicateur libelle="Net à payer" valeur={fmt(somme((b) => b.net))} unite="FCFA" ton="valide" precision={validee ? `${fmt(nonPayes.reduce((s, b) => s + b.net, 0))} F restent à verser` : "Après validation"} />
            <CarteIndicateur
              libelle="CNPS"
              valeur={fmt(somme((b) => b.cnpsSalarie + b.cnpsPatronal + b.prestationsFamiliales + b.accidentTravail))}
              unite="FCFA"
              ton={validee && !detail.periode.cnpsVerseeLe ? "alerte" : "neutre"}
              precision={detail.periode.cnpsVerseeLe ? `Versée le ${date(detail.periode.cnpsVerseeLe)}` : `Parts salariale et patronale — avant le ${date(echeanceDeclarations(mois))}`}
            />
            <CarteIndicateur
              libelle="Impôt sur salaires"
              valeur={fmt(somme((b) => b.impot))}
              unite="FCFA"
              ton={validee && !detail.periode.impotVerseLe ? "alerte" : "neutre"}
              precision={detail.periode.impotVerseLe ? `Versé le ${date(detail.periode.impotVerseLe)}` : `Retenu à la source — avant le ${date(echeanceDeclarations(mois))}`}
            />
            <CarteIndicateur libelle="Coût employeur" valeur={fmt(somme((b) => b.coutTotal))} unite="FCFA" precision="Brut, indemnités et charges patronales" />
          </section>

          <ActionsPeriode
            periodeId={detail.periode.id}
            mois={mois}
            validee={validee}
            baremeVerifie={bareme.verifie}
            droits={{ valider, payer }}
            nonPayes={nonPayes.length}
            montantNonPaye={nonPayes.reduce((s, b) => s + b.net, 0)}
            cnps={{ montant: detail.periode.totalCnps, verse: Boolean(detail.periode.cnpsVerseeLe) }}
            impot={{ montant: detail.periode.totalImpot, verse: Boolean(detail.periode.impotVerseLe) }}
            comptes={comptes.filter((c) => c.actif).map((c) => ({ id: c.id, nom: c.nom, nature: c.nature, solde: c.solde }))}
            aujourdhui={aujourdhui}
          />

          <TableBulletins
            bulletins={bulletins.map((b) => ({
              id: b.id,
              numero: b.numero,
              matricule: b.matricule,
              nom: b.nom,
              poste: b.poste,
              numeroCnps: b.numeroCnps,
              salaireBase: b.salaireBase,
              joursMois: b.joursMois,
              joursHorsContrat: b.joursHorsContrat,
              joursSansSolde: b.joursSansSolde,
              joursAbsenceSaisis: b.joursAbsenceSaisis,
              retenueAbsence: b.retenueAbsence,
              primesImposables: b.primesImposables,
              rappel: b.rappel,
              rappelLibelle: b.rappelLibelle,
              indemnitesNonImposables: b.indemnitesNonImposables,
              retenuesDiverses: b.retenuesDiverses,
              brut: b.brut,
              cnpsSalarie: b.cnpsSalarie,
              impot: b.impot,
              net: b.net,
              payeLe: b.payeLe ? String(b.payeLe).slice(0, 10) : null,
            }))}
            modifiable={preparer && !validee}
          />
        </>
      )}
    </>
  );
}
