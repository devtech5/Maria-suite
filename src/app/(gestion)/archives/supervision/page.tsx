import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteIndicateur, EnTetePage, EtatVide, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { tailleLisible } from "@/modules/archives/calcul";
import { dossiersVisibles, journalArchives, titulaires, toutesArchives } from "@/modules/archives/requetes";

import { affichee } from "../affichage";
import { ListeArchives } from "../liste-archives";

export const metadata: Metadata = { title: "Supervision des archives" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MOMENT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Abidjan",
});

const GESTE: Record<string, string> = {
  "archive.deposer": "Dépôt",
  "archive.ouvrir": "Ouverture",
  "archive.retirer": "Désactivation",
  "archive.reactiver": "Réactivation",
  "archive.modifier": "Modification",
  "archive.supprimer": "Suppression",
  "archive.verifier": "Vérification",
  "archive_dossier.creer": "Dossier créé",
  "archive_dossier.modifier": "Dossier modifié",
  "archive_dossier.supprimer": "Dossier supprimé",
};

/** Visibilité d'un dossier telle que le journal l'a gardée. */
function visibiliteJournal(etat: unknown): string {
  const e = etat as { visibilite?: string; membres?: unknown[] } | null;
  if (!e?.visibilite) return "";
  if (e.visibilite === "tous") return "visible de tous";
  const n = e.membres?.length ?? 0;
  return n === 0 ? "masqué à tous" : `visible de ${n} membre${n > 1 ? "s" : ""}`;
}

/**
 * Supervision des archives, réservée à l'administration : propriétaire et gérant
 * par défaut, ou tout rôle composé qui porte `archives.superviser`.
 *
 * Il voit tout, retraits compris, et répond de ce qu'il ouvre : ses propres
 * consultations figurent au journal comme celles des autres, et l'auteur de
 * l'archive en est averti dans son espace.
 */
export default async function PageSupervision({ searchParams }: PageProps<"/archives/supervision">) {
  const session = await exigerEntreprise();
  if (!(await peut("archives.superviser"))) return <AccesRefuse droit="archives.superviser" />;

  const { membre: brut } = await searchParams;
  const membre = typeof brut === "string" && UUID.test(brut) ? brut : null;

  const [archives, personnes, journal, dossiers] = await Promise.all([
    toutesArchives(session.organizationId, membre),
    titulaires(session.organizationId),
    journalArchives(session.organizationId),
    // L'administration range une archive dans n'importe quel dossier partagé.
    dossiersVisibles(session.organizationId, session.userId, true),
  ]);
  const rubriques = [...new Set(archives.map((a) => a.dossier).filter((d): d is string => Boolean(d)))].sort();

  const volume = personnes.reduce((s, p) => s + p.octets, 0);
  const fichiers = personnes.reduce((s, p) => s + p.fichiers, 0);
  const retirees = archives.filter((a) => a.retireeLe).length;
  const alterees = archives.filter((a) => a.derniereVerification && a.derniereVerification.etat !== "conforme").length;
  const choisi = personnes.find((p) => p.userId === membre);

  const pastille = (actif: boolean) =>
    `shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
      actif ? "bg-marque-600 text-white" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)] hover:bg-[var(--filet)]"
    }`;

  return (
    <>
      <EnTetePage
        titre="Supervision des archives"
        sousTitre={
          choisi
            ? `Archives de ${choisi.nom}, désactivées comprises`
            : "Archives de tous les membres, désactivées comprises — chaque ouverture est tracée"
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Archives" valeur={fmtEntier(fichiers)} precision={`${personnes.length} titulaire${personnes.length > 1 ? "s" : ""}`} />
        <CarteIndicateur libelle="Volume conservé" valeur={volume === 0 ? "0 Ko" : tailleLisible(volume)} precision="Hors archives désactivées" />
        <CarteIndicateur
          libelle="Désactivées"
          valeur={fmtEntier(retirees)}
          ton={retirees > 0 ? "alerte" : "neutre"}
          precision={choisi ? "Pour ce membre" : "Masquées aux membres, conservées"}
        />
        <CarteIndicateur
          libelle="Intégrité"
          valeur={alterees > 0 ? `${fmtEntier(alterees)} en défaut` : "Aucun défaut"}
          ton={alterees > 0 ? "danger" : "valide"}
          precision="Selon la dernière vérification"
        />
      </section>

      {personnes.length > 0 && (
        <nav aria-label="Titulaires" className="mb-4 flex gap-1.5 overflow-x-auto pb-0.5">
          <Link href="/archives/supervision" aria-current={membre === null ? "page" : undefined} className={pastille(membre === null)}>
            Tous ({fichiers})
          </Link>
          {personnes.map((p) => (
            <Link
              key={p.userId}
              href={`/archives/supervision?membre=${p.userId}`}
              aria-current={membre === p.userId ? "page" : undefined}
              className={pastille(membre === p.userId)}
            >
              {p.nom} ({p.fichiers})
            </Link>
          ))}
        </nav>
      )}

      {archives.length === 0 ? (
        <EtatVide
          titre="Aucune archive"
          message="Les membres n'ont encore rien archivé. Chacun dépose depuis « Mes archives » ; tout ce qu'ils déposent apparaît ici."
        />
      ) : (
        <ListeArchives
          archives={archives.map(affichee)}
          mode="supervision"
          peutGerer
          moi={session.userId}
          destinations={dossiers.map((d) => ({ id: d.id, nom: d.nom }))}
          rubriques={rubriques}
        />
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-[var(--encre-douce)]">Journal des accès</h2>
        {journal.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucun geste enregistré.</p>
        ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>Quand</Th>
                <Th>Geste</Th>
                <Th>Par</Th>
                <Th>Archive</Th>
                <Th>Titulaire</Th>
                <Th>Détail</Th>
              </tr>
            </thead>
            <tbody>
              {journal.map((e) => (
                <tr key={e.id}>
                  <Td chiffres>{MOMENT.format(e.le)}</Td>
                  <Td fort>{GESTE[e.action] ?? e.action}</Td>
                  <Td>{e.acteur}</Td>
                  <Td>
                    <span className="chiffres">{e.numero ?? "—"}</span>
                    {e.titre && <span className="block max-w-[220px] truncate text-xs text-[var(--encre-faible)]">{e.titre}</span>}
                  </Td>
                  <Td>{e.titulaire ?? "—"}</Td>
                  <Td>
                    <span className="text-xs text-[var(--encre-douce)]">
                      {e.action === "archive.retirer"
                        ? `Motif : ${String(e.detail?.motif ?? "—")}`
                        : e.action === "archive.modifier"
                          ? `« ${String(e.avant?.titre ?? "—")} » → « ${String(e.detail?.titre ?? "—")} »`
                        : e.action === "archive.supprimer"
                          ? `« ${String(e.avant?.titre ?? "—")} » supprimée`
                        : e.action === "archive.verifier"
                          ? e.detail?.etat === "conforme"
                            ? "Intègre"
                            : e.detail?.etat === "absent"
                              ? "Fichier absent"
                              : "ALTÉRÉE"
                          : e.action === "archive.ouvrir"
                            ? e.detail?.parAdministrateur
                              ? "Par un autre que l'auteur"
                              : "Par son auteur"
                            : e.action === "archive_dossier.modifier"
                              ? `${visibiliteJournal(e.avant)} → ${visibiliteJournal(e.detail)}`
                              : e.action === "archive_dossier.creer"
                                ? visibiliteJournal(e.detail)
                                : ""}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        )}
      </section>
    </>
  );
}
