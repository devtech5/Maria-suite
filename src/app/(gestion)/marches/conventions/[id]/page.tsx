import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonFichier, BoutonGeste } from "@/components/marches/elements";
import { SuitesMarche } from "@/components/marches/suites";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, CarteIndicateur, Champ, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact } from "@/lib/format";
import { ajouterAvenant, joindreConvention, resilierConvention } from "@/modules/marches/actions";
import { ETATS_CONVENTION } from "@/modules/marches/calcul";
import { listerConventions } from "@/modules/marches/creation";
import { suitesDe } from "@/modules/marches/suites";

export const metadata: Metadata = { title: "Convention" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Une convention : sa période effective, ses avenants, son document, sa résiliation. */
export default async function PageConvention({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const c = (await listerConventions(session.organizationId)).find((x) => x.id === id);
  if (!c) notFound();
  const [gerer, gererProjet, gererPieces, suites] = await Promise.all([
    peut("marches.convention.gerer"),
    peut("projet.gerer"),
    peut("commercial.piece.gerer"),
    suitesDe(session.organizationId, c),
  ]);
  // Une convention fournisseur n'ouvre ni projet client ni devis ; une convention résiliée, plus rien.
  const executable = !c.resilieeLe && c.sens !== "fournisseur";
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link href="/marches/conventions" className="mb-3 inline-block text-sm text-[var(--encre-douce)] hover:underline">
        ← Conventions
      </Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{c.intitule}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--encre-douce)]">
            <span className="chiffres">{c.numero}</span>
            <span>· {c.partenaire}</span>
            <Pastille ton={c.etat === "en_vigueur" ? "valide" : c.etat === "a_renouveler" ? "alerte" : c.etat === "expiree" ? "danger" : "neutre"}>{ETATS_CONVENTION[c.etat]}</Pastille>
          </p>
          {c.objet && <p className="mt-1 text-sm">{c.objet}</p>}
          {c.motifResiliation && <p className="mt-1 text-sm text-[var(--encre-douce)]">Résiliée le {date(c.resilieeLe)} : {c.motifResiliation}</p>}
          <p className="mt-2">{c.nomFichier ? <BoutonFichier nature="convention" id={c.id} nom={c.nomFichier} /> : <span className="text-xs text-[var(--encre-faible)]">Document signé non joint</span>}</p>
        </div>
        {gerer && !c.resilieeLe && (
          <div className="flex flex-wrap gap-2">
            <BoutonGeste libelle="Résilier" ton="danger" motif="Motif de la résiliation ?" action={resilierConvention.bind(null, c.id, aujourdhui)} />
          </div>
        )}
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Début" valeur={date(c.debut)} precision={c.reconductionTacite ? "Reconduction tacite" : "Sans reconduction"} />
        <CarteIndicateur libelle="Fin effective" valeur={c.finEffective ? date(c.finEffective) : "Indéterminée"} ton={c.etat === "a_renouveler" ? "alerte" : c.etat === "expiree" ? "danger" : undefined} precision={c.jours !== null && c.etat !== "a_venir" ? (c.jours >= 0 ? `Dans ${c.jours} jours` : `Depuis ${-c.jours} jours`) : "—"} />
        <CarteIndicateur libelle="Préavis" valeur={`${c.preavisJours} j`} precision="Pour dénoncer ou renégocier" />
        <CarteIndicateur libelle="Montant" valeur={c.montantEffectif !== null ? fmtCompact(c.montantEffectif) : "—"} unite="FCFA" precision={c.montant !== c.montantEffectif ? `Initial ${fmt(c.montant ?? 0)} F` : "Annuel ou plafond"} />
      </section>

      {(executable || suites.projet || suites.devis) && (
        <SuitesMarche
          nature="convention"
          id={c.id}
          projet={suites.projet}
          devis={suites.devis}
          peutProjet={executable && gerer && gererProjet}
          peutDevis={executable && c.sens === "client" && gerer && gererPieces}
        />
      )}

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Avenants</h2>
          {gerer && !c.resilieeLe && (
            <FormulaireRepliable libelle="Ajouter un avenant" titre="Avenant" action={ajouterAvenant.bind(null, c.id)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ libelle="Objet">
                  <input name="objet" required placeholder="Prolongation d'un an, révision du prix" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Signé le">
                  <input name="signeLe" type="date" required defaultValue={aujourdhui} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Nouvelle fin (facultatif)">
                  <input name="nouvelleFin" type="date" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Nouveau montant (facultatif)">
                  <input name="nouveauMontant" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Document signé">
                  <input name="fichier" type="file" accept="application/pdf,image/*,.doc,.docx" className="block w-full text-sm" />
                </Champ>
              </div>
            </FormulaireRepliable>
          )}
        </div>
        {c.avenants.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucun avenant.</p>
        ) : (
          <ul className="divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
            {c.avenants.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">Avenant n° {a.rang}</span> — {a.objet}
                  <span className="block text-xs text-[var(--encre-douce)]">
                    Signé le {date(a.signeLe)}
                    {a.nouvelleFin && ` · fin portée au ${date(a.nouvelleFin)}`}
                    {a.nouveauMontant !== null && ` · montant ${fmt(a.nouveauMontant)} F`}
                  </span>
                </span>
                {a.nomFichier && <BoutonFichier nature="avenant" id={a.id} nom={a.nomFichier} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gerer && (
        <section>
          <FormulaireRepliable libelle={c.nomFichier ? "Remplacer le document" : "Joindre le document signé"} titre="Document de la convention" action={joindreConvention.bind(null, c.id)}>
            <input name="fichier" type="file" required accept="application/pdf,image/*,.doc,.docx" className="block w-full text-sm" />
          </FormulaireRepliable>
        </section>
      )}
    </>
  );
}
