/** Barre de progression du parcours, avec son pourcentage. */
export function BarreProgression({ pourcent }: { pourcent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-creuse)]" role="progressbar" aria-valuenow={pourcent} aria-valuemin={0} aria-valuemax={100} aria-label="Progression du parcours">
        <div className="h-full rounded-full bg-marque-600 transition-[width]" style={{ width: `${pourcent}%` }} />
      </div>
      <span className="chiffres w-12 text-right text-sm font-semibold">{pourcent} %</span>
    </div>
  );
}
