import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApercuA4 } from "@/components/impression/feuille-a4";
import { DocumentPv } from "@/components/pv/document-pv";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { moduleOuvert } from "@/lib/modules/garde";
import { pvComplet } from "@/modules/pv/donnees";
import { referencePv, type TypePv } from "@/modules/pv/regles";

export const metadata: Metadata = { title: "Procès-verbal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le procès-verbal au format A4, prêt à imprimer ou à enregistrer en PDF.
 * Mêmes droits que l'écran : qui ne peut pas l'ouvrir ne l'imprime pas.
 */
export default async function ImpressionPv({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !moduleOuvert("pv")) notFound();
  const session = await exigerEntreprise();
  if (!(await peut("pv.consulter"))) notFound();
  const complet = await pvComplet(session.organizationId, id, { userId: session.userId, valideur: await peut("pv.valider") });
  if (!complet) notFound();
  const { pv } = complet;
  const identite = await identiteEntreprise(session.organizationId);

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href={`/pv/${pv.id}`} className="text-sm text-[var(--encre-douce)] hover:underline">
          ← {referencePv(pv.numero, pv.revision)}
        </Link>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <DocumentPv
          identite={identite}
          pv={{
            numero: pv.numero,
            revision: pv.revision,
            type: pv.type as TypePv,
            objet: pv.objet,
            dateSeance: pv.dateSeance,
            lieu: pv.lieu,
            participants: pv.participants,
            points: pv.points,
            conclusion: pv.conclusion,
            confidentiel: pv.confidentiel,
            redacteur: complet.redacteur,
            publiePar: complet.publiePar,
            publieLe: pv.publieLe,
            actions: complet.actions.map((a) => ({ libelle: a.libelle, responsable: a.responsable, echeance: a.echeance })),
            pieces: complet.fichiers.map((f) => f.nom),
          }}
        />
      </ApercuA4>
    </main>
  );
}
