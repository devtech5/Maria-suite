import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionsVisite } from "@/components/visiteurs/actions-visite";
import { ArriveeAttendue } from "@/components/visiteurs/arrivee-attendue";
import { CopierLienQr } from "@/components/visiteurs/copier-lien-qr";
import { TON_STATUT } from "@/components/visiteurs/liste-visites";
import { PhotosVisite } from "@/components/visiteurs/photos-visite";
import { EnTetePage, Pastille } from "@/components/ui/primitives";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { LIBELLE_STATUT, PIECES_IDENTITE, dureeLisible, dureeMinutes, effacementDes, typePieceValide } from "@/modules/visiteurs/regles";
import { accueilsDe, personnesVisitables, visiteDe } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Visite" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUAND = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Abidjan" });
const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });

/**
 * La fiche d'une visite. L'accueil y voit la pièce et les photos ; qui a
 * annoncé le visiteur, ou la personne visitée, y voit le rendez-vous sans
 * la pièce d'identité.
 */
export default async function PageVisite({ params, searchParams }: PageProps<"/visiteurs/[id]">) {
  const acces = await accesVisiteurs();
  const { id } = await params;
  const { arrivee } = await searchParams;
  if (!UUID.test(id)) notFound();
  const org = acces.session.organizationId;
  const v = await visiteDe(org, id);
  if (!v) notFound();
  const accueil = acces.accueillir && acces.accueilPermis(v.accueilId);
  const sienne = v.brute.annoncePar === acces.session.userId || v.visiteUserId === acces.session.userId;
  if (!accueil && !sienne) notFound();

  const maintenant = new Date();
  const [personnes, accueils] = await Promise.all([accueil ? personnesVisitables(org) : Promise.resolve([]), accueilsDe(org)]);
  const pieceExigee = accueils.find((a) => a.id === v.accueilId)?.pieceExigee ?? true;
  const lignes: [string, React.ReactNode][] = [
    ["Point d'accueil", v.accueil],
    ["Motif", v.motif],
    ["Personne visitée", v.visiteNom ?? v.visiteLibelle ?? "—"],
    ["Société", v.societe ?? "—"],
    ["Téléphone", v.telephone ?? "—"],
    ...(v.attenduLe ? ([["Rendez-vous", QUAND.format(v.attenduLe)]] as [string, React.ReactNode][]) : []),
    ...(v.arriveeLe ? ([["Arrivée", QUAND.format(v.arriveeLe)]] as [string, React.ReactNode][]) : []),
    ...(v.sortieLe ? ([["Sortie", QUAND.format(v.sortieLe)]] as [string, React.ReactNode][]) : []),
    ...(v.arriveeLe ? ([["Durée", dureeLisible(dureeMinutes(v.arriveeLe, v.sortieLe, maintenant))]] as [string, React.ReactNode][]) : []),
    ...(accueil && v.typePiece
      ? ([["Pièce d'identité", `${typePieceValide(v.typePiece) ? PIECES_IDENTITE[v.typePiece] : v.typePiece} · ${v.numeroPiece ?? ""}`]] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <EnTetePage
        titre={v.nom}
        sousTitre={v.numero}
        actions={<ActionsVisite id={v.id} statut={v.statut} accueillir={accueil} telephone={Boolean(v.telephone)} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pastille ton={TON_STATUT[v.statut]}>{LIBELLE_STATUT[v.statut]}</Pastille>
        {v.statut === "attendue" && <CopierLienQr visiteId={v.id} />}
      </div>

      {accueil && v.statut === "attendue" && arrivee && (
        <div className="mb-6">
          <ArriveeAttendue
            visiteId={v.id}
            personnes={personnes}
            pieceExigee={pieceExigee}
            valeurs={{ nom: v.nom, telephone: v.telephone, societe: v.societe, motif: v.motif, visiteUserId: v.visiteUserId, visiteLibelle: v.visiteLibelle }}
          />
        </div>
      )}

      <dl className="mb-6 divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] text-sm shadow-sm">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2.5">
            <dt className="text-[var(--encre-faible)]">{terme}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>

      {accueil && (v.statut === "presente" || v.statut === "sortie") && (
        <section className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="mb-1 font-bold">Photos</h2>
          {v.photosEffaceesLe ? (
            <p className="text-sm text-[var(--encre-douce)]">Photos effacées le {JOUR.format(v.photosEffaceesLe)}, trois mois après la visite. Le registre reste.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-[var(--encre-faible)]">
                Effacées d&apos;elles-mêmes le {JOUR.format(effacementDes(v.arriveeLe ?? maintenant))}. Chaque ouverture est inscrite au journal.
              </p>
              <PhotosVisite visiteId={v.id} presentes={v.photos} modifiable={v.statut === "presente"} />
            </>
          )}
        </section>
      )}

      <p className="mt-6 text-sm">
        <Link href={accueil ? `/visiteurs?accueil=${v.accueilId}` : "/visiteurs/rendez-vous"} className="font-semibold text-marque-600 hover:underline">
          ← Retour
        </Link>
      </p>
    </div>
  );
}
