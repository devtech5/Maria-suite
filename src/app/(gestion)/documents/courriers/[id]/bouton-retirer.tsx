"use client";

/** Retrait confirmé : le courrier quitte la liste, son numéro reste pris. */
export function BoutonRetirer({ numero }: { numero: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(`Retirer le courrier ${numero} ? Il quitte la liste ; son numéro n'est pas réattribué.`)) e.preventDefault();
      }}
      className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium text-danger-600 hover:bg-[var(--surface-creuse)]"
    >
      Retirer
    </button>
  );
}
