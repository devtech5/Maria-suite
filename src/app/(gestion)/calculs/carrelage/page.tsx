import type { Metadata } from "next";

import { CalculCarrelage } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { contexteCalculs } from "@/modules/calculs/donnees";

export const metadata: Metadata = { title: "Carrelage" };

export default async function Page() {
  const { session } = await accesCalculs();
  const contexte = await contexteCalculs(session.organizationId);
  return (
    <>
      <EnTetePage titre="Carrelage" sousTitre="Carreaux, cartons, colle ou mortier, plinthes" />
      <CalculCarrelage contexte={contexte} />
    </>
  );
}
