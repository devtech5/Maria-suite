import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { FeuilleA4 } from "@/components/impression/feuille-a4";
import { fmt, fmtTauxBp } from "@/lib/format";
import type { IdentiteEntreprise } from "@/lib/identite";
import { finDeMois, libelleMois } from "@/modules/paie/calcul";
import type { bulletinDetail } from "@/modules/paie/requetes";
import { formatJours } from "@/modules/presences/calcul";

type Detail = NonNullable<Awaited<ReturnType<typeof bulletinDetail>>>;

/**
 * Le bulletin de paie sur une feuille A4, tel qu'il s'imprime : ce qu'on voit
 * dans l'application est exactement ce qui sort de l'imprimante.
 */
export function BulletinDocument({ detail, identite }: { detail: Detail; identite: IdentiteEntreprise }) {
  const { bulletin: b, periode } = detail;
  const bareme = periode.baremeApplique!;

  const absences: [string, number][] = (
    [
      ["Jours hors contrat (entrée ou sortie dans le mois)", b.joursHorsContrat],
      ["Congé sans solde", b.joursSansSolde],
      ["Absences non rémunérées", b.joursAbsenceSaisis],
    ] as [string, number][]
  ).filter(([, jours]) => jours > 0);
  const nonPayes = b.joursHorsContrat + b.joursSansSolde + b.joursAbsenceSaisis;
  const lignes: [string, string, number | null, number | null][] = [
    ["Salaire de base", b.joursMois ? formatJours(b.joursMois) : "", b.salaireBase, null],
    ...(b.retenueAbsence
      ? [[absences.length === 1 ? absences[0][0] : "Jours non payés", formatJours(nonPayes), null, b.retenueAbsence] as [string, string, null, number]]
      : []),
    ...(b.primesImposables ? [["Primes et heures supplémentaires", "", b.primesImposables, null] as [string, string, number, null]] : []),
    ...(b.rappel ? [[b.rappelLibelle ?? "Rappel de salaire", "", b.rappel > 0 ? b.rappel : null, b.rappel < 0 ? -b.rappel : null] as [string, string, number | null, number | null]] : []),
    ["Salaire brut", "", b.brut, null],
    ["CNPS retraite, part salariale", fmtTauxBp(bareme.cnpsRetraiteSalarieBp), null, b.cnpsSalarie],
    ["Impôt sur salaire", "", null, b.impot],
    ...(b.indemnitesNonImposables ? [["Indemnités non imposables", "", b.indemnitesNonImposables, null] as [string, string, number, null]] : []),
    ...(b.retenuesDiverses ? [["Retenues diverses (avances…)", "", null, b.retenuesDiverses] as [string, string, null, number]] : []),
  ];

  return (
    <FeuilleA4 pied={<PiedDocument identite={identite} />}>
      <EnTeteDocument identite={identite}>
        <p className="text-xl font-bold uppercase">Bulletin de paie</p>
        <p className="font-mono">{b.numero}</p>
        <p>Période : {libelleMois(periode.mois)}</p>
      </EnTeteDocument>
      <section className="mt-4 grid grid-cols-2 gap-4 rounded border border-black/20 p-3">
        <div>
          <p className="font-semibold">{b.nom}</p>
          <p>{b.poste}</p>
        </div>
        <div className="text-right">
          <p>Matricule : {b.matricule}</p>
          <p>N° CNPS : {b.numeroCnps ?? "non renseigné"}</p>
        </div>
      </section>
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="border-y border-black/40 text-left text-[9pt] uppercase">
            <th className="py-1.5">Rubrique</th>
            <th className="py-1.5 text-right">Taux</th>
            <th className="py-1.5 text-right">Gains</th>
            <th className="py-1.5 text-right">Retenues</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(([rubrique, t, gain, retenue]) => (
            <tr key={rubrique} className={`border-b border-black/10 ${rubrique === "Salaire brut" ? "font-semibold" : ""}`}>
              <td className="py-1.5">{rubrique}</td>
              <td className="py-1.5 text-right tabular-nums">{t}</td>
              <td className="py-1.5 text-right tabular-nums">{gain !== null ? fmt(gain) : ""}</td>
              <td className="py-1.5 text-right tabular-nums">{retenue !== null ? fmt(retenue) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 flex justify-between border-t-2 border-black pt-2 text-base font-bold tabular-nums">
        <span>Net à payer</span>
        <span>{fmt(b.net)} FCFA</span>
      </p>
      {(b.congesPris > 0 || b.soldeConges !== null || absences.length > 1) && (
        <section className="mt-4 rounded border border-black/20 p-2 text-[9pt]">
          {absences.length > 1 && <p>Jours non payés : {absences.map(([libelle, jours]) => `${libelle.toLowerCase()} ${formatJours(jours)}`).join(" · ")}.</p>}
          {(b.congesPris > 0 || b.soldeConges !== null) && (
            <p>
              Congés payés —{" "}
              {[
                b.congesPris > 0 ? `pris ce mois : ${formatJours(b.congesPris)}` : null,
                b.soldeConges !== null ? `solde au ${new Date(`${finDeMois(periode.mois)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })} : ${formatJours(b.soldeConges)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </section>
      )}
      <section className="mt-6 text-[9pt] text-black/70">
        <p className="font-semibold uppercase">Charges patronales</p>
        <p className="tabular-nums">
          CNPS retraite {fmt(b.cnpsPatronal)} · Prestations familiales {fmt(b.prestationsFamiliales)} · Accident du travail {fmt(b.accidentTravail)} · Coût total employeur {fmt(b.coutTotal)} FCFA
        </p>
        {b.payeLe && <p className="mt-2">Payé le {new Date(`${String(b.payeLe).slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}.</p>}
        <p className="mt-6">Dans votre intérêt et pour vous aider à faire valoir vos droits, conservez ce bulletin sans limitation de durée.</p>
      </section>
    </FeuilleA4>
  );
}
