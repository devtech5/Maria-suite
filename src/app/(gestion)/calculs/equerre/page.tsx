import type { Metadata } from "next";

import { CalculEquerre } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Angle droit" };

export default function Page() {
  return (
    <>
      <EnTetePage titre="Angle droit" sousTitre="Contrôle d'équerrage d'une implantation" />
      <CalculEquerre />
    </>
  );
}
