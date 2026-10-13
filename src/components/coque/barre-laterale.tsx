"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconeCadenas } from "@/components/ui/icone-cadenas";
import { seDeconnecter } from "@/lib/auth/actions";
import type { Droit } from "@/lib/droits/catalogue";
import { groupesVisibles, raccourcisCompte, type CleIcone, type EntreeModule } from "@/lib/navigation";

import { IconeModule } from "./icone-module";
import { SignatureMaria } from "./signature";
import { verrouillerMaintenant } from "./verrou-inactivite";

/** Hors groupes : l'accueil et le tableau de bord les traversent tous. */
const ACCUEILS: { href: string; libelle: string; icone: CleIcone }[] = [
  { href: "/accueil", libelle: "Accueil", icone: "accueil" },
  { href: "/", libelle: "Tableau de bord", icone: "tableau-de-bord" },
];

/**
 * Barre latérale de navigation.
 *
 * Reprend la disposition des tableaux de bord Vercel et Supabase : liste
 * verticale groupée, repliable, et menu de compte en PIED de barre — pas en
 * tête. Le compte est ce qu'on ouvre le moins souvent ; lui donner la place la
 * plus visible la retire aux modules.
 *
 * Un groupe replié le reste d'un écran à l'autre. Quelqu'un qui ne fait jamais
 * de comptabilité replie Finance une fois et ne la revoit plus.
 */
export function BarreLaterale({
  nomUtilisateur,
  entrepriseActive,
  droits,
  modulesOuverts,
}: {
  nomUtilisateur: string;
  entrepriseActive: string | null;
  /**
   * Droits de la session, calculés sur le serveur. La barre ne montre que ce
   * qui s'ouvre : proposer une entrée qui refuse ensuite l'entrée est une
   * promesse rompue à chaque clic.
   *
   * Ce filtrage est du confort, pas une protection — chaque module vérifie son
   * droit de son côté.
   */
  droits: Droit[];
  /**
   * Modules ouverts sur cette instance, calculés eux aussi sur le serveur.
   *
   * Un droit accordé ne suffit pas à afficher une entrée : le rôle de gérant
   * porte « consulter les réservations » depuis le premier jour, bien avant
   * que le module ne lise autre chose qu'un jeu d'essai. Sans ce second
   * filtre, la barre annonce dix modules et le client en trouve quatre qui
   * fonctionnent.
   */
  modulesOuverts: string[];
}) {
  const chemin = usePathname();
  const [replies, setReplies] = useState<string[]>([]);
  const accordes = new Set(droits);
  const groupes = groupesVisibles(droits, modulesOuverts);

  function basculerGroupe(titre: string) {
    setReplies((actuels) =>
      actuels.includes(titre)
        ? actuels.filter((t) => t !== titre)
        : [...actuels, titre],
    );
  }

  return (
    <nav
      aria-label="Modules"
      className="nav-sombre flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--filet)] bg-[var(--surface)] px-3 py-2 lg:w-56 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-2.5 lg:py-3"
    >
      <div className="contents lg:mb-2 lg:block">
        {ACCUEILS.map((entree) => (
          <Link
            key={entree.href}
            href={entree.href}
            aria-current={chemin === entree.href ? "page" : undefined}
            className={`h-cible flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium lg:w-full ${
              chemin === entree.href
                ? "bg-marque-600 text-white"
                : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
            }`}
          >
            <IconeModule cle={entree.icone} className="size-[18px] shrink-0" />
            {entree.libelle}
          </Link>
        ))}
      </div>

      {groupes.map((groupe) => {
        const visibles: EntreeModule[] = groupe.modules;

        const replie = replies.includes(groupe.titre);
        // Un groupe qui contient la page courante ne se laisse pas replier :
        // masquer l'entrée active laisserait l'utilisateur sans repère.
        const contientActif = visibles.some((m) => chemin.startsWith(m.racine));

        return (
          <div key={groupe.titre} className="contents lg:mb-2 lg:block">
            <button
              type="button"
              onClick={() => basculerGroupe(groupe.titre)}
              aria-expanded={!replie || contientActif}
              className="mb-0.5 hidden w-full items-center justify-between rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)] lg:flex"
            >
              {groupe.titre}
              <span
                className={`transition-transform ${replie && !contientActif ? "" : "rotate-90"}`}
                aria-hidden
              >
                ›
              </span>
            </button>

            {(!replie || contientActif) &&
              visibles.map((module) => {
                const actif = chemin.startsWith(module.racine);
                return (
                  <Link
                    key={module.href}
                    href={module.href}
                    aria-current={actif ? "page" : undefined}
                    className={`h-cible flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium lg:w-full ${
                      actif
                        ? "bg-marque-600 text-white"
                        : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
                    }`}
                  >
                    <IconeModule cle={module.icone} className="size-[18px] shrink-0" />
                    {module.libelle}
                  </Link>
                );
              })}
          </div>
        );
      })}

      <div className="ml-auto flex items-center gap-1 lg:ml-0 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-2 lg:pt-3">
        {accordes.has("pos.vente.encaisser") && (
          <Link
            href="/caisse"
            className="h-cible flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-marque-600 px-3 text-sm font-semibold text-marque-600 hover:bg-marque-600 hover:text-white lg:w-full"
          >
            <IconeModule cle="caisse" className="size-[18px] shrink-0" />
            Ouvrir la caisse
          </Link>
        )}

        <MenuCompte
          gereLesMembres={accordes.has("organisation.membre.gerer")}
          raccourcis={raccourcisCompte(modulesOuverts)}
          nomUtilisateur={nomUtilisateur}
          entrepriseActive={entrepriseActive}
        />
        <SignatureMaria className="hidden px-2 lg:block" />
      </div>
    </nav>
  );
}

