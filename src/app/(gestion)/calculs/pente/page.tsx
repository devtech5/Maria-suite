import type { Metadata } from "next";

import { CalculPente } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { contexteCalculs } from "@/modules/calculs/donnees";

export const metadata: Metadata = { title: "Pente" };

export default async function Page() {
  const { session } = await accesCalculs();
  const contexte = await contexteCalculs(session.organizationId);
  return (
    <>
      <EnTetePage titre="Pente" sousTitre="Terrasse, dallage, caniveau, toiture, rampe" />
      <CalculPente contexte={contexte} />
    </>
  );
}
