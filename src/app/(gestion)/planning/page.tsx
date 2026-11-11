import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";
import { anniversairesDuMois } from "@/modules/personnes/anniversaires";
import { personnesAnniversaire } from "@/modules/personnes/anniversaires-annonces";
import { ajouterJours, jourLocal } from "@/modules/presences/calcul";
import { bornesMois, bornesSemaine, creneauAffiche, etatAffiche, moisAffiche, moisDe, moisValide, moisVoisin, semaineAffichee, titreJour, titreMois } from "@/modules/planning/affichage";
import { etatActuel, lundiDe } from "@/modules/planning/calcul";
import { fuseauEntreprise, horairesDe, membresPlanning, planningSur } from "@/modules/planning/requetes";

import { CarteStatut, ChoixMembre, Mois, Semaine } from "./composants";

export const metadata: Metadata = { title: "Planning" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mon planning : le statut de maintenant, posé en un geste, et les créneaux
 * du mois — du 1er au dernier jour — ou de la semaine. Qui gère le planning
 * de tous choisit la personne en haut.
 *
 * Congés accordés, missions confiées et réunions programmées s'y inscrivent
 * d'eux-mêmes, en lecture : ils se corrigent dans leur module.
 */
export default async function PagePlanning({ searchParams }: PageProps<"/planning">) {
  const session = await exigerEntreprise();
  const { pour, semaine, mois: moisDemande, vue: vueDemandee } = await searchParams;
  const droits = await droitsActifs();
  const gere = droits.has("planning.gerer");

  const [fuseau, membres] = await Promise.all([fuseauEntreprise(session.organizationId), gere ? membresPlanning(session.organizationId) : Promise.resolve([])]);
  const autre = gere && typeof pour === "string" && UUID.test(pour) ? membres.find((m) => m.userId === pour && m.userId !== session.userId) : undefined;
  const cible = autre?.userId ?? session.userId;

  const maintenant = new Date();
  const aujourdhui = jourLocal(maintenant, fuseau);
  // Le mois par défaut ; la semaine reste à un clic, et un lien vers une semaine précise l'ouvre d'office.
  const vue = vueDemandee === "semaine" || (vueDemandee !== "mois" && typeof semaine === "string" && DATE_ISO.test(semaine)) ? "semaine" : "mois";
  const lundi = lundiDe(typeof semaine === "string" && DATE_ISO.test(semaine) ? semaine : aujourdhui);
  const mois = moisValide(moisDemande) ?? moisDe(vue === "semaine" ? lundi : aujourdhui);
  const { du, au } = vue === "mois" ? bornesMois(mois, fuseau) : bornesSemaine(lundi, fuseau);

  // La semaine affichée, plus ce qui est en cours et ce qui suit, pour le statut de maintenant.
  const horizon = new Date(maintenant.getTime() + 8 * 86_400_000);
  const [creneaux, horaires] = await Promise.all([
    planningSur(session.organizationId, du < maintenant ? du : maintenant, au > horizon ? au : horizon, [cible], { userId: session.userId, droits }, fuseau, maintenant),
    horairesDe(session.organizationId, [cible]),
  ]);
  const plages = horaires.get(cible) ?? [];
  const etat = etatAffiche(etatActuel(maintenant, creneaux, plages, fuseau), maintenant, fuseau);

  const base: Record<string, string> = autre ? { pour: autre.userId } : {};
  const lien = (s: string) => `/planning?${new URLSearchParams({ ...base, vue: "semaine", semaine: s })}`;
  const lienMois = (m: string) => `/planning?${new URLSearchParams({ ...base, vue: "mois", mois: m })}`;
  const semaines = vue === "mois" ? moisAffiche(mois, aujourdhui, creneaux, plages, fuseau) : [];
  // Les anniversaires du mois s'inscrivent au calendrier : tous pour la direction, ceux qui l'ont choisi pour les autres.
  const anniversaires =
    vue === "mois" && moduleOuvert("personnes")
      ? Object.fromEntries(
          [...anniversairesDuMois(await personnesAnniversaire(session.organizationId, { direction: droits.has("personnes.salarie.gerer") }), mois)].map(([jour, liste]) => [jour, liste.map((p) => p.nom)]),
        )
      : {};
  const lienSemaine = Object.fromEntries(semaines.flat().flatMap((j) => (j ? [[j.jour, lien(lundiDe(j.jour))]] : [])));
  const bouton = "rounded-lg border border-[var(--filet)] px-3 py-1.5 hover:bg-[var(--surface-creuse)]";

  return (
    <>
      <EnTetePage
        titre={autre ? `Planning de ${autre.nom}` : "Mon planning"}
        sousTitre="Dites où vous êtes : l'équipe sait qui joindre, et quand."
        actions={gere ? <ChoixMembre membres={membres} actuel={cible} moi={session.userId} base="/planning" /> : undefined}
      />

      <CarteStatut etat={etat} pourUserId={autre?.userId ?? null} nom={autre?.nom ?? null} aujourdhui={aujourdhui} />

      <nav aria-label={vue === "mois" ? "Mois" : "Semaine"} className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <div role="group" aria-label="Affichage" className="flex rounded-lg border border-[var(--filet)] p-0.5">
          {(["mois", "semaine"] as const).map((v) => (
            <Link
              key={v}
              href={v === "mois" ? lienMois(vue === "semaine" ? moisDe(lundi) : mois) : lien(vue === "mois" ? lundiDe(mois === moisDe(aujourdhui) ? aujourdhui : `${mois}-01`) : lundi)}
              aria-current={vue === v ? "page" : undefined}
              className={`rounded-md px-3 py-1 ${vue === v ? "bg-marque-600 font-semibold text-white" : "hover:bg-[var(--surface-creuse)]"}`}
            >
              {v === "mois" ? "Mois" : "Semaine"}
            </Link>
          ))}
        </div>
        {vue === "mois" ? (
          <>
            <Link href={lienMois(moisVoisin(mois, -1))} className={bouton}>
              ‹ Mois précédent
            </Link>
            <Link href={lienMois(moisDe(aujourdhui))} className={bouton}>
              Ce mois-ci
            </Link>
            <Link href={lienMois(moisVoisin(mois, 1))} className={bouton}>
              Mois suivant ›
            </Link>
            <span className="ml-auto font-semibold capitalize text-[var(--encre-douce)]">{titreMois(mois)}</span>
          </>
        ) : (
          <>
            <Link href={lien(ajouterJours(lundi, -7))} className={bouton}>
              ‹ Semaine précédente
            </Link>
            <Link href={lien(lundiDe(aujourdhui))} className={bouton}>
              Cette semaine
            </Link>
            <Link href={lien(ajouterJours(lundi, 7))} className={bouton}>
              Semaine suivante ›
            </Link>
            <span className="ml-auto font-medium text-[var(--encre-douce)]">
              Du {titreJour(lundi)} au {titreJour(ajouterJours(lundi, 6))}
            </span>
          </>
        )}
      </nav>

      {vue === "mois" ? (
        <Mois
          semaines={semaines}
          creneaux={creneaux.filter((c) => !c.origine).map((c) => creneauAffiche(c, fuseau))}
          pourUserId={autre?.userId ?? null}
          lienSemaine={lienSemaine}
          anniversaires={anniversaires}
        />
      ) : (
        <Semaine
          jours={semaineAffichee(lundi, aujourdhui, creneaux, plages, fuseau)}
          creneaux={creneaux.filter((c) => !c.origine).map((c) => creneauAffiche(c, fuseau))}
          pourUserId={autre?.userId ?? null}
        />
      )}
    </>
  );
}
