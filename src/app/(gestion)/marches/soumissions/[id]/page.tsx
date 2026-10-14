import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AjoutPieceDossier, BoutonGeste, PieceDossier } from "@/components/marches/elements";
import { SuitesMarche } from "@/components/marches/suites";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, CarteIndicateur, Champ, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact } from "@/lib/format";
import { changerStatutSoumission, modifierSoumission } from "@/modules/marches/actions";
import { STATUTS_SOUMISSION, SUITES_SOUMISSION, TYPES_MARCHE, joursRestants } from "@/modules/marches/calcul";
import { soumissionDe } from "@/modules/marches/creation";
import { suitesDe } from "@/modules/marches/suites";

export const metadata: Metadata = { title: "Appel d'offres" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Abidjan" });

/** Valeur d'un champ datetime-local, en heure d'Abidjan (UTC). */
function versChamp(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16) : "";
}

export default async function PageSoumission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const s = await soumissionDe(session.organizationId, id);
  if (!s) notFound();
  const [gerer, gererProjet, gererPieces, execution] = await Promise.all([
    peut("marches.soumission.gerer"),
    peut("projet.gerer"),
    peut("commercial.piece.gerer"),
    suitesDe(session.organizationId, s),
  ]);
  const j = s.dateLimite ? joursRestants(s.dateLimite, new Date()) : null;
  const ouverte = s.statut === "veille" || s.statut === "en_preparation";
  const suites = SUITES_SOUMISSION[s.statut];

  return (
    <>
      <Link href="/marches" className="mb-3 inline-block text-sm text-[var(--encre-douce)] hover:underline">
        ← Appels d&apos;offres
      </Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{s.intitule}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--encre-douce)]">
            <span className="chiffres">{s.numero}</span>
            <span>· {s.autorite}</span>
            <span>· {TYPES_MARCHE[s.type]}</span>
            {s.reference && <span>· {s.reference}</span>}
            <Pastille ton={s.statut === "gagnee" ? "valide" : s.statut === "perdue" ? "danger" : "marque"}>{STATUTS_SOUMISSION[s.statut]}</Pastille>
          </p>
          {s.motifResultat && <p className="mt-1 text-sm text-[var(--encre-douce)]">Motif : {s.motifResultat}</p>}
        </div>
        {gerer && suites.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suites.includes("en_preparation") && <BoutonGeste libelle="Préparer" ton="principal" action={changerStatutSoumission.bind(null, s.id, "en_preparation")} />}
            {suites.includes("deposee") && (
              <BoutonGeste
                libelle="Déposée"
                ton="principal"
                confirmation={s.manquantes > 0 ? `${s.manquantes} pièce(s) manquent encore. Déclarer quand même le dossier déposé ?` : "Déclarer le dossier déposé ?"}
                action={changerStatutSoumission.bind(null, s.id, "deposee", undefined, s.manquantes > 0)}
              />
            )}
            {suites.includes("gagnee") && <BoutonGeste libelle="Gagnée" ton="principal" confirmation="Marché attribué à l'entreprise ?" action={changerStatutSoumission.bind(null, s.id, "gagnee", undefined, false)} />}
            {suites.includes("perdue") && <BoutonGeste libelle="Perdue" motif="Pourquoi ? (prix, dossier, technique…)" action={changerStatutSoumission.bind(null, s.id, "perdue")} />}
            {suites.includes("abandonnee") && <BoutonGeste libelle="Abandonner" ton="danger" motif="Raison de l'abandon ?" action={changerStatutSoumission.bind(null, s.id, "abandonnee")} />}
          </div>
        )}
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur
          libelle="Date limite"
          valeur={j === null ? "—" : ouverte ? (j < 0 ? "Dépassée" : `${j} j`) : "—"}
          ton={ouverte && j !== null && j <= 7 ? "danger" : undefined}
          precision={s.dateLimite ? HEURE.format(s.dateLimite) : "Non renseignée"}
        />
        <CarteIndicateur libelle="Dossier" valeur={`${s.pieces - s.manquantes} / ${s.pieces}`} ton={s.manquantes > 0 ? "alerte" : "valide"} precision={s.manquantes > 0 ? `${s.manquantes} pièce(s) à réunir` : "Toutes les pièces sont là"} />
        <CarteIndicateur libelle="Offre" valeur={s.montantPropose !== null ? fmtCompact(s.montantPropose) : "—"} unite="FCFA" precision={s.budgetEstime ? `Budget estimé ${fmt(s.budgetEstime)} F` : "Budget inconnu"} />
        <CarteIndicateur libelle="Caution" valeur={s.caution ? fmtCompact(s.caution) : "—"} unite="FCFA" precision={s.caution ? (s.cautionRestituee ? "Restituée" : "Immobilisée") : "Aucune"} />
      </section>

      {s.statut === "gagnee" && (
        <SuitesMarche nature="soumission" id={s.id} projet={execution.projet} devis={execution.devis} peutProjet={gerer && gererProjet} peutDevis={gerer && gererPieces} />
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Dossier de soumission</h2>
        <ul className="divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {s.dossier.map((p) => (
            <PieceDossier key={p.id} id={p.id} libelle={p.libelle} fournie={p.fournie} fichier={p.nomFichier} peutGerer={gerer && (ouverte || s.statut === "deposee")} />
          ))}
          {gerer && ouverte && <AjoutPieceDossier soumissionId={s.id} />}
        </ul>
      </section>

      {gerer && (
        <section>
          <FormulaireRepliable libelle="Modifier l'offre et les dates" titre="Offre et caution" action={modifierSoumission.bind(null, s.id)}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Champ libelle="Montant de l'offre HT (FCFA)">
                <input name="montantPropose" inputMode="numeric" defaultValue={s.montantPropose ?? ""} className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <Champ libelle="Date limite de dépôt">
                <input name="dateLimite" type="datetime-local" defaultValue={versChamp(s.dateLimite)} className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <Champ libelle="Caution (FCFA)">
                <input name="caution" inputMode="numeric" defaultValue={s.caution ?? ""} className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <Champ libelle="Lots">
                <input name="lots" defaultValue={s.lots ?? ""} className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Remarques">
                <input name="notes" defaultValue={s.notes ?? ""} className={CLASSE_CHAMP} />
              </Champ>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="cautionRestituee" defaultChecked={s.cautionRestituee} className="size-4" />
                Caution restituée
              </label>
            </div>
          </FormulaireRepliable>
        </section>
      )}
    </>
  );
}
