"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface EntreeNav {
  href: string;
  libelle: string;
}

/**
 * Sections d'un module, en pastilles, sous les onglets de section.
 *
 * Troisième niveau de la navigation : domaine en haut, module en onglet,
 * section en pastille. La pastille courante se remplit de la couleur de marque.
 *
 * Cinq entrées au maximum, sans exception. Le concurrent empile un onglet par
 * fonctionnalité ajoutée — vingt-sept en comptabilité, treize en stock, dont
 * un doublon « Alertes » / « Alertes stock ». Passé une dizaine, plus personne
 * ne lit la barre : on cherche au hasard. Une fonction qui n'a pas sa place
 * dans les cinq entrées appartient à l'écran d'une autre, pas à un onglet de
 * plus.
 *
 * Les rapports du module ne sont pas un onglet : un lien à droite de la barre,
 * le même dans chaque module, mène à ceux qui le concernent.
 */
export function SousNavigation({ entrees, rapports }: { entrees: EntreeNav[]; rapports?: string | null }) {
  const chemin = usePathname();

  return (
    <nav
      aria-label="Sections du module"
      className="mb-5 flex items-center gap-2 overflow-x-auto pb-1"
    >
      {entrees.map((entree) => {
        const actif = chemin === entree.href;
        return (
          <Link
            key={entree.href}
            href={entree.href}
            aria-current={actif ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-semibold shadow-sm transition-colors ${
              actif
                ? "border-marque-600 bg-marque-600 text-white"
                : "border-[var(--filet)] bg-[var(--surface)] text-[var(--encre-douce)] hover:border-marque-400 hover:text-[var(--encre)]"
            }`}
          >
            {entree.libelle}
          </Link>
        );
      })}
      {rapports && (
        <Link
          href={rapports}
          className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--filet)] bg-[var(--surface)] px-4 py-1.5 text-[13px] font-semibold text-[var(--encre-douce)] shadow-sm hover:border-marque-400 hover:text-[var(--encre)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          Rapports
        </Link>
      )}
    </nav>
  );
}
