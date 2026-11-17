import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { NOTES_A_REDIGER } from "@/lib/comptabilite/notes-redigees";
import { peut } from "@/lib/droits/garde";
import { redactionsDe } from "@/modules/comptabilite/notes-redigees";
import { exercicesEcrits } from "@/modules/comptabilite/requetes";

import { RedactionNotes, ReprendrePrecedent, type NoteAffichee } from "./redaction";

export const metadata: Metadata = { title: "Notes annexes à rédiger" };

const dateHeure = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Les notes annexes que les écritures ne peuvent pas fournir : le comptable
 * les rédige ici, exercice par exercice, et elles s'impriment avec les notes
 * calculées dans « Notes annexes ».
 */
export default async function PageNotesARediger({ searchParams }: { searchParams: Promise<{ exercice?: string }> }) {
  const session = await exigerEntreprise();
  const exercices = await exercicesEcrits(session.organizationId);
  const demande = (await searchParams).exercice;
  const exercice = demande && /^\d{4}$/.test(demande) ? demande : (exercices[0] ?? String(new Date().getFullYear()));
  const [redactions, rediger] = await Promise.all([redactionsDe(session.organizationId, exercice), peut("comptabilite.exercice.cloturer")]);
  const parNumero = new Map(redactions.map((r) => [r.numero, r]));

  const notes: NoteAffichee[] = NOTES_A_REDIGER.map((n) => {
    const r = parNumero.get(n.numero);
    return {
      numero: n.numero,
      titre: n.titre,
      aide: n.aide,
      texte: r?.texte ?? "",
      neant: r?.neant ?? false,
      redigee: r !== undefined,
      modifiee: r ? dateHeure.format(new Date(r.modifieeLe)) : null,
    };
  });
  const restantes = notes.filter((n) => !n.redigee).length;

  return (
    <>
      <EnTetePage
        titre="Notes annexes à rédiger"
        sousTitre={`Exercice ${exercice} · ${restantes === 0 ? "toutes rédigées" : `${restantes} à rédiger sur ${notes.length}`}`}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {rediger && <ReprendrePrecedent exercice={exercice} />}
            <a
              href={`/imprimer/notes-annexes/${exercice}`}
              target="_blank"
              rel="noopener"
              className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]"
            >
              Imprimer les notes annexes
            </a>
          </div>
        }
      />

      {exercices.length > 1 && (
        <nav aria-label="Exercice" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
          {exercices.map((e) => (
            <Link
              key={e}
              href={`/comptabilite/etats/notes?exercice=${e}`}
              aria-current={e === exercice ? "page" : undefined}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${e === exercice ? "bg-marque-600 text-white" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"}`}
            >
              {e}
            </Link>
          ))}
        </nav>
      )}

      <p className="mb-4 text-sm text-[var(--encre-douce)]">
        Ce que les écritures ne disent pas : sûretés, méthodes, engagements, informations sociales. Rédigez chaque note, ou déclarez-la « néant » ; une note
        laissée vide est signalée « à rédiger » dans la liasse. {!rediger && "La rédaction demande le droit de clôturer l'exercice."}{" "}
        <Link href={`/comptabilite/etats?exercice=${exercice}`} className="font-semibold text-marque-600 hover:underline">
          Retour aux états financiers
        </Link>
      </p>

      <RedactionNotes exercice={exercice} notes={notes} rediger={rediger} />
    </>
  );
}
