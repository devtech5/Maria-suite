import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireRepliable } from "@/components/ui/operations";
import { EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { creerDossier } from "@/modules/archives/actions";
import { resumeVisibilite, tailleLisible } from "@/modules/archives/calcul";
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
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {affiches.map((d) => {
                const masque = d.visibilite === "selection" && d.designes.length === 0;
                return (
                  <li key={d.id}>
                    <Link
                      href={`/archives/dossiers/${d.id}`}
                      className="flex h-full flex-col rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 hover:border-marque-400"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold">{d.nom}</span>
                          {d.description && <span className="mt-0.5 block text-xs text-[var(--encre-faible)]">{d.description}</span>}
                        </span>
                        <span aria-hidden className="text-2xl leading-none text-[var(--encre-faible)]">
                          {masque ? "◌" : "▣"}
                        </span>
                      </span>

                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {gestionnaire && (
                          <Pastille ton={masque ? "danger" : d.visibilite === "tous" ? "valide" : "neutre"}>
                            {resumeVisibilite({ visibilite: d.visibilite, designes: d.designes.map((m) => m.userId) })}
                          </Pastille>
                        )}
                        <Pastille ton={d.depotOuvert ? "marque" : "neutre"}>{d.depotOuvert ? "Dépôt ouvert" : "Lecture seule"}</Pastille>
                      </span>

                      {gestionnaire && d.visibilite === "selection" && d.designes.length > 0 && (
                        <span className="mt-2 block truncate text-xs text-[var(--encre-douce)]">
                          {d.designes.map((m) => m.nom).join(", ")}
                        </span>
                      )}

                      <span className="chiffres mt-auto block pt-3 text-xs text-[var(--encre-faible)]">
                        {d.archives} archive{d.archives > 1 ? "s" : ""}
                        {d.octets > 0 && ` · ${tailleLisible(d.octets)}`}
                        {d.derniereArchiveLe && ` · dernière le ${JOUR.format(d.derniereArchiveLe)}`}
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
