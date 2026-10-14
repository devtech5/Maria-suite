import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompteRendu, GestesReunion, InviterMembres } from "@/components/meeting/gestes-reunion";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { LIBELLE_STATUT, dureeLisible, gestesPossibles, pilote, rejoignable, type Statut } from "@/modules/meeting/calcul";
import { fuseauDe, membresInvitables, participantsDe, reunionDe } from "@/modules/meeting/requetes";

export const metadata: Metadata = { title: "Réunion" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TON: Record<Statut, TonPastille> = { en_cours: "valide", planifiee: "marque", terminee: "neutre", annulee: "danger" };

/** Une réunion : horaire, ordre du jour, feuille de présence, compte rendu. */
export default async function PageReunion({ params }: PageProps<"/meeting/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const [reunion, participants, organise, fuseau] = await Promise.all([
    reunionDe(session.organizationId, id),
    participantsDe(session.organizationId, id),
    peut("meeting.organiser"),
    fuseauDe(session.organizationId),
  ]);
  if (!reunion) notFound();

  const acteur = { userId: session.userId, organise };
  const invite = participants.some((p) => p.userId === session.userId);
  const pilotee = pilote(reunion, acteur);
  if (!invite && !pilotee) {
    return <EtatVide titre="Réunion privée" message="Vous n'êtes pas invité à cette réunion. Demandez à son organisateur de vous y ajouter." />;
  }

  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: fuseau });
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: fuseau });
  const fin = new Date(reunion.debutPrevu.getTime() + reunion.dureeMinutes * 60_000);
  const presents = participants.filter((p) => p.present).length;
  const venus = participants.filter((p) => p.rejointLe).length;
  const candidats = rejoignable(reunion.statut) && pilotee
    ? (await membresInvitables(session.organizationId)).filter((m) => !participants.some((p) => p.userId === m.userId))
    : [];

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/meeting" className="text-[var(--encre-douce)] hover:underline">
          ← Toutes les réunions
        </Link>
      </p>
      <EnTetePage
        titre={reunion.titre}
        sousTitre={`${reunion.numero} · organisée par ${reunion.organisateur}`}
        actions={
          <div className="flex flex-col items-end gap-2">
            {rejoignable(reunion.statut) && (
              <Link
                href={`/meeting/${reunion.id}/salle`}
                className="h-cible inline-flex items-center rounded-lg bg-valide-500 px-4 text-sm font-semibold text-white hover:opacity-90"
              >
                {reunion.statut === "en_cours" ? "Rejoindre la salle" : "Entrer dans la salle"}
              </Link>
            )}
            <GestesReunion reunionId={reunion.id} gestes={gestesPossibles(reunion.statut, reunion, acteur)} />
          </div>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Statut" valeur={LIBELLE_STATUT[reunion.statut]} ton={reunion.statut === "en_cours" ? "valide" : reunion.statut === "annulee" ? "danger" : undefined} />
        <CarteIndicateur libelle="Date" valeur={date.format(reunion.debutPrevu)} precision={`${heure.format(reunion.debutPrevu)} – ${heure.format(fin)}`} />
        <CarteIndicateur
          libelle={reunion.statut === "en_cours" ? "Dans la salle" : "Venus"}
          valeur={`${reunion.statut === "en_cours" ? presents : venus} / ${participants.length}`}
          precision="Participants invités"
        />
        <CarteIndicateur
          libelle="Durée réelle"
          valeur={reunion.ouverteLe ? dureeLisible(Math.floor(((reunion.termineeLe ?? new Date()).getTime() - reunion.ouverteLe.getTime()) / 1000)) : "—"}
          precision={`Prévue : ${dureeLisible(reunion.dureeMinutes * 60)}`}
        />
      </section>

      {reunion.statut === "annulee" && (
        <p className="mb-5 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">Annulée : {reunion.motifAnnulation}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Ordre du jour</h2>
          <div className="whitespace-pre-wrap rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-sm">
            {reunion.ordreDuJour || <span className="text-[var(--encre-faible)]">Aucun ordre du jour.</span>}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Compte rendu</h2>
          {pilotee && reunion.statut !== "annulee" ? (
            <CompteRendu reunionId={reunion.id} initial={reunion.compteRendu} />
          ) : (
            <div className="whitespace-pre-wrap rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-sm">
              {reunion.compteRendu || <span className="text-[var(--encre-faible)]">Pas encore rédigé.</span>}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Feuille de présence</h2>
        <Tableau>
          <thead>
            <tr>
              <Th>Participant</Th>
              <Th>Arrivée</Th>
              <Th aligne="droite">Temps passé</Th>
              <Th>État</Th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.userId}>
                <Td fort={p.userId === reunion.organisateurUserId}>
                  {p.nom}
                  {p.userId === reunion.organisateurUserId ? " · organisateur" : ""}
                </Td>
                <Td chiffres>{p.rejointLe ? heure.format(p.rejointLe) : "—"}</Td>
                <Td aligne="droite" chiffres>
                  {p.rejointLe ? dureeLisible(p.secondesPresence) : "—"}
                </Td>
                <Td>
                  {p.present ? (
                    <Pastille ton="valide">Dans la salle</Pastille>
                  ) : p.rejointLe ? (
                    <Pastille>Venu</Pastille>
                  ) : (
                    <Pastille ton={reunion.statut === "terminee" ? "alerte" : "neutre"}>{reunion.statut === "terminee" ? "Absent" : "Invité"}</Pastille>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tableau>
        {candidats.length > 0 && <InviterMembres reunionId={reunion.id} candidats={candidats} />}
      </section>

      <p className="mt-4 text-xs text-[var(--encre-faible)]">
        Statut : <Pastille ton={TON[reunion.statut]}>{LIBELLE_STATUT[reunion.statut]}</Pastille>
        {reunion.termineeLe ? ` · terminée à ${heure.format(reunion.termineeLe)}${reunion.terminateur ? ` par ${reunion.terminateur}` : ""}` : ""}
      </p>
    </>
  );
}
