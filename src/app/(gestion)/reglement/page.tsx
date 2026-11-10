import type { Metadata } from "next";
import Link from "next/link";

import { Acceptation } from "@/components/reglement/acceptation";
import { TexteReglement } from "@/components/reglement/texte-reglement";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { HORODATAGE, TON_ETAT } from "@/components/reglement/etat";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { LIBELLE_ETAT, dateLongue, etatVersion, versionAVenir, versionEnVigueur } from "@/modules/reglement/regles";
import { acceptationDe, aujourdhuiPour, versionDe, versionsDe } from "@/modules/reglement/requetes";

export const metadata: Metadata = { title: "Règlement intérieur" };

/**
 * Le règlement intérieur, lisible à tout moment par chacun : la version en
 * vigueur par défaut, les autres au choix (`?version=`). Une version publiée
 * à l'avance s'y lit et s'accepte avant sa date d'effet.
 */
export default async function PageReglement({ searchParams }: PageProps<"/reglement">) {
  const session = await exigerEntreprise();
  const { version: demandee } = await searchParams;
  const [versions, aujourdhui, gerer] = await Promise.all([versionsDe(session.organizationId), aujourdhuiPour(session.organizationId), peut("reglement.gerer")]);
  const publiees = versions.filter((v) => v.statut === "publie");
  const enVigueur = versionEnVigueur(publiees, aujourdhui);
  const aVenir = versionAVenir(publiees, aujourdhui);

  const choisie = publiees.find((v) => v.id === demandee) ?? enVigueur ?? aVenir;
  if (!choisie) {
    return (
      <>
        <EnTetePage titre="Règlement intérieur" />
        <EtatVide
          titre="Aucun règlement publié"
          message={gerer ? "Rédigez le règlement intérieur article par article, puis publiez-le avec sa date d'effet : chacun devra le lire et l'accepter." : "Les ressources humaines n'ont pas encore publié le règlement intérieur."}
          actions={
            gerer && (
              <Link href="/reglement/versions" className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
                Rédiger le règlement
              </Link>
            )
          }
        />
      </>
    );
  }

  const [version, accepteLe, accepteAVenir] = await Promise.all([
    versionDe(session.organizationId, choisie.id),
    acceptationDe(session.organizationId, session.userId, choisie.id),
    aVenir && aVenir.id !== choisie.id ? acceptationDe(session.organizationId, session.userId, aVenir.id) : Promise.resolve(null),
  ]);
  if (!version) return null;
  const etat = etatVersion(choisie, publiees, aujourdhui);

  return (
    <>
      <EnTetePage
        titre="Règlement intérieur"
        sousTitre={accepteLe ? `Vous avez accepté cette version le ${HORODATAGE.format(accepteLe)}` : "Vous n'avez pas encore accepté cette version"}
        actions={<BoutonImprimer />}
      />

      {aVenir && aVenir.id !== choisie.id && !accepteAVenir && (
        <p className="mb-4 rounded-xl border border-alerte-600/30 bg-alerte-50 px-4 py-3 text-sm text-alerte-600 print:hidden">
          {`Une nouvelle version (${aVenir.numero}) entre en vigueur le ${dateLongue(aVenir.dateEffet as string)}. `}
          <Link href={`/reglement?version=${aVenir.id}`} className="font-semibold underline underline-offset-4">
            La lire et l&apos;accepter dès maintenant
          </Link>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm print:hidden">
        <Pastille ton={TON_ETAT[etat]}>{LIBELLE_ETAT[etat]}</Pastille>
        {version.resume && <span className="text-[var(--encre-douce)]">Ce qui change : {version.resume}</span>}
      </div>

      <TexteReglement version={version} />

      {!accepteLe && version.numero !== null && <Acceptation versionId={version.id} numero={version.numero} suite={`/reglement?version=${version.id}`} />}

      {publiees.length > 1 && (
        <section className="mt-8 print:hidden">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Toutes les versions</h2>
          <ul className="divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
            {publiees.map((v) => {
              const e = etatVersion(v, publiees, aujourdhui);
              return (
                <li key={v.id}>
                  <Link href={`/reglement?version=${v.id}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--surface-creuse)] ${v.id === choisie.id ? "font-semibold" : ""}`}>
                    <span className="w-24 shrink-0">Version {v.numero}</span>
                    <span className="flex-1 text-[var(--encre-douce)]">En vigueur le {dateLongue(v.dateEffet as string)}</span>
                    <Pastille ton={TON_ETAT[e]}>{LIBELLE_ETAT[e]}</Pastille>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
