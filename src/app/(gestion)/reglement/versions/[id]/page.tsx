import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { BoutonRelance } from "@/components/reglement/bouton-relance";
import { EditeurReglement } from "@/components/reglement/editeur";
import { HORODATAGE, TON_ETAT } from "@/components/reglement/etat";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { LIBELLE_ETAT, RELANCE_MIN_MS, dateLongue, etatVersion, relancePermise } from "@/modules/reglement/regles";
import { aujourdhuiPour, suiviDe, versionDe, versionsDe } from "@/modules/reglement/requetes";

export const metadata: Metadata = { title: "Version du règlement" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEURE = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Africa/Abidjan" });

/** Un brouillon se rédige ; une version publiée se suit : qui l'a acceptée, qui la doit encore. */
export default async function PageVersionReglement({ params }: PageProps<"/reglement/versions/[id]">) {
  if (!(await peut("reglement.gerer"))) return <AccesRefuse droit="reglement.gerer" />;
  const session = await exigerEntreprise();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [version, versions, aujourdhui] = await Promise.all([versionDe(session.organizationId, id), versionsDe(session.organizationId), aujourdhuiPour(session.organizationId)]);
  if (!version) notFound();
  const publiees = versions.filter((v) => v.statut === "publie");

  if (version.statut === "brouillon") {
    const precedente = publiees.reduce<number | null>((max, v) => (v.numero !== null && (max === null || v.numero > max) ? v.numero : max), null);
    return (
      <>
        <EnTetePage
          titre={precedente === null ? "Rédiger le règlement" : `Rédiger la version ${precedente + 1}`}
          sousTitre={precedente === null ? "Première version" : `Reprend le texte de la version ${precedente}`}
          actions={
            <Link href="/reglement/versions" className="text-sm font-semibold text-marque-600 hover:underline">
              Toutes les versions
            </Link>
          }
        />
        <EditeurReglement
          brouillon={{
            id: version.id,
            titre: version.titre,
            preambule: version.preambule ?? "",
            resume: version.resume ?? "",
            dateEffet: version.dateEffet ?? "",
            articles: version.articles,
          }}
          aujourdhui={aujourdhui}
          precedente={precedente}
        />
      </>
    );
  }

  const suivi = await suiviDe(session.organizationId, version.id);
  const etat = etatVersion({ id: version.id, statut: "publie", numero: version.numero, dateEffet: version.dateEffet }, publiees, aujourdhui);
  const maintenant = new Date();
  const bloquee = relancePermise(version.derniereRelanceLe, maintenant) ? null : HEURE.format(new Date((version.derniereRelanceLe as Date).getTime() + RELANCE_MIN_MS));

  return (
    <>
      <EnTetePage
        titre={`Version ${version.numero}`}
        sousTitre={`${version.titre} · en vigueur le ${dateLongue(version.dateEffet as string)} · ${version.articles.length} article${version.articles.length > 1 ? "s" : ""}`}
        actions={
          <>
            <Link href={`/reglement?version=${version.id}`} className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
              Lire le texte
            </Link>
            <BoutonRelance versionId={version.id} enAttente={suivi.enAttente.length} bloqueeJusqua={bloquee} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Pastille ton={TON_ETAT[etat]}>{LIBELLE_ETAT[etat]}</Pastille>
        {version.publieLe && <span className="text-[var(--encre-douce)]">Publiée le {HORODATAGE.format(version.publieLe)}</span>}
        {version.derniereRelanceLe && <span className="text-[var(--encre-faible)]">· dernière relance le {HORODATAGE.format(version.derniereRelanceLe)}</span>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CarteIndicateur libelle="Lu et accepté" valeur={`${suivi.lus} / ${suivi.total}`} ton={suivi.lus === suivi.total && suivi.total > 0 ? "valide" : "marque"} />
        <CarteIndicateur libelle="Part de l'équipe" valeur={`${suivi.pourcent} %`} ton="neutre" />
        <CarteIndicateur libelle="En attente" valeur={String(suivi.enAttente.length)} ton={suivi.enAttente.length > 0 ? "alerte" : "valide"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Pas encore accepté</h2>
          {suivi.enAttente.length === 0 ? (
            <EtatVide titre="Personne" message="Tous les comptes actifs ont accepté cette version." />
          ) : (
            <ul className="divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] text-sm shadow-sm">
              {suivi.enAttente.map((m) => (
                <li key={m.userId} className="px-4 py-2.5">
                  {m.nom}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Accepté</h2>
          {suivi.lecteurs.length === 0 ? (
            <EtatVide titre="Personne encore" message={etat === "a_venir" ? "La version n'est pas encore en vigueur : chacun peut l'accepter dès maintenant." : "Chacun l'acceptera à sa prochaine ouverture du logiciel."} />
          ) : (
            <ul className="divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] text-sm shadow-sm">
              {suivi.lecteurs.map((l) => (
                <li key={l.userId} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5">
                  <span>{l.nom}</span>
                  <span className="chiffres text-xs text-[var(--encre-douce)]">{HORODATAGE.format(l.accepteLe)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
