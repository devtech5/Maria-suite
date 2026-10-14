import Link from "next/link";

import { BoutonGeste } from "@/components/marches/elements";
import { creerProjetDepuisMarche, preparerDevisDepuisMarche } from "@/modules/marches/actions";

/**
 * Ce que le marché a ouvert : son projet, son devis. Tant qu'ils n'existent
 * pas, un geste les crée à partir du marché — client, objet, montant repris.
 */
export function SuitesMarche({
  nature,
  id,
  projet,
  devis,
  peutProjet,
  peutDevis,
}: {
  nature: "soumission" | "convention";
  id: string;
  projet: { id: string; code: string; nom: string } | null;
  devis: { id: string; numero: string | null; statut: string } | null;
  peutProjet: boolean;
  peutDevis: boolean;
}) {
  if (!projet && !devis && !peutProjet && !peutDevis) return null;
  return (
    <section className="mb-6 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
      <h2 className="mb-1 text-base font-semibold">Exécution</h2>
      <p className="mb-3 text-xs text-[var(--encre-faible)]">Le client, l&apos;objet et le montant sont repris du marché ; rien n&apos;est à ressaisir. Le montant est compris hors taxes.</p>
      <div className="flex flex-wrap items-start gap-3 text-sm">
        {projet ? (
          <Link href={`/projets/${projet.id}`} className="rounded-lg border border-[var(--filet)] px-3 py-2 hover:bg-[var(--surface-creuse)]">
            Projet <span className="chiffres font-semibold">{projet.code}</span> — {projet.nom}
          </Link>
        ) : (
          peutProjet && <BoutonGeste libelle="Ouvrir le projet" ton="principal" confirmation="Ouvrir le projet à partir de ce marché ?" action={creerProjetDepuisMarche.bind(null, nature, id)} />
        )}
        {devis ? (
          <Link href="/commercial/factures" className="rounded-lg border border-[var(--filet)] px-3 py-2 hover:bg-[var(--surface-creuse)]">
            Devis {devis.numero ? <span className="chiffres font-semibold">{devis.numero}</span> : "en brouillon"}
          </Link>
        ) : (
          peutDevis && <BoutonGeste libelle="Préparer le devis" confirmation="Préparer le devis en brouillon à partir de ce marché ?" action={preparerDevisDepuisMarche.bind(null, nature, id)} />
        )}
      </div>
    </section>
  );
}
