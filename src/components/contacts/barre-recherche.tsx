import { CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";

/**
 * Recherche d'un écran de l'annuaire : un formulaire GET, donc l'adresse de
 * la page porte la requête et le filtre (partageable, rechargeable).
 */
export function BarreRecherche({
  q,
  placeholder,
  filtres,
}: {
  q: string;
  placeholder: string;
  filtres?: { nom: string; valeur: string; options: { valeur: string; libelle: string }[]; toutes: string }[];
}) {
  return (
    <form className="mb-4 flex flex-wrap gap-2" role="search">
      <input name="q" defaultValue={q} placeholder={placeholder} aria-label="Rechercher" className={`${CLASSE_CHAMP_COMPACT} min-w-56 flex-1`} />
      {filtres?.map((f) => (
        <select key={f.nom} name={f.nom} defaultValue={f.valeur} aria-label={f.toutes} className={CLASSE_CHAMP_COMPACT}>
          <option value="">{f.toutes}</option>
          {f.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      ))}
      <button type="submit" className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
        Rechercher
      </button>
    </form>
  );
}
