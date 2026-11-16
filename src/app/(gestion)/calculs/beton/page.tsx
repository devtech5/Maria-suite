import type { Metadata } from "next";

import { CalculBeton } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { contexteCalculs } from "@/modules/calculs/donnees";

export const metadata: Metadata = { title: "Béton et fer" };

export default async function Page() {
  const { session } = await accesCalculs();
  const contexte = await contexteCalculs(session.organizationId);
  return (
    <>
      <EnTetePage titre="Béton et fer" sousTitre="Dalle, semelles, longrines, poteaux et poutres" />
      <CalculBeton contexte={contexte} />
    </>
  );
}
