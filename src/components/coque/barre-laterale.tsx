"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Droit } from "@/lib/droits/catalogue";
import { entreeCourante, groupesVisibles, raccourcisCompte, type CleIcone } from "@/lib/navigation";

import { IconeModule } from "./icone-module";
import { MenuCompte } from "./menu-compte";
import { RechercheGlobale } from "./recherche-globale";

interface Entree {
  href: string;
  racine: string;
  libelle: string;
  icone: CleIcone;
}

interface Section {
  cle: string;
  titre: string;
  entrees: Entree[];
}

/**
 * L'accueil et le tableau de bord ouvrent le Pilotage : ils ne sont le module
 * de personne, et chacun y a accès.
 */
const ENTREES_PILOTAGE: Entree[] = [
  { href: "/accueil", racine: "/accueil", libelle: "Accueil", icone: "maison" },
  { href: "/", racine: "/", libelle: "Tableau de bord", icone: "tableau-de-bord" },
];

/**
 * Sections visibles par la session. Le Pilotage existe toujours ; un autre
 * domaine sans module ouvert disparaît : un intertitre seul n'informe de rien.
 */
function sectionsVisibles(droits: Droit[], modulesOuverts: string[]): Section[] {
  const groupes = groupesVisibles(droits, modulesOuverts);
  const pilotage = groupes.find((g) => g.cle === "pilotage");
  return [
    { cle: "pilotage", titre: "Pilotage", entrees: [...ENTREES_PILOTAGE, ...(pilotage?.modules ?? [])] },
    ...groupes.filter((g) => g.cle !== "pilotage").map((g) => ({ cle: g.cle, titre: g.titre, entrees: g.modules })),
  ];
}

/** La marque, sur une carte blanche en tête de barre : le logo en couleurs y garde son or et son bleu. */
function Marque() {
  return (
    <Link
      href="/accueil"
      aria-label="MARIA GROUP — accueil"
      className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 shadow-sm"
    >
      <Image src="/marque/icone-couleur-detouree.png" alt="" width={230} height={237} unoptimized className="size-9 shrink-0" />
      <span className="min-w-0 leading-tight">
        <span className="block whitespace-nowrap text-[13px] font-bold tracking-[0.12em] text-nuit-profond">MARIA GROUP</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-or-700">Maria Suite</span>
      </span>
    </Link>
  );
}

/** Les sections et leurs entrées : le même contenu dans la barre fixe et dans le tiroir du téléphone. */
function ListeSections({ sections, onChoisir }: { sections: Section[]; onChoisir?: () => void }) {
  const chemin = usePathname();
  const courante = entreeCourante(chemin, sections.flatMap((s) => s.entrees));

  return (
    <nav aria-label="Modules" className="flex flex-col gap-4">
      {sections.map((s) => (
        <div key={s.cle}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--encre-faible)]">{s.titre}</p>
          <ul className="flex flex-col gap-0.5">
            {s.entrees.map((e) => {
              const actif = e.href === courante;
              return (
                <li key={e.href}>
                  <Link
                    href={e.href}
                    onClick={onChoisir}
                    aria-current={actif ? "page" : undefined}
                    // L'entrée courante peut être loin dans la liste (Archives, Administration) : on l'amène à l'écran.
                    ref={actif ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      actif
                        ? "bg-or font-semibold text-white shadow-sm"
                        : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-white"
                    }`}
                  >
                    <IconeModule cle={e.icone} className="size-[18px] shrink-0" />
                    <span className="min-w-0 truncate">{e.libelle}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Barre latérale des écrans de gestion, sur grand écran.
 *
 * Bleu nuit de la charte, la marque en tête sur une carte blanche, puis
 * chaque domaine en intertitre et ses entrées en dessous. L'entrée courante
 * passe en or MARIA, texte blanc. Seule la liste défile : la marque reste en place.
 */
export function BarreLaterale({ droits, modulesOuverts }: { droits: Droit[]; modulesOuverts: string[] }) {
  const sections = sectionsVisibles(droits, modulesOuverts);
  return (
    <aside className="nav-sombre barre-laterale hidden w-64 shrink-0 flex-col lg:flex">
      <div className="shrink-0 p-3">
        <Marque />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1">
        <ListeSections sections={sections} />
      </div>
    </aside>
  );
}

/**
 * En-tête clair au-dessus du contenu : le contexte de travail à gauche, la
 * recherche au centre, les outils et le compte à droite.
 *
 * Sur téléphone, la barre latérale n'a pas la place : un bouton l'ouvre en
 * tiroir depuis le bord gauche, d'où elle vient sur grand écran.
 */
export function EnTete({
  droits,
  modulesOuverts,
  nomUtilisateur,
  entrepriseActive,
  contexte,
  outils,
}: {
  /** Droits de la session : la barre ne montre que ce qui s'ouvre. Du confort, pas une protection. */
  droits: Droit[];
  /** Modules ouverts sur l'instance : un droit accordé ne suffit pas à afficher un module coupé. */
  modulesOuverts: string[];
  nomUtilisateur: string;
  entrepriseActive: string | null;
  /** Entreprise et exercice, à gauche. */
  contexte?: ReactNode;
  /** Calculette, cloche : rendus par la coque, posés à droite. */
  outils?: ReactNode;
}) {
  const chemin = usePathname();
  // Le tiroir retient la page sur laquelle il s'est ouvert : changer de page
  // le referme de lui-même, sans effet à synchroniser.
  const [ouvertSur, setOuvertSur] = useState<string | null>(null);
  const tiroirOuvert = ouvertSur === chemin;

  useEffect(() => {
    if (!tiroirOuvert) return;
    function auClavier(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") setOuvertSur(null);
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [tiroirOuvert]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--filet)] bg-[var(--surface)] px-2 sm:px-4 lg:px-6">
      <button
        type="button"
        onClick={() => setOuvertSur(chemin)}
        aria-label="Ouvrir le menu"
        aria-expanded={tiroirOuvert}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--encre)] hover:bg-[var(--surface-creuse)] lg:hidden"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <Link href="/accueil" aria-label="MARIA GROUP — accueil" className="shrink-0 lg:hidden">
        <Image src="/marque/icone-couleur-detouree.png" alt="" width={230} height={237} unoptimized className="size-8" />
      </Link>

      <div className="hidden min-w-0 shrink items-center md:flex">{contexte}</div>

      <div className="flex min-w-0 flex-1 justify-end xl:justify-center">
        <RechercheGlobale />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {outils}
        <MenuCompte
          ouverture="bas"
          nomUtilisateur={nomUtilisateur}
          entrepriseActive={entrepriseActive}
          gereLesMembres={droits.includes("organisation.membre.gerer")}
          raccourcis={raccourcisCompte(modulesOuverts)}
        />
      </div>

      {tiroirOuvert && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fermer le menu" onClick={() => setOuvertSur(null)} className="absolute inset-0 bg-black/50" />
          <div className="nav-sombre barre-laterale absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-xl">
            <div className="shrink-0 p-3">
              <Marque />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1">
              <ListeSections sections={sectionsVisibles(droits, modulesOuverts)} onChoisir={() => setOuvertSur(null)} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
