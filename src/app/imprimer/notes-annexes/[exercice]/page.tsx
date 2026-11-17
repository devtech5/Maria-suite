import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnTeteDocument } from "@/components/impression/entete-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { exigerEntreprise } from "@/lib/auth/dal";
import { calculerNotesAnnexes, dansLOrdre, type Format, type NoteAnnexe } from "@/lib/comptabilite/notes";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtTauxBp } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";
import { notesComplementaires } from "@/modules/comptabilite/notes-donnees";
import { donneesNotes } from "@/modules/comptabilite/requetes";

export const metadata: Metadata = { title: "Notes annexes" };

/** Notes de la liasse que la comptabilité ne produit pas seule : à établir par le comptable. */
const A_ETABLIR = [
  "1 — Dettes garanties par des sûretés réelles",
  "2 — Informations obligatoires (méthodes et dérogations)",
  "3B — Biens pris en location-acquisition",
  "3E — Réévaluations",
  "3F — Étalement des charges immobilisées",
  "15B — Autres fonds propres",
  "16B, 16C — Engagements de retraite, actifs et passifs éventuels",
  "32, 33 — Production de l'exercice, achats destinés à la production",
  "35 — Informations sociales, environnementales et sociétales",
];

function cellule(v: number | null, format: Format): string {
  if (v === null) return "—";
  if (format === "taux") return fmtTauxBp(v);
  return v === 0 ? "—" : v < 0 ? `(${fmt(-v)})` : fmt(v);
}

function Note({ note }: { note: NoteAnnexe }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="text-[10pt] font-bold uppercase">
        Note {note.numero} — {note.titre}
      </h2>
      {note.vide ? (
        <p className="mt-1">Néant.</p>
      ) : (
        <table className="mt-1.5 w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-y border-black/40 text-left text-[8pt] uppercase">
              <th className="w-14 py-1">Compte</th>
              <th className="py-1">Libellé</th>
              {note.colonnes.map((c) => (
                <th key={c.titre} className="py-1 pl-2 text-right">
                  {c.titre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {note.lignes.map((l, i) => (
              <tr
                key={`${l.compte ?? l.libelle}-${i}`}
                className={l.niveau === "total" ? "border-t-2 border-black font-bold" : l.niveau === "rubrique" ? "border-b border-black/20 font-semibold" : "border-b border-black/10"}
              >
                <td className="py-0.5 text-[8pt]">{l.compte}</td>
                <td className={`py-0.5 ${l.niveau === "detail" && l.compte ? "pl-2" : ""}`} colSpan={l.valeurs.length === 0 ? note.colonnes.length + 1 : undefined}>
                  {l.libelle}
                </td>
                {l.valeurs.map((v, j) => (
                  <td key={j} className="py-0.5 pl-2 text-right">
                    {cellule(v, note.colonnes[j].format === "taux" ? "taux" : (l.format ?? "montant"))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note.remarques && note.remarques.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-[8pt] italic">
          {note.remarques.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Notes annexes que la comptabilité établit seule : chaque poste du bilan et
 * du compte de résultat détaillé compte par compte, les mouvements des
 * immobilisations et des dépréciations, la fiche de synthèse. À reporter sur
 * la liasse officielle avec les notes que le comptable rédige.
 */
export default async function ImpressionNotesAnnexes({ params }: { params: Promise<{ exercice: string }> }) {
  const { exercice } = await params;
  if (!/^\d{4}$/.test(exercice)) notFound();
  const session = await exigerEntreprise();
  if (!(await peut("comptabilite.ecriture.consulter"))) notFound();
  const org = session.organizationId;

  const [identite, donnees, complementaires] = await Promise.all([identiteEntreprise(org), donneesNotes(org, exercice), notesComplementaires(org, exercice)]);
  if (donnees.bilanN.length === 0 && donnees.mouvementsN.length === 0) notFound();
  const notes = dansLOrdre([...calculerNotesAnnexes(donnees, exercice), ...complementaires]);

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <BoutonImprimer />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[12mm] py-[12mm] text-[8.5pt] leading-snug text-black shadow print:shadow-none">
        <EnTeteDocument identite={identite}>
          <p className="text-lg font-bold uppercase">Notes annexes</p>
          <p>Exercice du 01/01/{exercice} au 31/12/{exercice} — SYSCOHADA révisé</p>
          <p>Notes établies depuis la comptabilité, comparées à l&apos;exercice {Number(exercice) - 1}</p>
        </EnTeteDocument>

        {notes.map((n) => (
          <Note key={n.numero} note={n} />
        ))}

        <section className="mt-6 break-inside-avoid">
          <h2 className="text-[10pt] font-bold uppercase">Notes à établir par le comptable</h2>
          <p className="mt-1">Elles demandent des informations que les écritures ne portent pas :</p>
          <ul className="mt-1 list-disc pl-5">
            {A_ETABLIR.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-[8pt] text-black/70">
          Montants en francs CFA, soldes cumulés au 31 décembre. Entre parenthèses, les montants qui viennent en déduction. Chaque note retombe sur le poste
          du bilan ou du compte de résultat qu&apos;elle détaille : reportez-les sur le formulaire en vigueur de la DGI.
        </p>
      </article>
    </main>
  );
}
