import type { Metadata } from "next";

import { CalculEscalier } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { contexteCalculs } from "@/modules/calculs/donnees";

export const metadata: Metadata = { title: "Escalier droit" };

export default async function Page() {
  const { session } = await accesCalculs();
  const contexte = await contexteCalculs(session.organizationId);
  return (
    <>
      <EnTetePage titre="Escalier droit" sousTitre="Marches, giron et reculement, formule de Blondel" />
      <CalculEscalier contexte={contexte} />
    </>
  );
}
