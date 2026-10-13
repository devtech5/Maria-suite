/**
 * Signature de la plateforme. Volontairement effacée : l'écran appartient à
 * l'entreprise, dont le nom est en tête ; Maria Suite signe en pied, comme
 * un imprimeur au bas d'une page.
 */
export function SignatureMaria({ className = "" }: { className?: string }) {
  return (
    <p className={`select-none text-[11px] tracking-wide text-[var(--encre-faible)] opacity-70 ${className}`}>
      Maria <span className="font-semibold">Suite</span>
    </p>
  );
}
