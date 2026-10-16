"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Droit } from "@/lib/droits/catalogue";
import { domaineDe, groupesVisibles, raccourcisCompte, relevDe, type CleIcone, type EntreeModule } from "@/lib/navigation";

import { IconeModule } from "./icone-module";
import { MenuCompte } from "./menu-compte";
import { RechercheGlobale } from "./recherche-globale";

/** Le tableau de bord ouvre le Pilotage : il n'est le module de personne, et chacun y a accès. */
const TABLEAU_DE_BORD: Pick<EntreeModule, "href" | "racine" | "libelle"> = { href: "/", racine: "/", libelle: "Tableau de bord" };

interface Domaine {
  cle: string;
  court: string;
  titre: string;
  icone: CleIcone;
  /** Le premier onglet du domaine : là où mène un clic sur la barre. */
  href: string;
  onglets: Pick<EntreeModule, "href" | "racine" | "libelle">[];
}

/**
 * Domaines visibles par la session, chacun avec ses onglets de section.
 *
 * Le Pilotage existe toujours, puisque le tableau de bord est ouvert à tous ;
 * un autre domaine sans module ouvert disparaît.
 */
export function domainesVisibles(droits: Droit[], modulesOuverts: string[]): Domaine[] {
  const groupes = groupesVisibles(droits, modulesOuverts);
  const pilotage = groupes.find((g) => g.cle === "pilotage");
  const domaines: Domaine[] = [
    {
      cle: "pilotage",
      court: "Pilotage",
      titre: "Pilotage",
      icone: "tableau-de-bord",
      href: "/",
      onglets: [TABLEAU_DE_BORD, ...(pilotage?.modules ?? [])],
    },
  ];
  for (const g of groupes) {
    if (g.cle === "pilotage") continue;
    domaines.push({ cle: g.cle, court: g.court, titre: g.titre, icone: g.icone, href: g.modules[0].href, onglets: g.modules });
  }
  return domaines;
}

/**
 * Barre du haut des écrans de gestion : la marque, les domaines, les outils.
 *
 * Disposition reprise de Ferme360 : une rangée de domaines à icône, le domaine
 * courant posé sur une pastille d'or — l'or de la charte, sur le bleu nuit,
 * seul endroit où il porte du texte. Plus de barre latérale : la largeur
 * entière revient aux tableaux.
 *
 * Les domaines sont espacés et centrés entre la marque et les outils. Sur un
 * écran trop étroit pour tous, seule leur rangée défile. Les outils et le
 * menu de compte restent dehors : leurs menus déroulants seraient coupés par
 * un conteneur qui défile.
 */
