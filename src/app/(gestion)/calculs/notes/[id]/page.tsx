import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnnulerNote, SuitesNote } from "@/components/calculs/suites-note";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { EnTetePage, Pastille } from "@/components/ui/primitives";
import { peut } from "@/lib/droits/garde";
import { accesCalculs } from "@/modules/calculs/acces";
import { articlesPourCalculs, correspondancesDe, fournisseursPourCalculs, noteDe } from "@/modules/calculs/donnees";
import { TYPES_NOTE, lignesResultat, resumeSaisie } from "@/modules/calculs/notes";

export const metadata: Metadata = { title: "Note de calcul" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageNote({ params }: PageProps<"/calculs/notes/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const a = await accesCalculs();
  const d = await noteDe(a.session.organizationId, id);
  if (!d) notFound();
  const [peutDevis, peutCommande, articles, correspondances] = await Promise.all([
    peut("commercial.piece.gerer"),
    peut("achats.commande.gerer"),
    articlesPourCalculs(a.session.organizationId),
    correspondancesDe(a.session.organizationId),
  ]);
  const fournisseurs = peutCommande ? await fournisseursPourCalculs(a.session.organizationId) : [];
  const { note, calcul, reglages } = d;
  const active = note.annuleeLe === null;
  const lignes = lignesResultat(calcul, reglages);
  const date = note.createdAt.toLocaleDateString("fr-FR", { timeZone: "Africa/Abidjan", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <EnTetePage
        titre={`${note.numero} — ${note.libelle}`}
        sousTitre={`${TYPES_NOTE[calcul.type]} · projet ${d.projet.code} — ${d.projet.nom} · ${date}${d.auteur ? ` · ${d.auteur}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <BoutonImprimer />
            {active && (a.regler || note.creeParUserId === a.session.userId) && <AnnulerNote noteId={note.id} />}
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {!active && <Pastille ton="danger">Annulée : {note.motifAnnulation}</Pastille>}
        {note.reglagesVerifies ? <Pastille ton="valide">Ratios attestés au calcul</Pastille> : <Pastille ton="alerte">Ratios à vérifier au moment du calcul</Pastille>}
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="min-w-0 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold">Calcul</h2>
          <p className="mt-1 text-sm text-[var(--encre-douce)]">{resumeSaisie(calcul)}</p>
          <dl className="mt-3 divide-y divide-[var(--filet)]">
            {lignes.map((l) => (
              <div key={l.libelle} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-sm text-[var(--encre-douce)]">
                  {l.libelle}
                  {l.precision && <span className="block text-xs text-[var(--encre-faible)]">{l.precision}</span>}
                </dt>
                <dd className={`chiffres shrink-0 whitespace-nowrap text-right ${l.fort ? "text-base font-bold" : "text-sm font-medium"}`}>{l.valeur}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="min-w-0 space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold">Matériaux à acheter</h2>
          <SuitesNote
            noteId={note.id}
            materiaux={d.materiaux}
            articles={articles}
            correspondances={correspondances}
            fournisseurs={fournisseurs}
            peutDevis={peutDevis}
            peutCommande={peutCommande}
            clientNom={d.projet.clientNom}
            active={active}
          />
          {d.suites.length > 0 && (
            <div className="border-t border-[var(--filet)] pt-3">
              <h3 className="text-sm font-semibold">Pièces tirées de la note</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {d.suites.map((s) => (
                  <li key={s.id}>
                    {s.nature === "commande" ? (
                      <Link href={`/achats/commandes/${s.pieceId}`} className="text-marque-600 hover:underline">
                        Commande {s.libelle}
                      </Link>
                    ) : (
                      <Link href={`/commercial/factures?q=${encodeURIComponent(note.numero)}`} className="text-marque-600 hover:underline">
                        {s.libelle}
                      </Link>
                    )}{" "}
                    <span className="text-xs text-[var(--encre-faible)]">· {s.creeLe.toLocaleDateString("fr-FR", { timeZone: "Africa/Abidjan" })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
