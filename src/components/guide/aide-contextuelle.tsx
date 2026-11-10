"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { aideDe, type CheminAide } from "@/modules/guide/regles";

/**
 * Le « ? » de la barre du haut : il ouvre, dans le guide, la section qui
 * explique l'écran affiché — ou le sommaire du guide, sur un écran qu'aucun
 * chapitre ne couvre.
 */
export function AideContextuelle({ aides }: { aides: CheminAide[] }) {
  const chemin = usePathname();
  if (chemin.startsWith("/guide")) return null;
  return (
    <Link
      href={aideDe(chemin, aides)}
      title="Aide sur cet écran"
      aria-label="Aide sur cet écran"
      className="flex size-9 items-center justify-center rounded-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M9.5 9.3a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.6" />
        <path d="M12 16.8v.2" />
      </svg>
    </Link>
  );
}
