import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApercuA4 } from "@/components/impression/feuille-a4";
import { DocumentPv } from "@/components/pv/document-pv";
import { EditeurPv } from "@/components/pv/editeur-pv";
import { SuiviPv } from "@/components/pv/suivi-pv";
import { EtatVide, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { comptesDiffusion, pvComplet, servicesActifs } from "@/modules/pv/donnees";
import { gestesPv, LIBELLE_STATUT, LIBELLE_TYPE_COURT, normaliserDiffusion, referencePv, type StatutPv, type TypePv } from "@/modules/pv/regles";
import { personnelActif } from "@/modules/taches/requetes";
import { db } from "@/db";

export const metadata: Metadata = { title: "Procès-verbal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un procès-verbal. Tant qu'il est en rédaction — ou soumis, pour la
 * direction — il s'écrit ici, la feuille imprimée à côté. Publié, il se lit,
 * s'accuse, se suit (lectures, actions devenues tâches) et s'imprime.
 */
export default async function PagePvDetail({ params }: PageProps<"/pv/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const [valideur, executer] = await Promise.all([peut("pv.valider"), peut("taches.executer")]);
  const complet = await pvComplet(session.organizationId, id, { userId: session.userId, valideur });
  if (!complet) {
    return <EtatVide titre="Procès-verbal indisponible" message="Il n'existe pas, ou il ne vous a pas été diffusé." />;
  }
  const { pv } = complet;
  const statut = pv.statut as StatutPv;
  const redacteur = pv.redigeParUserId === session.userId;
  const gestes = gestesPv(statut, { redacteur, valideur });
  const editable = gestes.includes("modifier") || (statut === "a_valider" && valideur);
  const identite = await identiteEntreprise(session.organizationId);

  const contenu = {
    numero: pv.numero,
    revision: pv.revision,
    type: pv.type as TypePv,
    objet: pv.objet,
    dateSeance: pv.dateSeance,
    lieu: pv.lieu,
    participants: pv.participants,
    points: pv.points,
    conclusion: pv.conclusion,
    confidentiel: pv.confidentiel,
    redacteur: complet.redacteur,
    publiePar: complet.publiePar,
    publieLe: pv.publieLe,
    actions: complet.actions.map((a) => ({ libelle: a.libelle, responsable: a.responsable, echeance: a.echeance })),
  };

  const enTete = (
    <div className="mb-4">
      <Link href="/pv" className="text-sm text-[var(--encre-douce)] hover:underline">
        ← Procès-verbaux
      </Link>
      <h1 className="mt-1 text-xl font-bold tracking-tight">{pv.objet}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--encre-douce)]">
        <span className="chiffres">{referencePv(pv.numero, pv.revision)}</span>
        <span>· {LIBELLE_TYPE_COURT[pv.type as TypePv]}</span>
        <span>· rédigé par {complet.redacteur}</span>
        <Pastille ton={statut === "publie" ? "valide" : statut === "a_valider" ? "alerte" : "neutre"}>{LIBELLE_STATUT[statut]}</Pastille>
        {pv.confidentiel && <Pastille ton="danger">Confidentiel</Pastille>}
        {complet.reunion && (
          <Link href={`/meeting/${complet.reunion.id}`} className="text-marque-600 hover:underline">
            Réunion {complet.reunion.numero}
          </Link>
        )}
      </p>
    </div>
  );

  if (editable) {
    const [comptes, services, personnel] = await Promise.all([comptesDiffusion(db, session.organizationId), servicesActifs(session.organizationId), personnelActif(session.organizationId)]);
    return (
      <>
        {enTete}
        <EditeurPv
          pvId={pv.id}
          statut={statut}
          redacteur={redacteur}
          valideur={valideur}
          remarque={pv.remarque}
          identite={identite}
          initial={{
            type: pv.type as TypePv,
            objet: pv.objet,
            dateSeance: pv.dateSeance,
            lieu: pv.lieu ?? "",
            participants: pv.participants,
            points: pv.points,
            conclusion: pv.conclusion ?? "",
            diffusion: normaliserDiffusion(pv.diffusion),
            accuseRequis: pv.accuseRequis,
            confidentiel: pv.confidentiel,
            actions: complet.actions.map((a) => ({ id: a.id, libelle: a.libelle, responsableEmployeId: a.responsableEmployeId, echeance: a.echeance })),
          }}
          meta={{ numero: pv.numero, revision: pv.revision, redacteur: complet.redacteur }}
          comptes={comptes.map((c) => ({ userId: c.userId, nom: c.nom, service: c.service }))}
          services={services}
          personnel={personnel.map((p) => ({ id: p.id, nom: p.nom, poste: p.poste }))}
        />
      </>
    );
  }

  return (
    <>
      {enTete}
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Le procès-verbal">
          <ApercuA4>
            <DocumentPv pv={contenu} identite={identite} />
          </ApercuA4>
        </section>
        <SuiviPv
          pvId={pv.id}
          statut={statut}
          gestes={gestes}
          redacteur={redacteur}
          valideur={valideur}
          peutCreerTaches={executer && (redacteur || valideur)}
          accuseRequis={pv.accuseRequis}
          maLecture={complet.maLecture ? { luLeIso: complet.maLecture.luLe?.toISOString() ?? null } : null}
          lectures={complet.lectures.map((l) => ({ userId: l.userId, nom: l.nom, luLeIso: l.luLe?.toISOString() ?? null }))}
          actions={complet.actions}
          versions={complet.versions.map((v) => ({ id: v.id, revision: v.revision, statut: v.statut, courante: v.id === pv.id }))}
          derniereVersionPubliee={Math.max(0, ...complet.versions.filter((v) => v.statut === "publie").map((v) => v.revision))}
          revision={pv.revision}
        />
      </div>
    </>
  );
}