export function BarreDomaines({
  droits,
  modulesOuverts,
  nomUtilisateur,
  entrepriseActive,
  outils,
}: {
  /** Droits de la session : la barre ne montre que ce qui s'ouvre. Du confort, pas une protection. */
  droits: Droit[];
  /** Modules ouverts sur l'instance : un droit accordé ne suffit pas à afficher un module coupé. */
  modulesOuverts: string[];
  nomUtilisateur: string;
  entrepriseActive: string | null;
  /** Calculette, cloche : rendus par la coque, posés à droite. */
  outils?: ReactNode;
}) {
  const chemin = usePathname();
  const domaines = domainesVisibles(droits, modulesOuverts);
  const actif = domaineDe(chemin, groupesVisibles(droits, modulesOuverts));

  return (
    <header className="nav-sombre barre-haut flex shrink-0 items-center gap-1.5 px-2 py-1.5 sm:px-3">
      <Link href="/accueil" aria-label="MARIA GROUP — accueil" className="flex shrink-0 items-center gap-2.5 pr-1 2xl:pr-3">
        <Image
          src="/marque/icone-blanc-or-detouree.png"
          alt=""
          width={230}
          height={237}
          unoptimized
          className="size-9 shrink-0 rounded-lg"
        />
        <span className="hidden min-w-0 leading-tight 2xl:block">
          <span className="block whitespace-nowrap text-[13px] font-bold tracking-[0.12em] text-white">MARIA GROUP</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-or">Maria Suite</span>
        </span>
      </Link>

      <span className="hidden h-8 w-px shrink-0 bg-[var(--filet)] 2xl:block" aria-hidden />

      {/* Centrée tant qu'elle tient ; collée à gauche dès qu'elle défile, sinon le début serait coupé. */}
      <nav aria-label="Domaines" className="flex min-w-0 flex-1 items-stretch justify-center-safe gap-1.5 overflow-x-auto">
        {/* L'accueil n'est pas un domaine : il les présente tous, en grille. */}
        <Link
          href="/accueil"
          title="Accueil : tous les modules"
          className="flex min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-bold uppercase whitespace-nowrap text-[var(--encre-douce)] transition-colors hover:bg-[var(--surface-creuse)] hover:text-white 2xl:px-3"
        >
          <IconeModule cle="maison" className="size-5 shrink-0" />
          Accueil
        </Link>
        {domaines.map((d) => {
          const courant = d.cle === actif;
          return (
            <Link
              key={d.cle}
              href={d.href}
              title={d.titre}
              aria-current={courant ? "page" : undefined}
              className={`flex min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-bold uppercase whitespace-nowrap 2xl:px-3 transition-colors ${
                courant
                  ? "bg-or text-nuit-profond shadow-sm"
                  : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-white"
              }`}
            >
              <IconeModule cle={d.icone} className="size-5 shrink-0" />
              {d.court}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        <RechercheGlobale />
        {entrepriseActive && (
          <span className="hidden whitespace-nowrap rounded-full border border-[var(--filet)] bg-[var(--surface-creuse)] px-3 py-1 text-[11px] font-semibold 2xl:inline">
            {entrepriseActive}
          </span>
        )}
        {outils}
        <MenuCompte
          compact
          ouverture="bas"
          nomUtilisateur={nomUtilisateur}
          entrepriseActive={entrepriseActive}
          gereLesMembres={droits.includes("organisation.membre.gerer")}
          raccourcis={raccourcisCompte(modulesOuverts)}
        />
      </div>
    </header>
  );
}

/**
 * Onglets de section : les modules du domaine courant, sur fond clair, sous la
 * barre du haut. Le contexte de travail — entreprise, exercice — se range à
 * droite.
 *
 * Une page hors de toute carte (mot de passe, fiche isolée) garde la rangée,
 * vide d'onglets : la hauteur ne saute pas d'un écran à l'autre.
 */
export function OngletsSection({
  droits,
  modulesOuverts,
  contexte,
}: {
  droits: Droit[];
  modulesOuverts: string[];
  contexte?: ReactNode;
}) {
  const chemin = usePathname();
  const domaines = domainesVisibles(droits, modulesOuverts);
  const actif = domaineDe(chemin, groupesVisibles(droits, modulesOuverts));
  const domaine = domaines.find((d) => d.cle === actif);
  // L'onglet le plus précis : sur /tresorerie/caisse, « Bons » et non « Trésorerie ».
  const courante = domaine?.onglets
    .filter((o) => relevDe(chemin, o.racine))
    .sort((a, b) => b.racine.length - a.racine.length)[0]?.href;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--filet)] bg-[var(--surface)] px-3 py-1.5 print:hidden">
      <nav aria-label={domaine ? `Sections — ${domaine.titre}` : "Sections"} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {domaine?.onglets.map((o) => {
          const courant = o.href === courante;
          return (
            <Link
              key={o.href}
              href={o.href}
              aria-current={courant ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
                courant
                  ? "bg-marque-50 text-marque-600"
                  : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]"
              }`}
            >
              {o.libelle}
            </Link>
          );
        })}
      </nav>
      {contexte && <div className="ml-auto hidden shrink-0 items-center md:flex">{contexte}</div>}
    </div>
  );
}
