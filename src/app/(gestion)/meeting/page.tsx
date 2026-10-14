import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireReunion } from "@/components/meeting/formulaire-reunion";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { LIBELLE_STATUT, rejoignable, type Statut } from "@/modules/meeting/calcul";
import { fuseauDe, listerReunions, membresInvitables, type ReunionListee } from "@/modules/meeting/requetes";
import { jourLocal } from "@/modules/presences/calcul";

export const metadata: Metadata = { title: "Meeting" };

const TON: Record<Statut, TonPastille> = { en_cours: "valide", planifiee: "marque", terminee: "neutre", annulee: "danger" };

function Ligne({ r, jour, heure }: { r: ReunionListee; jour: Intl.DateTimeFormat; heure: Intl.DateTimeFormat }) {
  const fin = new Date(r.debutPrevu.getTime() + r.dureeMinutes * 60_000);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <Link href={`/meeting/${r.id}`} className="min-w-0 flex-1 hover:underline">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="truncate">{r.titre}</span>
          <Pastille ton={TON[r.statut]}>{LIBELLE_STATUT[r.statut]}</Pastille>
        </p>
        <p className="mt-0.5 text-xs text-[var(--encre-faible)]">
          <span className="chiffres">{r.numero}</span> · {jour.format(r.debutPrevu)}, {heure.format(r.debutPrevu)}–{heure.format(fin)} · {r.organisateur} ·{" "}
          {r.invites} participant{r.invites > 1 ? "s" : ""}
          {r.statut === "en_cours" ? ` · ${r.presents} dans la salle` : ""}
        </p>
      </Link>
      {rejoignable(r.statut) && (
        <Link
          href={`/meeting/${r.id}/salle`}
          className={`h-cible inline-flex items-center rounded-lg px-3.5 text-sm font-semibold ${
            r.statut === "en_cours" ? "bg-valide-500 text-white hover:opacity-90" : "border border-[var(--filet)] hover:bg-[var(--surface-creuse)]"
          }`}
        >
          {r.statut === "en_cours" ? "Rejoindre" : "Entrer dans la salle"}
        </Link>
      )}
    </li>
  );
}

function Section({ titre, liste, jour, heure }: { titre: string; liste: ReunionListee[]; jour: Intl.DateTimeFormat; heure: Intl.DateTimeFormat }) {
  if (liste.length === 0) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-[var(--encre-douce)]">{titre}</h2>
      <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
        {liste.map((r) => (
          <Ligne key={r.id} r={r} jour={jour} heure={heure} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Meeting : les réunions où l'on est invité.
 *
 * En cours d'abord — on y entre d'un clic —, puis les prochaines, puis les
 * closes des trois derniers mois avec leur compte rendu.
 */
export default async function PageMeeting() {
  const session = await exigerEntreprise();
  const [organise, reunions, fuseau] = await Promise.all([
    peut("meeting.organiser"),
    listerReunions(session.organizationId, session.userId),
    fuseauDe(session.organizationId),
  ]);
  const membres = organise ? await membresInvitables(session.organizationId) : [];

  const maintenant = new Date();
  const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: fuseau });
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: fuseau });
  const aujourdhui = jourLocal(maintenant, fuseau);

  const enCours = reunions.filter((r) => r.statut === "en_cours");
  const aVenir = reunions.filter((r) => r.statut === "planifiee");
  const closes = reunions.filter((r) => r.statut === "terminee" || r.statut === "annulee");
  const aujourdhuiPrevues = aVenir.filter((r) => jourLocal(r.debutPrevu, fuseau) === aujourdhui).length;

  return (
    <>
      <EnTetePage
        titre="Meeting"
        sousTitre="Réunions d'équipe à distance : caméra, micro et partage d'écran"
        actions={organise ? <FormulaireReunion membres={membres} moi={session.userId} aujourdhui={aujourdhui} /> : undefined}
      />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
        <CarteIndicateur libelle="En cours" valeur={fmtEntier(enCours.length)} ton={enCours.length > 0 ? "valide" : undefined} />
        <CarteIndicateur libelle="Aujourd'hui" valeur={fmtEntier(aujourdhuiPrevues)} ton="marque" precision="Réunions encore à venir" />
        <CarteIndicateur libelle="Programmées" valeur={fmtEntier(aVenir.length)} precision="Toutes dates confondues" />
      </section>

      {reunions.length === 0 ? (
        <EtatVide
          titre="Aucune réunion"
          message={
            organise
              ? "Programmez une réunion pour l'équipe, ou ouvrez-en une sur-le-champ : les invités sont prévenus par la cloche et rejoignent la salle d'un clic."
              : "Les réunions où vous êtes invité apparaîtront ici. Vous serez prévenu par la cloche."
          }
        />
      ) : (
        <>
          <Section titre="En cours" liste={enCours} jour={jour} heure={heure} />
          <Section titre="À venir" liste={aVenir} jour={jour} heure={heure} />
          <Section titre="Passées" liste={closes} jour={jour} heure={heure} />
        </>
      )}
    </>
  );
}
