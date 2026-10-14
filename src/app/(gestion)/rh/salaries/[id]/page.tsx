import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  FormulaireEtatCivil,
  FormulairePiece,
  ListePieces,
  PhotoSalarie,
  SITUATIONS,
  type PieceAffichee,
} from "@/components/personnes/dossier";
import { Pastille } from "@/components/ui/primitives";
import { tracer } from "@/lib/audit";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { stockageConfigure } from "@/lib/stockage";
import { piecesDuSalarie, salarieDe } from "@/modules/personnes/dossier";
import { etatsPieces, piecesManquantes } from "@/modules/personnes/pieces";
import { LIENS_URGENCE, lienUrgenceConnu } from "@/modules/personnes/calcul";

export const metadata: Metadata = { title: "Fiche salarié" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTRAT: Record<string, string> = { cdi: "CDI", cdd: "CDD", stage: "Stage", essai: "Essai" };
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const date = (iso: string | null) => (iso ? JOUR.format(new Date(`${iso}T00:00:00Z`)) : "—");

/**
 * Fiche d'un salarié : contrat, état civil, photo et dossier de pièces.
 *
 * Le dossier ne se montre qu'avec `personnes.dossier.consulter`, et chaque
 * affichage du dossier se trace : savoir qui a lu le casier judiciaire d'un
 * salarié fait partie de ce qu'une entreprise doit pouvoir répondre.
 */
export default async function PageFicheSalarie({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const salarie = await salarieDe(session.organizationId, id);
  if (!salarie) notFound();

  const [consulter, gerer] = await Promise.all([peut("personnes.dossier.consulter"), peut("personnes.dossier.gerer")]);
  const voitLeDossier = consulter || gerer;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const pieces = voitLeDossier ? await piecesDuSalarie(session.organizationId, id) : [];
  const etats = etatsPieces(
    pieces.map((p) => ({ id: p.id, nature: p.nature, delivreeLe: p.delivreeLe, expireLe: p.expireLe, creeLe: p.createdAt })),
    aujourdhui,
  );
  const affichees: PieceAffichee[] = pieces.map((p) => ({
    id: p.id,
    nature: p.nature,
    numero: p.numero,
    organisme: p.organisme,
    precision: p.precision,
    delivreeLe: p.delivreeLe,
    expireLe: p.expireLe,
    nomFichier: p.nomFichier,
    notes: p.notes,
    etat: etats.get(p.id)?.etat ?? "sans_echeance",
    jours: etats.get(p.id)?.jours ?? null,
  }));
  const manque = piecesManquantes(new Set(pieces.map((p) => p.nature)), Boolean(salarie.photo));

  if (voitLeDossier) {
    await tracer({ action: "salarie.dossier.consulter", entite: "employe", entiteId: id, apres: { salarie: salarie.nom } });
  }

  const etatCivil = {
    dateNaissance: salarie.dateNaissance,
    lieuNaissance: salarie.lieuNaissance,
    nationalite: salarie.nationalite,
    sexe: salarie.sexe,
    situationFamiliale: salarie.situationFamiliale,
    enfantsACharge: salarie.enfantsACharge,
    contactUrgence: salarie.contactUrgence,
    contactUrgenceLien: salarie.contactUrgenceLien,
    contactUrgenceTelephone: salarie.contactUrgenceTelephone,
    telephone: salarie.telephone,
    email: salarie.email,
    adresse: salarie.adresse,
    numeroCnps: salarie.numeroCnps,
  };

  return (
    <>
      <Link href="/rh" className="mb-3 inline-block text-sm text-[var(--encre-douce)] hover:underline">
        ← Salariés
      </Link>

      <header className="mb-6 flex flex-wrap items-center gap-5 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
        <PhotoSalarie employeeId={id} photo={salarie.photo} nom={salarie.nom} peutGerer={gerer} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">{salarie.nom}</h1>
          <p className="mt-0.5 text-sm text-[var(--encre-douce)]">
            <span className="chiffres">{salarie.matricule}</span> · {salarie.poste}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Pastille ton={salarie.actif ? "valide" : "neutre"}>{salarie.actif ? "En poste" : "Sorti des effectifs"}</Pastille>
            <Pastille ton="marque">{CONTRAT[salarie.contrat]}</Pastille>
            <span className="text-[var(--encre-douce)]">
              Depuis le {date(salarie.debut)}
              {salarie.fin ? ` · jusqu'au ${date(salarie.fin)}` : ""}
            </span>
            <span className="chiffres text-[var(--encre-douce)]">· {fmt(salarie.salaireBase)} FCFA brut</span>
          </p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">État civil et coordonnées</h2>
        {gerer ? (
          <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
            <FormulaireEtatCivil employeeId={id} initial={etatCivil} />
          </div>
        ) : (
          <dl className="grid gap-3 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Date de naissance", date(etatCivil.dateNaissance)],
              ["Lieu de naissance", etatCivil.lieuNaissance],
              ["Nationalité", etatCivil.nationalite],
              ["Sexe", etatCivil.sexe === "F" ? "Femme" : etatCivil.sexe === "M" ? "Homme" : null],
              ["Situation familiale", etatCivil.situationFamiliale ? SITUATIONS[etatCivil.situationFamiliale] : null],
              ["Enfants à charge", etatCivil.enfantsACharge?.toString()],
              ["Téléphone", etatCivil.telephone],
              ["Adresse électronique", etatCivil.email],
              ["Numéro CNPS", etatCivil.numeroCnps],
              ["Adresse", etatCivil.adresse],
              ["Personne à prévenir", etatCivil.contactUrgence],
              ["Lien avec le salarié", etatCivil.contactUrgenceLien && lienUrgenceConnu(etatCivil.contactUrgenceLien) ? LIENS_URGENCE[etatCivil.contactUrgenceLien] : null],
              ["Téléphone de la personne à prévenir", etatCivil.contactUrgenceTelephone],
            ].map(([libelle, valeur]) => (
              <div key={libelle}>
                <dt className="text-xs text-[var(--encre-faible)]">{libelle}</dt>
                <dd>{valeur || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Dossier</h2>
            {voitLeDossier && (
              <p className="mt-0.5 text-xs text-[var(--encre-faible)]">
                Données sensibles : chaque consultation et chaque ouverture de fichier est inscrite au journal d&apos;activité.
              </p>
            )}
          </div>
          {gerer && <FormulairePiece employeeId={id} depotActif={stockageConfigure()} />}
        </div>

        {!voitLeDossier ? (
          <p className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-sm text-[var(--encre-douce)]">
            Votre rôle ne permet pas de consulter les dossiers du personnel. Le responsable de l&apos;entreprise peut vous accorder ce droit.
          </p>
        ) : (
          <>
            {manque.length > 0 && (
              <p className="mb-4 rounded-lg bg-alerte-50 px-3 py-2.5 text-sm text-alerte-600">
                À compléter : {manque.join(", ")}.
              </p>
            )}
            <ListePieces pieces={affichees} peutGerer={gerer} />
          </>
        )}
      </section>
    </>
  );
}
