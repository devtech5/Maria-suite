import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { FormulaireNouveauPv } from "@/components/pv/formulaire-nouveau";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { reunionsPourPv } from "@/modules/pv/donnees";
import { aujourdhuiPour } from "@/modules/reglement/requetes";

export const metadata: Metadata = { title: "Nouveau procès-verbal" };

/** Ouvre un brouillon ; tiré d'une réunion, il en reprend l'objet, les présences et le compte rendu. */
export default async function PageNouveauPv({ searchParams }: PageProps<"/pv/nouveau">) {
  const session = await exigerEntreprise();
  if (!(await peut("pv.rediger"))) return <AccesRefuse droit="pv.rediger" />;
  const valideur = await peut("pv.valider");
  const p = await searchParams;
  const [reunions, aujourdhui] = await Promise.all([reunionsPourPv(session.organizationId, { userId: session.userId, valideur }), aujourdhuiPour(session.organizationId)]);
  const choisie = typeof p.reunion === "string" ? reunions.find((r) => r.id === p.reunion) : undefined;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/pv" className="text-[var(--encre-douce)] hover:underline">
          ← Procès-verbaux
        </Link>
      </p>
      <h1 className="text-xl font-bold tracking-tight">Nouveau procès-verbal</h1>
      <p className="mb-5 mt-0.5 text-sm text-[var(--encre-douce)]">
        Le brouillon s&apos;ouvre ensuite : participants, points, décisions, actions et diffusion. Le numéro s&apos;attribue à la publication par la direction.
      </p>
      <FormulaireNouveauPv reunions={reunions} reunionInitiale={choisie?.id ?? ""} aujourdhui={choisie?.jour ?? aujourdhui} />
    </>
  );
}
