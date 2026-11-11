import type { Metadata } from "next";
import Link from "next/link";

import { IconeDossier } from "@/components/archives/icones";
import { FormulaireRepliable } from "@/components/ui/operations";
import { EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { creerDossier } from "@/modules/archives/actions";
import { resumeVisibilite, resumeVisibiliteCourt, tailleLisible } from "@/modules/archives/calcul";
import { dossiersVisibles, membresEntreprise } from "@/modules/archives/requetes";

import { ChampsDossier } from "./champs-dossier";

export const metadata: Metadata = { title: "Dossiers partagés" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" });

/**
 * Dossiers partagés.
 *
 * Les administrateurs les créent et décident, membre par membre, qui les voit.
 * Chacun ne trouve ici que les dossiers qui lui sont ouverts ; un dossier
 * masqué n'apparaît pas, même vide de sens pour lui.
 */
export default async function PageDossiers({ searchParams }: PageProps<"/archives/dossiers">) {
  const session = await exigerEntreprise();
  // Recherche seule : un dossier n'a pas de date qui compte.
  const filtres = lireFiltresListe(await searchParams);
  const gestionnaire = await peut("archives.dossier.gerer");

  const [dossiers, membres] = await Promise.all([
    dossiersVisibles(session.organizationId, session.userId, gestionnaire),
    gestionnaire ? membresEntreprise(session.organizationId) : Promise.resolve([]),
  ]);
  // Filtre sur les dossiers déjà visibles : la recherche ne montre jamais plus que la liste.
  // Les membres désignés ne se cherchent que par qui les voit affichés, le gestionnaire.
  const affiches = dossiers.filter((d) =>
    correspond(filtres.q, [d.nom, d.description, ...(gestionnaire ? d.designes.map((m) => m.nom) : [])]),
  );

  return (
    <>
      <EnTetePage
        titre="Dossiers partagés"
        sousTitre={
          gestionnaire
            ? "Créez des dossiers et choisissez quels membres les voient"
            : "Les dossiers que l'administration a ouverts pour vous"
        }
        actions={
          gestionnaire ? (
            <FormulaireRepliable libelle="Nouveau dossier" titre="Nouveau dossier partagé" action={creerDossier}>
              <ChampsDossier membres={membres} />
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {dossiers.length === 0 ? (
        <EtatVide
          titre="Aucun dossier"
          message={
            gestionnaire
              ? "Un dossier partagé réunit des archives et décide qui les voit : notes de service pour tous, contrats pour la comptabilité, dossier d'un chantier pour son équipe."
              : "Aucun dossier ne vous est ouvert pour l'instant. Vos propres archives restent dans « Mes archives »."
          }
        />
      ) : (
        <>
          <Recherche
            chemin="/archives/dossiers"
            valeur={filtres.q}
            placeholder={gestionnaire ? "Nom, description, membre désigné…" : "Nom, description…"}
            resultats={filtres.q ? `${fmtEntier(affiches.length)} sur ${fmtEntier(dossiers.length)}` : undefined}
          />
          {affiches.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun dossier ouvert pour vous ne répond à cette recherche." />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {affiches.map((d) => {
                const masque = d.visibilite === "selection" && d.designes.length === 0;
                return (
                  <li key={d.id}>
                    <Link
                      href={`/archives/dossiers/${d.id}`}
                      className="group flex h-full flex-col items-center rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-or hover:shadow-md"
                    >
                      <span className="relative">
                        <IconeDossier
                          id={d.id}
                          masque={masque}
                          vide={d.archives === 0}
                          className="h-20 w-auto drop-shadow-sm transition duration-300 group-hover:scale-105 group-hover:-rotate-2 sm:h-24"
                        />
                        {d.archives > 0 && (
                          <span className="chiffres absolute -top-1 -right-2 min-w-6 rounded-full bg-nuit px-1.5 py-0.5 text-[11px] font-bold text-white ring-2 ring-[var(--surface)]">
                            {d.archives}
                          </span>
                        )}
                      </span>

                      <span className="mt-2 block w-full truncate text-sm font-semibold" title={d.nom}>
                        {d.nom}
                      </span>
                      {d.description && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--encre-faible)]">{d.description}</span>
                      )}

                      <span className="mt-2 flex flex-wrap justify-center gap-1">
                        {gestionnaire && (
                          <span className="inline-flex" title={resumeVisibilite({ visibilite: d.visibilite, designes: d.designes.map((m) => m.userId) })}>
                            <Pastille ton={masque ? "danger" : d.visibilite === "tous" ? "valide" : "neutre"}>
                              {resumeVisibiliteCourt({ visibilite: d.visibilite, designes: d.designes.map((m) => m.userId) })}
                            </Pastille>
                          </span>
                        )}
                        <Pastille ton={d.depotOuvert ? "marque" : "neutre"}>{d.depotOuvert ? "Dépôt ouvert" : "Lecture seule"}</Pastille>
                      </span>

                      {gestionnaire && d.visibilite === "selection" && d.designes.length > 0 && (
                        <span className="mt-1.5 block w-full truncate text-xs text-[var(--encre-douce)]">
                          {d.designes.map((m) => m.nom).join(", ")}
                        </span>
                      )}

                      <span className="chiffres mt-auto block pt-2 text-[11px] text-[var(--encre-faible)]">
                        {d.archives === 0 ? "Vide" : `${d.archives} archive${d.archives > 1 ? "s" : ""}`}
                        {d.octets > 0 && ` · ${tailleLisible(d.octets)}`}
                        {d.derniereArchiveLe && <span className="block">dernière le {JOUR.format(d.derniereArchiveLe)}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
