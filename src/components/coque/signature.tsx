import Image from "next/image";

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

/**
 * Emblème de MARIA GROUP, détouré, accordé au thème : bleu nuit et or sur
 * fond clair, blanc et or sur fond sombre.
 */
export function EmblemeMaria({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block ${className}`}>
      <Image src="/marque/icone-couleur-detouree.png" alt="MARIA GROUP" width={230} height={237} unoptimized className="seulement-clair size-full object-contain" />
      <Image src="/marque/icone-blanc-or-detouree.png" alt="MARIA GROUP" width={230} height={237} unoptimized className="seulement-sombre size-full object-contain" />
    </span>
  );
}