/**
 * Menu de compte, en pied de barre.
 *
 * Regroupe ce qui relève de la personne et non du métier : préférences, aide,
 * déconnexion. Le thème y figure parce qu'une caisse en plein soleil et un
 * bureau climatisé n'ont pas les mêmes besoins de contraste.
 */
export function MenuCompte({
  nomUtilisateur,
  entrepriseActive,
  gereLesMembres,
  raccourcis,
  ouverture = "haut",
}: {
  nomUtilisateur: string;
  entrepriseActive: string | null;
  /** Ouvre l'entrée « Membres et accès ». Le droit se revérifie côté serveur. */
  gereLesMembres: boolean;
  /** Raccourcis vers les modules ouverts, filtrés par l'appelant. */
  raccourcis: { href: string; libelle: string }[];
  /** `haut` en pied de barre latérale ; `bas` dans un coin d'écran, comme sur l'accueil. */
  ouverture?: "haut" | "bas";
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    function auClic(evenement: MouseEvent) {
      if (!conteneur.current?.contains(evenement.target as Node)) setOuvert(false);
    }
    function auClavier(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") setOuvert(false);
    }
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  /**
   * Clair par défaut : sans choix enregistré, la page est claire. « Auto »
   * suit le téléphone, mais seulement si on le demande.
   */
  function changerTheme(theme: "light" | "dark" | "auto") {
    const racine = document.documentElement;
    if (theme === "light") {
      racine.removeAttribute("data-theme");
      localStorage.removeItem("maria-theme");
    } else {
      racine.setAttribute("data-theme", theme);
      localStorage.setItem("maria-theme", theme);
    }
  }

  const initiales = nomUtilisateur
    .split(" ")
    .map((mot) => mot.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={conteneur} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        className="flex h-cible w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--surface-creuse)]"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marque-600 text-[11px] font-bold text-white">
          {initiales}
        </span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-xs font-medium">
            {nomUtilisateur}
          </span>
          <span className="block truncate text-[11px] text-[var(--encre-faible)]">
            {entrepriseActive ?? "Aucune entreprise"}
          </span>
        </span>
      </button>

      {ouvert && (
        <div
          role="menu"
          className={`absolute z-50 overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-lg ${
            ouverture === "haut" ? "bottom-full left-0 mb-1 w-60 lg:right-0 lg:w-auto" : "right-0 top-full mt-1 w-64"
          }`}
        >
          <div className="border-b border-[var(--filet)] px-3 py-2.5">
            <p className="truncate text-sm font-medium">{nomUtilisateur}</p>
            <p className="truncate text-xs text-[var(--encre-faible)]">
              {entrepriseActive ?? "Aucune entreprise"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[var(--filet)] px-3 py-2">
            <span className="text-sm">Thème</span>
            <span className="flex gap-1">
              {(
                [
                  ["light", "Clair"],
                  ["dark", "Sombre"],
                  ["auto", "Auto"],
                ] as const
              ).map(([valeur, libelle]) => (
                <button
                  key={valeur}
                  type="button"
                  onClick={() => changerTheme(valeur)}
                  className="rounded border border-[var(--filet)] px-1.5 py-0.5 text-[11px] hover:bg-[var(--surface-creuse)]"
                >
                  {libelle}
                </button>
              ))}
            </span>
          </div>

          <ul className="p-1">
            {[
              ...raccourcis,
              // Les accès se règlent depuis le compte, pas depuis un module :
              // ce n'est pas une activité de l'entreprise, c'est son
              // administration.
              ...(gereLesMembres
                ? [{ href: "/membres", libelle: "Utilisateurs et accès" }]
                : []),
            ].map((entree) => (
              <li key={entree.href}>
                <Link
                  href={entree.href}
                  onClick={() => setOuvert(false)}
                  className="block rounded-lg px-2.5 py-2 text-sm hover:bg-[var(--surface-creuse)]"
                >
                  {entree.libelle}
                </Link>
              </li>
            ))}
          </ul>

          {/* Verrouiller garde la session et la page : on s'éloigne un moment,
              on revient en ressaisissant son mot de passe. */}
          <div className="border-t border-[var(--filet)] p-1">
            <button
              type="button"
              onClick={() => {
                setOuvert(false);
                verrouillerMaintenant();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[var(--surface-creuse)]"
            >
              <IconeCadenas />
              Verrouiller
            </button>
          </div>

          <form action={seDeconnecter} className="border-t border-[var(--filet)] p-1">
            <button
              type="submit"
              className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
