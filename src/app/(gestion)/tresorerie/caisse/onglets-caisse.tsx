import Link from "next/link";

const ONGLETS = [
  { href: "/tresorerie/caisse", libelle: "Bons de caisse" },
  { href: "/tresorerie/caisse/commandes", libelle: "Bons de commande internes" },
] as const;

/**
 * Les deux pièces du module Bon de caisse : la sortie d'argent de la petite
 * caisse, et le besoin chiffré du personnel. Le bon de commande fournisseur,
 * lui, vit dans Achats.
 */
export function OngletsCaisse({ actif }: { actif: (typeof ONGLETS)[number]["href"] }) {
  return (
    <nav aria-label="Pièces de la caisse" className="mb-4 inline-flex rounded-lg border border-[var(--filet)] bg-[var(--surface)] p-0.5 text-sm font-semibold">
      {ONGLETS.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.href === actif ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 ${o.href === actif ? "bg-marque-600 text-white" : "text-[var(--encre-douce)] hover:text-[var(--encre)]"}`}
        >
          {o.libelle}
        </Link>
      ))}
    </nav>
  );
}
