import Image from "next/image";

/** Le texte de la signature : un seul endroit, pour qu'elle soit la même partout. */
export const TEXTE_SIGNATURE = "Maria Suite — propulsé par Fiessou ERP";

/**
 * Signature de la plateforme : « Maria Suite — propulsé par Fiessou ERP ».
 * Volontairement effacée : l'écran appartient à l'entreprise, dont le nom est
 * en tête ; la plateforme signe en pied, comme un imprimeur au bas d'une page.
 *
 * Elle se pose au pied des ÉCRANS de la plateforme — jamais sur un document
 * qui sort de l'entreprise : courrier papier à en-tête, facture, bulletin,
 * bordereau, badge. Ceux-là portent l'identité de l'entreprise, et d'elle
 * seule. D'où `print:hidden` : même un écran imprimé ne la reprend pas.
 * Un test garde les documents imprimés exempts de toute signature.
 */
export function SignatureMaria({ className = "", surSombre = false }: { className?: string; surSombre?: boolean }) {
  return (
    <p className={`select-none text-center text-[11px] tracking-wide print:hidden ${surSombre ? "text-white/50" : "text-[var(--encre-faible)] opacity-70"} ${className}`}>
      {TEXTE_SIGNATURE}
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
