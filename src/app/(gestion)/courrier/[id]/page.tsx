import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireImputation } from "@/components/courrier/formulaire-imputation";
import { AccuserReception, Expedier, Piece, Remettre, Traiter } from "@/components/courrier/gestes-pli";
import { TON_STATUT } from "@/components/courrier/liste-plis";
import { EnTetePage, Pastille } from "@/components/ui/primitives";
import { accesCourrier, masquer } from "@/modules/courrier/acces";
import { CANAUX, LIBELLE_STATUT, NATURES, canalValide, enRetard, joursDeRetard, natureValide } from "@/modules/courrier/regles";
import { aujourdhuiPour, destinatairesPossibles, pliDe, plisDe } from "@/modules/courrier/requetes";

export const metadata: Metadata = { title: "Courrier" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUAND = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });
const jour = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

/** La fiche d'un pli : son parcours, ses pièces, et le geste suivant selon qui regarde. */
export default async function PagePli({ params }: PageProps<"/courrier/[id]">) {
  const a = await accesCourrier();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const org = a.session.organizationId;
  const brut = await pliDe(org, id);
  if (!brut || !a.voit(brut)) notFound();
  const contenu = a.voitContenu(brut);
  const p = masquer(brut, contenu);
  const aujourdhui = await aujourdhuiPour(org);
  const arrivee = p.sens === "arrivee";
  const ouvert = p.statut === "impute" || p.statut === "recu";
  const [destinataires, departs, reponse] = await Promise.all([
    a.imputer && arrivee && p.statut !== "traite" ? destinatairesPossibles(org) : Promise.resolve(null),
    arrivee && ouvert && (a.sien(p) || a.imputer) ? plisDe(org, { sens: "depart", limite: 50 }) : Promise.resolve([]),
    p.reponsePliId ? pliDe(org, p.reponsePliId) : Promise.resolve(null),
  ]);

  const lignes: [string, React.ReactNode][] = [
    [arrivee ? "Expéditeur" : "Destinataire", p.correspondant],
    ["Nature", natureValide(p.nature) ? NATURES[p.nature] : p.nature],
    [arrivee ? "Arrivé par" : "Part par", canalValide(p.canal) ? CANAUX[p.canal] : p.canal],
    ["Référence", p.reference ?? "—"],
    ["Date du document", jour(p.dateDocument)],
    ["Enregistré le", QUAND.format(p.enregistreLe)],
  ];
  if (arrivee && p.imputeNom) {
    lignes.push(["Imputé à", `${p.imputeNom}${p.imputeService ? ` · ${p.imputeService}` : ""}${p.imputeLe ? ` · le ${QUAND.format(p.imputeLe)}` : ""}`]);
    if (p.instructions) lignes.push(["Instructions", p.instructions]);
    lignes.push(["Réponse attendue", p.delaiReponse ? `${jour(p.delaiReponse)}${enRetard(p, aujourdhui) ? ` · ${joursDeRetard(p.delaiReponse, aujourdhui)} j de retard` : ""}` : "—"]);
    if (p.accuseLe) lignes.push(["Réception accusée", QUAND.format(p.accuseLe)]);
  }
  if (p.traiteLe) lignes.push(["Traité le", `${QUAND.format(p.traiteLe)}${p.noteTraitement ? ` · ${p.noteTraitement}` : ""}`]);
  if (reponse) lignes.push(["Réponse", <Link key="r" href={`/courrier/${reponse.id}`} className="text-marque-600 hover:underline">{`${reponse.numero} · ${reponse.correspondant}`}</Link>]);
  if (!arrivee) {
    if (p.expedieLe) lignes.push(["Expédié le", `${QUAND.format(p.expedieLe)}${p.transporteur ? ` · ${p.transporteur}` : ""}${p.numeroSuivi ? ` · suivi ${p.numeroSuivi}` : ""}`]);
    if (p.remisLe) lignes.push(["Remis le", `${QUAND.format(p.remisLe)} · reçu par ${p.dechargeNom}`]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <EnTetePage
        titre={p.objet}
        sousTitre={p.numero}
        actions={
          a.enregistrer && (
            <Link href={`/imprimer/etiquette-courrier/${p.id}`} target="_blank" className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
              Étiquette QR
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Pastille ton={TON_STATUT[p.statut]}>{LIBELLE_STATUT[p.statut]}</Pastille>
        {p.confidentiel && <Pastille ton="danger">Confidentiel</Pastille>}
      </div>

      <dl className="mb-6 divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] text-sm shadow-sm">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2.5">
            <dt className="text-[var(--encre-faible)]">{terme}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>

      {contenu && (
        <section className="mb-6 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="mb-2 font-bold">Pièces</h2>
          <Piece id={p.id} piece="scan" presente={p.scan} joindre={a.enregistrer} />
          {!arrivee && (p.statut === "remis" || p.decharge) && (
            <div className="mt-3">
              <Piece id={p.id} piece="decharge" presente={p.decharge} joindre={a.enregistrer} />
            </div>
          )}
        </section>
      )}

      {arrivee && a.sien(p) && p.statut === "impute" && (
        <section className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-sm">Ce courrier vous est imputé : accusez-en réception.</p>
          <AccuserReception id={p.id} />
        </section>
      )}
      {arrivee && ouvert && (a.sien(p) || a.imputer) && (
        <section className="mb-6 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="mb-3 font-bold">Traiter</h2>
          <Traiter id={p.id} departs={departs.map((d) => ({ id: d.id, numero: d.numero, correspondant: d.correspondant }))} />
        </section>
      )}
      {destinataires && (
        <section className="mb-6 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="mb-3 font-bold">{p.imputeUserId ? "Réimputer" : "Imputer"}</h2>
          <FormulaireImputation
            pliId={p.id}
            personnes={destinataires.personnes}
            services={destinataires.services}
            aujourdhui={aujourdhui}
            valeurs={{ userId: p.imputeUserId, serviceId: p.imputeServiceId, instructions: p.instructions, delaiReponse: p.delaiReponse }}
          />
        </section>
      )}
      {!arrivee && a.enregistrer && p.statut === "a_expedier" && (
        <section className="mb-6 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="mb-3 font-bold">Expédier</h2>
          <Expedier id={p.id} />
        </section>
      )}
      {!arrivee && a.enregistrer && p.statut === "expedie" && (
        <section className="mb-6 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="mb-3 font-bold">Remise contre décharge</h2>
          <Remettre id={p.id} />
        </section>
      )}

      <p className="text-sm">
        <Link href={a.consulter ? `/courrier?sens=${p.sens}` : "/courrier/mon-courrier"} className="font-semibold text-marque-600 hover:underline">
          ← Retour
        </Link>
      </p>
    </div>
  );
}
