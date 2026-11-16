import type { Metadata } from "next";

import { CalculMaconnerie } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { contexteCalculs } from "@/modules/calculs/donnees";

export const metadata: Metadata = { title: "Maçonnerie d'agglos" };

export default async function Page() {
  const { session } = await accesCalculs();
  const contexte = await contexteCalculs(session.organizationId);
  return (
    <>
      <EnTetePage titre="Maçonnerie d'agglos" sousTitre="Agglos et mortier de pose d'un mur" />
      <CalculMaconnerie contexte={contexte} />
    </>
  );
}
