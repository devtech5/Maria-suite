"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const Loupe = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

/**
 * Champ de recherche de la barre du haut : un formulaire GET vers
 * `/recherche`, qui marche sans JavaScript et se partage par lien.
 *
 * Ctrl+K (⌘K) ou « / » y place le curseur depuis n'importe quel écran,
 * sauf pendant une saisie. Sur un écran étroit, le champ cède la place à
 * une loupe qui ouvre la page de recherche.
 */
export function RechercheGlobale() {
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const enSaisie = !!cible && (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName));
      const raccourci = (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !enSaisie);
      if (!raccourci || !champ.current || champ.current.offsetParent === null) return;
      e.preventDefault();
      champ.current.focus();
      champ.current.select();
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, []);

  return (
    <>
      <form role="search" method="get" action="/recherche" className="relative hidden lg:block">
        <Loupe className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--encre-faible)]" />
        <input
          ref={champ}
          type="search"
          name="q"
          maxLength={80}
          placeholder="Rechercher…"
          aria-label="Rechercher dans Maria Suite (Ctrl+K)"
          title="Rechercher dans Maria Suite (Ctrl+K)"
          className="h-9 w-40 rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)] pl-8 pr-2.5 text-sm text-white outline-none placeholder:text-[var(--encre-faible)] focus:w-56 focus:border-or xl:w-48 transition-[width]"
        />
      </form>
      <Link
        href="/recherche"
        aria-label="Rechercher"
        className="flex size-9 items-center justify-center rounded-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)] lg:hidden"
      >
        <Loupe className="size-5" />
      </Link>
    </>
  );
}
