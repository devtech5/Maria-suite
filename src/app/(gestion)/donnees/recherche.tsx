import { CLASSE_CHAMP } from "@/components/ui/primitives";

/** Recherche par l'adresse : le formulaire part en GET, la page se recharge filtrée, même sans JavaScript. */
export function FormulaireRecherche({
  chemin,
  valeur,
  placeholder,
  caches = {},
}: {
  chemin: string;
  valeur: string;
  placeholder: string;
  /** Paramètres à garder (corbeille, filtre). */
  caches?: Record<string, string>;
}) {
  return (
    <form action={chemin} method="get" className="mb-4 flex flex-wrap gap-2">
      {Object.entries(caches).map(([nom, v]) => (
        <input key={nom} type="hidden" name={nom} value={v} />
      ))}
      <input name="q" defaultValue={valeur} placeholder={placeholder} aria-label="Rechercher" className={`${CLASSE_CHAMP} min-w-0 flex-1 sm:max-w-md`} />
      <button type="submit" className="h-cible rounded-lg border border-[var(--filet)] px-4 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
        Rechercher
      </button>
    </form>
  );
}
