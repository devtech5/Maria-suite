import type { Metadata } from "next";

import { CalculEscalier } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Escalier droit" };

export default function Page() {
  return (
    <>
      <EnTetePage titre="Escalier droit" sousTitre="Marches, giron et reculement, formule de Blondel" />
      <CalculEscalier />
    </>
  );
}
