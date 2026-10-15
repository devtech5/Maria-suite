"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { IconeCadenas } from "@/components/ui/icone-cadenas";
import { seDeconnecter } from "@/lib/auth/actions";

import { verrouillerMaintenant } from "./verrou-inactivite";

/**
 * Menu de compte, à droite de la barre du haut.
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
  ouverture = "bas",
  compact = false,
}: {
  nomUtilisateur: string;
  entrepriseActive: string | null;
  /** Ouvre l'entrée « Membres et accès ». Le droit se revérifie côté serveur. */
  gereLesMembres: boolean;
  /** Raccourcis vers les modules ouverts, filtrés par l'appelant. */
  raccourcis: { href: string; libelle: string }[];
  /** `bas` sous la barre du haut ou dans un coin d'écran ; `haut` s'il est posé en pied de page. */
  ouverture?: "haut" | "bas";
  /** Les initiales seules, sans le nom : la barre du haut n'a pas la place. */
  compact?: boolean;
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
        className={`flex h-cible items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--surface-creuse)] ${compact ? "" : "w-full"}`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marque-600 text-[11px] font-bold text-white">
          {initiales}
        </span>
        <span className={compact ? "sr-only" : "hidden min-w-0 flex-1 lg:block"}>
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
