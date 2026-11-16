import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Calculs chantier" };

const CALCULS = [
  { href: "/calculs/beton", titre: "Béton et fer", texte: "Volume d'une dalle, de semelles ou de poteaux : sacs de ciment de 50 kg, sable, gravier, eau, fer et barres de 12 m." },
  { href: "/calculs/maconnerie", titre: "Maçonnerie d'agglos", texte: "Agglos de 10, 15 ou 20 pour un mur, portes et fenêtres déduites, avec le mortier de pose." },
  { href: "/calculs/carrelage", titre: "Carrelage", texte: "Carreaux et cartons d'une pièce, colle ou mortier de pose, plinthes." },
  { href: "/calculs/pente", titre: "Pente", texte: "Pourcentage, dénivelé ou longueur : deux valeurs donnent la troisième, avec l'angle." },
  { href: "/calculs/escalier", titre: "Escalier droit", texte: "Nombre et hauteur des marches, giron et reculement, contrôlés par la formule de Blondel." },
  { href: "/calculs/equerre", titre: "Angle droit", texte: "La diagonale d'une implantation d'équerre (3-4-5), et le verdict sur la mesure." },
];

export default function PageCalculs() {
  return (
    <>
      <EnTetePage titre="Calculs chantier" sousTitre="Les quantités d'un ouvrage, aux formats de nos chantiers : ciment en sacs de 50 kg, agglos de 40 × 20, fer en barres de 12 m" />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CALCULS.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className="block h-full rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 hover:border-marque-500">
              <span className="text-sm font-semibold">{c.titre}</span>
              <span className="mt-1 block text-sm text-[var(--encre-douce)]">{c.texte}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-[var(--encre-faible)]">
        Les résultats sont des estimations pour préparer une commande ou un devis. Le plan d&apos;exécution et la note de calcul du bureau d&apos;études font foi, surtout pour le ferraillage.
      </p>
    </>
  );
}
