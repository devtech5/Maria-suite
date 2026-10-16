import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { ajouterJours, jourLocal } from "@/modules/presences/calcul";
import { bornesSemaine, creneauAffiche, etatAffiche, semaineAffichee, titreJour } from "@/modules/planning/affichage";
import { etatActuel, lundiDe } from "@/modules/planning/calcul";
import { fuseauEntreprise, horairesDe, membresPlanning, planningSur } from "@/modules/planning/requetes";

import { CarteStatut, ChoixMembre, Semaine } from "./composants";

export const metadata: Metadata = { title: "Planning" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mon planning : le statut de maintenant, posé en un geste, et les créneaux
 * de la semaine. Qui gère le planning de tous choisit la personne en haut.
 *
 * Congés accordés, missions confiées et réunions programmées s'y inscrivent
 * d'eux-mêmes, en lecture : ils se corrigent dans leur module.
 */
export default async function PagePlanning({ searchParams }: PageProps<"/planning">) {
  const session = await exigerEntreprise();
  const { pour, semaine } = await searchParams;
  const droits = await droitsActifs();
  const gere = droits.has("planning.gerer");

  const [fuseau, membres] = await Promise.all([fuseauEntreprise(session.organizationId), gere ? membresPlanning(session.organizationId) : Promise.resolve([])]);
  const autre = gere && typeof pour === "string" && UUID.test(pour) ? membres.find((m) => m.userId === pour && m.userId !== session.userId) : undefined;
  const cible = autre?.userId ?? session.userId;

  const maintenant = new Date();
  const aujourdhui = jourLocal(maintenant, fuseau);
  const lundi = lundiDe(typeof semaine === "string" && DATE_ISO.test(semaine) ? semaine : aujourdhui);
  const { du, au } = bornesSemaine(lundi, fuseau);

  // La semaine affichée, plus ce qui est en cours et ce qui suit, pour le statut de maintenant.
  const horizon = new Date(maintenant.getTime() + 8 * 86_400_000);
  const [creneaux, horaires] = await Promise.all([
    planningSur(session.organizationId, du < maintenant ? du : maintenant, au > horizon ? au : horizon, [cible], { userId: session.userId, droits }, fuseau, maintenant),
    horairesDe(session.organizationId, [cible]),
  ]);
  const plages = horaires.get(cible) ?? [];
  const etat = etatAffiche(etatActuel(maintenant, creneaux, plages, fuseau), maintenant, fuseau);

  const lien = (s: string) => `/planning?${new URLSearchParams({ ...(autre ? { pour: autre.userId } : {}), semaine: s })}`;

  return (
    <>
      <EnTetePage
        titre={autre ? `Planning de ${autre.nom}` : "Mon planning"}
        sousTitre="Dites où vous êtes : l'équipe sait qui joindre, et quand."
        actions={gere ? <ChoixMembre membres={membres} actuel={cible} moi={session.userId} base="/planning" /> : undefined}
      />

      <CarteStatut etat={etat} pourUserId={autre?.userId ?? null} nom={autre?.nom ?? null} />

      <nav aria-label="Semaine" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link href={lien(ajouterJours(lundi, -7))} className="rounded-lg border border-[var(--filet)] px-3 py-1.5 hover:bg-[var(--surface-creuse)]">
          ‹ Semaine précédente
        </Link>
        <Link href={lien(lundiDe(aujourdhui))} className="rounded-lg border border-[var(--filet)] px-3 py-1.5 hover:bg-[var(--surface-creuse)]">
          Cette semaine
        </Link>
        <Link href={lien(ajouterJours(lundi, 7))} className="rounded-lg border border-[var(--filet)] px-3 py-1.5 hover:bg-[var(--surface-creuse)]">
          Semaine suivante ›
        </Link>
        <span className="ml-auto font-medium text-[var(--encre-douce)]">
          Du {titreJour(lundi)} au {titreJour(ajouterJours(lundi, 6))}
        </span>
      </nav>

      <Semaine
        jours={semaineAffichee(lundi, aujourdhui, creneaux, plages, fuseau)}
        creneaux={creneaux.filter((c) => !c.origine).map((c) => creneauAffiche(c, fuseau))}
        pourUserId={autre?.userId ?? null}
      />
    </>
  );
}
