import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { brouillonCourrier } from "@/modules/documents/courriers";

import { FormulaireCourrier } from "../formulaire-courrier";

export const metadata: Metadata = { title: "Nouveau courrier" };

export default async function PageNouveauCourrier() {
  const session = await exigerEntreprise();
  if (!(await peut("documents.courrier.rediger"))) return <AccesRefuse droit="documents.courrier.rediger" />;

  const [initial, identite] = await Promise.all([brouillonCourrier(session.organizationId), identiteEntreprise(session.organizationId)]);

  return (
    <>
      <div className="mb-4 print:hidden">
        <Link href="/documents/courriers" className="text-sm text-[var(--encre-douce)] hover:underline">
          ← Courriers
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight">Nouveau courrier</h1>
        <p className="mt-0.5 text-sm text-[var(--encre-douce)]">Le numéro s&apos;attribue à l&apos;enregistrement.</p>
      </div>
      <FormulaireCourrier initial={initial} identite={identite} />
    </>
  );
}
