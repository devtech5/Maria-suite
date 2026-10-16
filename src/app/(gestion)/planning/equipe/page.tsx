import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { Avatar } from "@/components/ui/courrier";
import { CarteIndicateur, EnTetePage, EtatVide, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs, peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { ajouterJours, jourLocal } from "@/modules/presences/calcul";
import { bornesSemaine, formaterEcheance, resumeHoraires, titreJour } from "@/modules/planning/affichage";
import { blocsDuJour, etatActuel, lundiDe, minutesEnHeure, STATUTS } from "@/modules/planning/calcul";
import { libelleOrigine } from "@/modules/planning/deduites";
import { fuseauEntreprise, horairesDe, membresPlanning, planningSur } from "@/modules/planning/requetes";

import { PastilleStatut } from "../composants";

export const metadata: Metadata = { title: "Planning de l'équipe" };

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Statuts qui veulent dire « pas au bureau » : à l'accueil, on ne transfère pas l'appel. */
const DEHORS = new Set(["en_mission", "sur_terrain", "en_course", "en_deplacement"]);

const FILTRES = [
  { cle: "tous", libelle: "Tout le monde" },
  { cle: "joignables", libelle: "Joignables maintenant" },
  { cle: "dehors", libelle: "En dehors du bureau" },
  { cle: "indisponibles", libelle: "Indisponibles" },
] as const;

/**
 * Le tableau de l'accueil : qui est disponible, en mission, en courses ou sur
 * le terrain en ce moment, et la semaine de chacun. La secrétaire le consulte ;
 * qui gère le planning ouvre la ligne d'un membre pour la corriger.
 */
export default async function PageEquipe({ searchParams }: PageProps<"/planning/equipe">) {
  if (!(await peut("planning.equipe.consulter"))) return <AccesRefuse droit="planning.equipe.consulter" />;
  const session = await exigerEntreprise();
  const droits = await droitsActifs();
  const gere = droits.has("planning.gerer");
  const { semaine, filtre: demande } = await searchParams;
  const filtre = FILTRES.find((f) => f.cle === demande)?.cle ?? "tous";

  const [fuseau, membres] = await Promise.all([fuseauEntreprise(session.organizationId), membresPlanning(session.organizationId)]);
  const maintenant = new Date();
  const aujourdhui = jourLocal(maintenant, fuseau);
  const lundi = lundiDe(typeof semaine === "string" && DATE_ISO.test(semaine) ? semaine : aujourdhui);
  const { du, au } = bornesSemaine(lundi, fuseau);
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));

  const ids = membres.map((m) => m.userId);
  // La semaine affichée, plus ce qui est en cours et ce qui suit, pour la colonne « Maintenant ».
  const horizon = new Date(maintenant.getTime() + 8 * 86_400_000);
  const [creneaux, horaires] = await Promise.all([
    planningSur(session.organizationId, du < maintenant ? du : maintenant, au > horizon ? au : horizon, ids, { userId: session.userId, droits }, fuseau, maintenant),
    horairesDe(session.organizationId, ids),
  ]);

  const lignes = membres.map((m) => {
    const plages = horaires.get(m.userId) ?? [];
    const siens = creneaux.filter((c) => c.userId === m.userId);
    const etat = etatActuel(maintenant, siens, plages, fuseau);
    return {
      ...m,
      etat,
      jusqua: formaterEcheance(etat.jusqua, maintenant, fuseau),
      jours: jours.map((jour) => ({ jour, horaires: resumeHoraires(plages, jour), blocs: blocsDuJour(jour, siens, fuseau) })),
    };
  });

  const joignables = lignes.filter((l) => l.etat.joignable).length;
  const dehors = lignes.filter((l) => DEHORS.has(l.etat.statut)).length;
  const nonRenseignes = lignes.filter((l) => l.etat.statut === "non_renseigne").length;
  const visibles = lignes.filter(
    (l) =>
      filtre === "tous" ||
      (filtre === "joignables" && l.etat.joignable) ||
      (filtre === "dehors" && DEHORS.has(l.etat.statut)) ||
      (filtre === "indisponibles" && !l.etat.joignable),
  );

  const lien = (p: { semaine?: string; filtre?: string }) => {
    const q = new URLSearchParams();
    const s = p.semaine ?? (lundi !== lundiDe(aujourdhui) ? lundi : undefined);
    const f = p.filtre ?? filtre;
    if (s) q.set("semaine", s);
    if (f !== "tous") q.set("filtre", f);
    const texte = q.toString();
    return texte ? `/planning/equipe?${texte}` : "/planning/equipe";
  };

  return (
    <>
      <EnTetePage titre="Planning de l'équipe" sousTitre="Qui est joignable maintenant, et où chacun sera cette semaine." />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Joignables maintenant" valeur={fmtEntier(joignables)} ton="valide" precision={`Sur ${fmtEntier(lignes.length)} membres`} />
        <CarteIndicateur libelle="En dehors du bureau" valeur={fmtEntier(dehors)} ton="marque" precision="Mission, terrain, courses, déplacement" />
        <CarteIndicateur libelle="Indisponibles" valeur={fmtEntier(lignes.length - joignables - nonRenseignes)} ton="alerte" />
        <CarteIndicateur libelle="Non renseignés" valeur={fmtEntier(nonRenseignes)} precision="Ni horaires ni statut" />
      </section>

      <nav aria-label="Filtres" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {FILTRES.map((f) => (
          <Link
            key={f.cle}
            href={lien({ filtre: f.cle })}
            aria-current={filtre === f.cle ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 ${filtre === f.cle ? "bg-marque-600 font-semibold text-white" : "border border-[var(--filet)] hover:bg-[var(--surface-creuse)]"}`}
          >
            {f.libelle}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <Link href={lien({ semaine: ajouterJours(lundi, -7) })} className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 hover:bg-[var(--surface-creuse)]" aria-label="Semaine précédente">
            ‹
          </Link>
          <span className="px-2 font-medium capitalize text-[var(--encre-douce)]">
            {titreJour(lundi)} – {titreJour(ajouterJours(lundi, 6))}
          </span>
          <Link href={lien({ semaine: ajouterJours(lundi, 7) })} className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 hover:bg-[var(--surface-creuse)]" aria-label="Semaine suivante">
            ›
          </Link>
        </span>
      </nav>

      {visibles.length === 0 ? (
        <EtatVide titre="Personne dans ce filtre" message="Changez de filtre pour voir le reste de l'équipe." />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Membre</Th>
              <Th>Maintenant</Th>
              {jours.map((j) => (
                <Th key={j}>
                  <span className={`capitalize ${j === aujourdhui ? "text-marque-600" : ""}`}>{titreJour(j)}</span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => (
              <tr key={l.userId} className="align-top">
                <Td>
                  <span className="flex items-center gap-2">
                    <Avatar nom={l.nom} className="size-8 text-[11px]" />
                    {gere ? (
                      <Link href={`/planning?pour=${l.userId}`} className="font-medium hover:underline">
                        {l.nom}
                      </Link>
                    ) : (
                      <span className="font-medium">{l.nom}</span>
                    )}
                  </span>
                </Td>
                <Td>
                  <PastilleStatut libelle={l.etat.libelle} couleur={l.etat.couleur} />
                  {(l.jusqua || l.etat.creneau?.lieu) && (
                    <span className="mt-1 block text-[11px] text-[var(--encre-faible)]">
                      {l.jusqua && (l.etat.statut === "hors_horaires" ? `Reprise ${l.jusqua}` : `Jusqu'à ${l.jusqua}`)}
                      {l.etat.creneau?.lieu && ` · ${l.etat.creneau.lieu}`}
                    </span>
                  )}
                  {l.etat.creneau?.origine && (
                    <span className="mt-0.5 block text-[11px] text-[var(--encre-faible)]">
                      {l.etat.creneau.origine.lien ? (
                        <Link href={l.etat.creneau.origine.lien} className="hover:underline">
                          {libelleOrigine(l.etat.creneau.origine)}
                        </Link>
                      ) : (
                        libelleOrigine(l.etat.creneau.origine)
                      )}
                    </span>
                  )}
                </Td>
                {l.jours.map((j) => (
                  <td key={j.jour} className={`min-w-28 border-b border-[var(--filet)] px-2 py-2 ${j.jour === aujourdhui ? "bg-marque-50/40" : ""}`}>
                    {j.blocs.length === 0 ? (
                      <span className="text-[11px] text-[var(--encre-faible)]">{j.horaires ?? "—"}</span>
                    ) : (
                      <ul className="space-y-1">
                        {j.blocs.map((b) => {
                          const contenu = (
                            <>
                              <span className="chiffres block text-[10px] text-[var(--encre-faible)]">
                                {minutesEnHeure(b.debutMinutes)}–{minutesEnHeure(b.finMinutes)}
                              </span>
                              <span className="block truncate text-[11px] font-semibold">{STATUTS[b.statut].libelle}</span>
                              {b.origine && <span className="block truncate text-[10px] text-[var(--encre-faible)]">{libelleOrigine(b.origine)}</span>}
                            </>
                          );
                          const titre = [b.origine && libelleOrigine(b.origine), b.lieu].filter(Boolean).join(" · ") || undefined;
                          return (
                            <li
                              key={b.id}
                              className={`rounded border-l-[3px] bg-[var(--surface-creuse)] px-1.5 py-0.5 ${b.origine ? "border-dashed" : ""}`}
                              style={{ borderLeftColor: STATUTS[b.statut].couleur }}
                              title={titre}
                            >
                              {b.origine?.lien ? (
                                <Link href={b.origine.lien} className="block hover:underline">
                                  {contenu}
                                </Link>
                              ) : (
                                contenu
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
